import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import type { Candidate, InsertionSite, ParetoPoint, PipelineStatus } from "@/lib/types";

type RawCandidate = Record<string, unknown>;
type RunEvent = {
  phase?: string;
  sequence?: string;
  fitness?: number;
};
type PipelineMode = "live" | "none";

const RESULTS_DIR = path.join(process.cwd(), "results");
const RUNS_DIR = path.join(RESULTS_DIR, "runs");
const PID_FILE = path.join(RESULTS_DIR, "pipeline.pid");
const LOG_FILE = path.join(RESULTS_DIR, "pipeline.log");
const CANDIDATE_FILES = [
  "af2_results.json",
  "top5.json",
];
const KNOWN_LINKERS = ["GGSGGS", "GSGSGS", "GGGGS", "GS"];
const FALLBACK_INSERTION_POSITIONS = [84, 121, 161, 228, 284];

const EMPTY_STATUS: PipelineStatus = {
  currentPhase: "idle",
  gaProgress: {
    currentGeneration: 0,
    totalGenerations: 90,
    bestFitness: 0,
    meanFitness: 0,
  },
  apiCalls: {
    used: 0,
    max: 95,
    esmfoldCalls: 0,
    af2Calls: 0,
  },
  candidatesFound: 0,
};

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readPid() {
  try {
    const pidRaw = await fs.readFile(PID_FILE, "utf8");
    const pid = Number(pidRaw.trim());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

async function isPipelineRunning() {
  const pid = await readPid();
  if (!pid) {
    return { running: false, pid: null as number | null };
  }
  try {
    process.kill(pid, 0);
    return { running: true, pid };
  } catch {
    try {
      await fs.unlink(PID_FILE);
    } catch {
      // Ignore cleanup errors.
    }
    return { running: false, pid: null as number | null };
  }
}

async function startBackgroundPython(scriptName: string) {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const runBanner = `\n=== ${new Date().toISOString()} | starting ${scriptName} ===\n`;
  await fs.writeFile(LOG_FILE, runBanner, "utf8");
  const logHandle = await fs.open(LOG_FILE, "a");
  const venvPython = path.join(process.cwd(), ".venv", "bin", "python3");
  const pythonExecutable =
    process.env.PIPELINE_PYTHON ||
    ((await exists(venvPython)) ? venvPython : "python3");

  const child = spawn(pythonExecutable, ["-u", scriptName], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", logHandle.fd, logHandle.fd],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });

  child.unref();
  await fs.writeFile(PID_FILE, String(child.pid));
  await logHandle.close();

  return child.pid;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toUnit(value: unknown, fallback = 0): number {
  const num = toNumber(value);
  if (num === null) return fallback;
  const normalized = num > 1 ? num / 100 : num;
  return Math.max(0, Math.min(1, normalized));
}

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function deriveInsertionPosition(raw: RawCandidate, sequence: string, index: number) {
  const explicit = toNumber(
    raw.insertionPosition ?? raw.insertion_position ?? raw.insert_position
  );
  if (explicit !== null && explicit > 0) return Math.round(explicit);

  for (const linker of KNOWN_LINKERS) {
    const pos = sequence.indexOf(linker);
    if (pos >= 0) return pos + 1;
  }

  return FALLBACK_INSERTION_POSITIONS[index % FALLBACK_INSERTION_POSITIONS.length];
}

function calculatePareto(candidates: Candidate[]) {
  const frontIds = new Set<string>();

  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    let dominated = false;

    for (let j = 0; j < candidates.length; j++) {
      if (i === j) continue;
      const b = candidates[j];
      const betterOrEqual =
        b.scores.plddt >= a.scores.plddt && b.scores.iptm >= a.scores.iptm;
      const strictlyBetter =
        b.scores.plddt > a.scores.plddt || b.scores.iptm > a.scores.iptm;

      if (betterOrEqual && strictlyBetter) {
        dominated = true;
        break;
      }
    }

    if (!dominated) {
      frontIds.add(a.id);
    }
  }

  return frontIds;
}

async function readLatestRunEvents() {
  if (!(await exists(RUNS_DIR))) return [] as RunEvent[];

  const files = (await fs.readdir(RUNS_DIR))
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => path.join(RUNS_DIR, name));

  if (files.length === 0) return [] as RunEvent[];

  const withStats = await Promise.all(
    files.map(async (filePath) => ({
      filePath,
      stat: await fs.stat(filePath),
    }))
  );

  withStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  const latestFile = withStats[0].filePath;
  const lines = (await fs.readFile(latestFile, "utf8"))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const events: RunEvent[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as RunEvent;
      events.push(parsed);
    } catch {
      continue;
    }
  }
  return events;
}

async function readRawCandidates() {
  for (const fileName of CANDIDATE_FILES) {
    const filePath = path.join(RESULTS_DIR, fileName);
    if (!(await exists(filePath))) continue;

    const parsed = await readJsonFile<unknown>(filePath);
    if (Array.isArray(parsed)) {
      return { candidates: parsed as RawCandidate[], sourceFile: fileName };
    }

    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { candidates?: unknown[] }).candidates)) {
      return {
        candidates: (parsed as { candidates: RawCandidate[] }).candidates,
        sourceFile: fileName,
      };
    }
  }

  return { candidates: [] as RawCandidate[], sourceFile: null as string | null };
}

function candidateSortValue(candidate: Candidate) {
  return (
    candidate.scores.iptm * 0.4 +
    candidate.scores.plddt * 0.35 +
    candidate.scores.localFitness * 0.25
  );
}

function buildInsertionSites(candidates: Candidate[]): InsertionSite[] {
  const grouped = new Map<
    number,
    { totalScore: number; count: number; loopContext: string; constructLength: number }
  >();

  for (const candidate of candidates) {
    const position = candidate.insertionPosition;
    const seq = candidate.sequence;
    const start = Math.max(0, position - 5);
    const end = Math.min(seq.length, position + 5);
    const loopContext = seq.slice(start, end) || "N/A";
    const weightedScore =
      candidate.scores.localFitness * 0.45 +
      candidate.scores.plddt * 0.3 +
      candidate.scores.iptm * 0.25;

    const prev = grouped.get(position);
    if (prev) {
      prev.totalScore += weightedScore;
      prev.count += 1;
    } else {
      grouped.set(position, {
        totalScore: weightedScore,
        count: 1,
        loopContext,
        constructLength: seq.length,
      });
    }
  }

  return [...grouped.entries()]
    .map(([position, value]) => ({
      position,
      score: value.totalScore / value.count,
      loopContext: value.loopContext,
      constructLength: value.constructLength,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

async function buildDashboardData() {
  const [{ candidates: rawCandidates, sourceFile }, runEvents, callCounter, esmfoldSummary, runningState] =
    await Promise.all([
      readRawCandidates(),
      readLatestRunEvents(),
      readJsonFile<{ calls?: number }>(path.join(RESULTS_DIR, "tamarind_calls.json")),
      readJsonFile<Array<{ sequence?: string; plddt?: number }>>(
        path.join(RESULTS_DIR, "esmfold_results.json")
      ),
      isPipelineRunning(),
    ]);

  const candidatesBase = rawCandidates.map((raw, index) => {
    const chains = Array.isArray(raw.chains) ? raw.chains : [];
    const sequence = firstString([raw.sequence, chains[0]]) ?? "";
    const localFitness = toUnit(raw.local_fitness ?? raw.localFitness ?? raw.fitness);
    const plddt = toUnit(raw.plddt);
    const iptm = toUnit(raw.iptm);
    const ptm = toUnit(raw.ptm);
    const fpName = firstString([raw.fp_name, raw.fpName]) ?? "cpGFP";
    const linker = firstString([raw.linker]) ?? "GGSGGS";
    const candidateId =
      firstString([raw.id, raw.candidateId, raw.candidate_id]) ??
      `cand-${String(index + 1).padStart(3, "0")}`;

    return {
      id: candidateId,
      rank: index + 1,
      sequence,
      fpName,
      linker,
      insertionPosition: deriveInsertionPosition(raw, sequence, index),
      scores: {
        tmbed: toUnit(raw.tmbed ?? raw.tm_integrity, localFitness),
        fpBrightness: toUnit(raw.fp_brightness ?? raw.fp_score, localFitness),
        proteinmpnn: toUnit(raw.proteinmpnn ?? raw.protein_mpnn ?? raw.conservation, localFitness),
        localFitness,
        plddt,
        ptm,
        iptm,
      },
      pdbData: `/api/pdb?candidateId=${encodeURIComponent(candidateId)}`,
      isOnParetoFront: false,
    } satisfies Candidate;
  });

  const ranked = [...candidatesBase]
    .sort((a, b) => candidateSortValue(b) - candidateSortValue(a))
    .slice(0, 50)
    .map((candidate, idx) => ({ ...candidate, rank: idx + 1 }));

  const frontIds = calculatePareto(ranked);
  const candidates = ranked.map((candidate) => ({
    ...candidate,
    isOnParetoFront: frontIds.has(candidate.id),
  }));

  const paretoData: ParetoPoint[] = candidates.map((candidate) => ({
    candidateId: candidate.id,
    plddt: candidate.scores.plddt,
    iptm: candidate.scores.iptm,
    isOnFront: candidate.isOnParetoFront,
  }));

  const insertionSites = buildInsertionSites(candidates);

  const gaEvents = runEvents.filter(
    (event) => typeof event.phase === "string" && event.phase.startsWith("ga_")
  );
  const esmfoldEvents = runEvents.filter(
    (event) => typeof event.phase === "string" && event.phase.startsWith("esmfold_")
  );
  const af2Events = runEvents.filter((event) => event.phase === "af2");

  const gaFitnessValues = gaEvents
    .map((event) => toNumber(event.fitness))
    .filter((value): value is number => value !== null);

  const bestFitness =
    gaFitnessValues.length > 0 ? Math.max(...gaFitnessValues) : 0;
  const meanFitness =
    gaFitnessValues.length > 0
      ? gaFitnessValues.reduce((sum, value) => sum + value, 0) / gaFitnessValues.length
      : 0;

  const rounds = new Set<number>();
  for (const event of gaEvents) {
    const match = event.phase?.match(/ga_r(\d+)/);
    if (match) rounds.add(Number(match[1]));
  }

  const currentRound = [...rounds].sort((a, b) => b - a)[0] ?? 0;
  const hasCompleteResults = candidates.some((candidate) => candidate.scores.iptm > 0);

  const inferredPhase: PipelineStatus["currentPhase"] = hasCompleteResults
    ? "complete"
    : af2Events.length > 0
    ? "af2_batch"
    : esmfoldEvents.length > 0 || (esmfoldSummary?.length ?? 0) > 0
    ? "esmfold_batch"
    : gaEvents.length > 0
    ? "ga_search"
    : "idle";
  const currentPhase: PipelineStatus["currentPhase"] =
    runningState.running && inferredPhase === "idle" ? "ga_search" : inferredPhase;

  const inferredGeneration = hasCompleteResults
    ? 90
    : Math.min(90, currentRound * 30);

  const usedCalls = Math.max(0, Math.round(toNumber(callCounter?.calls) ?? 0));
  const esmfoldCalls = Math.max(esmfoldEvents.length, esmfoldSummary?.length ?? 0);
  const af2Calls = Math.max(
    af2Events.length,
    candidates.length > 0 ? Math.min(candidates.length, 5) : 0
  );
  const uniqueRunCandidates = new Set(
    gaEvents
      .map((event) => event.sequence)
      .filter((seq): seq is string => typeof seq === "string" && seq.length > 0)
  ).size;

  const status: PipelineStatus = {
    currentPhase,
    gaProgress: {
      currentGeneration: inferredGeneration,
      totalGenerations: 90,
      bestFitness,
      meanFitness,
    },
    apiCalls: {
      used: usedCalls,
      max: 95,
      esmfoldCalls,
      af2Calls,
    },
    candidatesFound:
      candidates.length || uniqueRunCandidates || esmfoldSummary?.length || 0,
  };

  const tamarindConfigured = Boolean(process.env.TAMARIND_API_KEY);
  const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
  const mode: PipelineMode = sourceFile || runningState.running ? "live" : "none";

  let recentLogTail: string[] = [];
  if (await exists(LOG_FILE)) {
    const rawLog = await fs.readFile(LOG_FILE, "utf8");
    recentLogTail = rawLog
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-200);
  }

  return {
    candidates,
    status: { ...EMPTY_STATUS, ...status },
    paretoData,
    insertionSites,
    meta: {
      mode,
      sourceFile,
      tamarindConfigured,
      anthropicConfigured,
      running: runningState.running,
      pid: runningState.pid,
      logFile: "results/pipeline.log",
      recentLogTail,
    },
  };
}

export async function GET() {
  const payload = await buildDashboardData();
  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action } = body as { action?: string };

  if (action === "refresh") {
    const payload = await buildDashboardData();
    return NextResponse.json({
      success: true,
      message: "Dashboard data refreshed from backend result files",
      ...payload,
    });
  }

  if (action === "start_pipeline") {
    if (process.env.VERCEL) {
      return NextResponse.json(
        {
          success: false,
          message: "Background pipeline execution is disabled on Vercel runtime",
        },
        { status: 400 }
      );
    }

    if (!process.env.TAMARIND_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          message: "TAMARIND_API_KEY is missing. Set env vars before starting real pipeline.",
        },
        { status: 400 }
      );
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          message: "ANTHROPIC_API_KEY is missing. Set env vars before starting real pipeline.",
        },
        { status: 400 }
      );
    }

    const running = await isPipelineRunning();
    if (running.running) {
      return NextResponse.json({
        success: true,
        message: `Pipeline already running (pid ${running.pid})`,
      });
    }

    const pid = await startBackgroundPython("pipeline.py");
    const payload = await buildDashboardData();
    return NextResponse.json({
      success: true,
      message: `Started real pipeline (pid ${pid})`,
      ...payload,
    });
  }

  if (action === "stop_pipeline") {
    const running = await isPipelineRunning();
    if (!running.running || !running.pid) {
      return NextResponse.json({
        success: true,
        message: "No running pipeline process found",
      });
    }

    try {
      process.kill(running.pid);
    } catch {
      // Ignore errors if process has already exited.
    }
    try {
      await fs.unlink(PID_FILE);
    } catch {
      // Ignore cleanup errors.
    }

    const payload = await buildDashboardData();
    return NextResponse.json({
      success: true,
      message: `Stopped pipeline process ${running.pid}`,
      ...payload,
    });
  }

  return NextResponse.json(
    {
      success: false,
      message: `Action '${action ?? "unknown"}' is not available from the UI API`,
    },
    { status: 400 }
  );
}
