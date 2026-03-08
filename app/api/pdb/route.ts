import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type RawCandidate = Record<string, unknown>;

const RESULTS_DIR = path.join(process.cwd(), "results");
const CANDIDATE_FILES = ["top5.json", "af2_results.json", "test_run.json"];
const STRUCTURE_EXTENSIONS = new Set([".pdb", ".ent"]);

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

function firstString(values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

async function readRawCandidates() {
  for (const fileName of CANDIDATE_FILES) {
    const filePath = path.join(RESULTS_DIR, fileName);
    if (!(await exists(filePath))) continue;

    const parsed = await readJsonFile<unknown>(filePath);
    if (Array.isArray(parsed)) return parsed as RawCandidate[];

    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { candidates?: unknown[] }).candidates)
    ) {
      return (parsed as { candidates: RawCandidate[] }).candidates;
    }
  }

  return [] as RawCandidate[];
}

function extractPdbText(candidate: RawCandidate) {
  const direct = firstString([candidate.pdb, candidate.pdbText, candidate.pdb_data]);
  if (direct && (direct.includes("ATOM") || direct.includes("HETATM"))) {
    return direct;
  }

  if (candidate.raw && typeof candidate.raw === "object") {
    const rawObj = candidate.raw as Record<string, unknown>;
    const nested = firstString([rawObj.pdb, rawObj.pdbText, rawObj.pdbFile]);
    if (nested && (nested.includes("ATOM") || nested.includes("HETATM"))) {
      return nested;
    }
  }

  return null;
}

async function readPdbFromPath(pathValue: string) {
  const candidatePath = path.isAbsolute(pathValue)
    ? pathValue
    : path.resolve(RESULTS_DIR, pathValue);
  const resolved = path.resolve(candidatePath);
  const allowedPrefix = `${path.resolve(RESULTS_DIR)}${path.sep}`;

  if (!resolved.startsWith(allowedPrefix)) {
    return null;
  }
  if (!(await exists(resolved))) {
    return null;
  }

  return fs.readFile(resolved, "utf8");
}

async function findLatestStructureFile(dirPath: string): Promise<string | null> {
  if (!(await exists(dirPath))) return null;

  let latestPath: string | null = null;
  let latestMtime = 0;

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const nested = await findLatestStructureFile(fullPath);
      if (nested) {
        const stat = await fs.stat(nested);
        if (stat.mtimeMs > latestMtime) {
          latestMtime = stat.mtimeMs;
          latestPath = nested;
        }
      }
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!STRUCTURE_EXTENSIONS.has(ext)) continue;

    const stat = await fs.stat(fullPath);
    if (stat.mtimeMs > latestMtime) {
      latestMtime = stat.mtimeMs;
      latestPath = fullPath;
    }
  }

  return latestPath;
}

function defaultCandidateId(index: number) {
  return `cand-${String(index + 1).padStart(3, "0")}`;
}

function getCandidateById(candidates: RawCandidate[], candidateId: string) {
  const directMatch = candidates.find((candidate, index) => {
    const id =
      firstString([candidate.id, candidate.candidateId, candidate.candidate_id]) ??
      defaultCandidateId(index);
    return id === candidateId;
  });

  if (directMatch) return directMatch;

  const idNum = Number(candidateId.replace(/^\D+/g, ""));
  if (Number.isFinite(idNum) && idNum > 0) {
    return candidates[idNum - 1] ?? null;
  }

  return null;
}

export async function GET(request: NextRequest) {
  const candidateId = request.nextUrl.searchParams.get("candidateId");
  const fileParam = request.nextUrl.searchParams.get("file");

  if (fileParam) {
    const fromFile = await readPdbFromPath(fileParam);
    if (fromFile) {
      return new Response(fromFile, {
        headers: {
          "Content-Type": "chemical/x-pdb; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
  }

  const rawCandidates = await readRawCandidates();
  if (candidateId) {
    const candidate = getCandidateById(rawCandidates, candidateId);
    if (candidate) {
      const inlinePdb = extractPdbText(candidate);
      if (inlinePdb) {
        return new Response(inlinePdb, {
          headers: {
            "Content-Type": "chemical/x-pdb; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }

      const pdbPath = firstString([candidate.pdb_path, candidate.pdbFile, candidate.pdbData]);
      if (pdbPath) {
        const fileText = await readPdbFromPath(pdbPath);
        if (fileText) {
          return new Response(fileText, {
            headers: {
              "Content-Type": "chemical/x-pdb; charset=utf-8",
              "Cache-Control": "no-store",
            },
          });
        }
      }
    }
  }

  const latestStructurePath = await findLatestStructureFile(RESULTS_DIR);
  if (latestStructurePath) {
    const text = await fs.readFile(latestStructurePath, "utf8");
    return new Response(text, {
      headers: {
        "Content-Type": "chemical/x-pdb; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(
    {
      message: "No PDB structure available yet. Run pipeline until AF2 output is written.",
    },
    { status: 404 }
  );
}
