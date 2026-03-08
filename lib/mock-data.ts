import type { Candidate, PipelineStatus, InsertionSite, ParetoPoint } from "./types";

const sampleSequence =
  "MAEGEITTFTALTEKFNLPPGNYKKPKLLYCSNGGHFLRILPDGTVDGTRDRSDQHIQLQLSAESVGEVYIKSTETGQYLAMDTDGLLYGSQTPNEECLFLERLEENHYNTYISKKHAEKNWFVGLKKNGSCKRGPRTHYGQKAILFLPLPV";

export const mockCandidates: Candidate[] = [
  {
    id: "cand-001",
    rank: 1,
    sequence: sampleSequence,
    fpName: "mVenus",
    linker: "GGSGGS",
    insertionPosition: 142,
    scores: {
      tmbed: 0.92,
      fpBrightness: 0.88,
      proteinmpnn: 0.85,
      localFitness: 0.89,
      plddt: 0.87,
      ptm: 0.82,
      iptm: 0.91,
    },
    isOnParetoFront: true,
  },
  {
    id: "cand-002",
    rank: 2,
    sequence: sampleSequence.slice(0, 100) + "GGSGGS" + sampleSequence.slice(100),
    fpName: "GFP",
    linker: "GGSGGS",
    insertionPosition: 100,
    scores: {
      tmbed: 0.89,
      fpBrightness: 0.91,
      proteinmpnn: 0.82,
      localFitness: 0.87,
      plddt: 0.91,
      ptm: 0.79,
      iptm: 0.85,
    },
    isOnParetoFront: true,
  },
  {
    id: "cand-003",
    rank: 3,
    sequence: sampleSequence,
    fpName: "mCherry",
    linker: "GSGSGS",
    insertionPosition: 78,
    scores: {
      tmbed: 0.85,
      fpBrightness: 0.94,
      proteinmpnn: 0.79,
      localFitness: 0.85,
      plddt: 0.82,
      ptm: 0.85,
      iptm: 0.88,
    },
    isOnParetoFront: true,
  },
  {
    id: "cand-004",
    rank: 4,
    sequence: sampleSequence,
    fpName: "mVenus",
    linker: "GGSGGS",
    insertionPosition: 55,
    scores: {
      tmbed: 0.88,
      fpBrightness: 0.82,
      proteinmpnn: 0.88,
      localFitness: 0.86,
      plddt: 0.79,
      ptm: 0.88,
      iptm: 0.82,
    },
    isOnParetoFront: false,
  },
  {
    id: "cand-005",
    rank: 5,
    sequence: sampleSequence,
    fpName: "GFP",
    linker: "GGSGGS",
    insertionPosition: 120,
    scores: {
      tmbed: 0.82,
      fpBrightness: 0.86,
      proteinmpnn: 0.84,
      localFitness: 0.84,
      plddt: 0.85,
      ptm: 0.76,
      iptm: 0.79,
    },
    isOnParetoFront: false,
  },
];

export const mockPipelineStatus: PipelineStatus = {
  currentPhase: "complete",
  gaProgress: {
    currentGeneration: 100,
    totalGenerations: 100,
    bestFitness: 0.89,
    meanFitness: 0.72,
  },
  apiCalls: {
    used: 87,
    max: 95,
    esmfoldCalls: 50,
    af2Calls: 37,
  },
  candidatesFound: 50,
};

export const mockInsertionSites: InsertionSite[] = [
  { position: 142, score: 0.92, loopContext: "KRGPRTHYG", constructLength: 380 },
  { position: 100, score: 0.88, loopContext: "GSQTPNEEC", constructLength: 376 },
  { position: 78, score: 0.85, loopContext: "YGSQTPNEE", constructLength: 374 },
  { position: 55, score: 0.79, loopContext: "RILPDGTVD", constructLength: 372 },
  { position: 120, score: 0.76, loopContext: "FLERLEENHY", constructLength: 378 },
];

export const mockParetoData: ParetoPoint[] = [
  // Pareto front points
  { candidateId: "cand-001", plddt: 0.87, iptm: 0.91, isOnFront: true },
  { candidateId: "cand-002", plddt: 0.91, iptm: 0.85, isOnFront: true },
  { candidateId: "cand-003", plddt: 0.82, iptm: 0.88, isOnFront: true },
  // Non-pareto points
  { candidateId: "cand-004", plddt: 0.79, iptm: 0.82, isOnFront: false },
  { candidateId: "cand-005", plddt: 0.85, iptm: 0.79, isOnFront: false },
  // Additional scatter points
  { candidateId: "cand-006", plddt: 0.72, iptm: 0.75, isOnFront: false },
  { candidateId: "cand-007", plddt: 0.68, iptm: 0.82, isOnFront: false },
  { candidateId: "cand-008", plddt: 0.75, iptm: 0.71, isOnFront: false },
  { candidateId: "cand-009", plddt: 0.81, iptm: 0.74, isOnFront: false },
  { candidateId: "cand-010", plddt: 0.77, iptm: 0.78, isOnFront: false },
  { candidateId: "cand-011", plddt: 0.69, iptm: 0.69, isOnFront: false },
  { candidateId: "cand-012", plddt: 0.84, iptm: 0.72, isOnFront: false },
  { candidateId: "cand-013", plddt: 0.71, iptm: 0.77, isOnFront: false },
  { candidateId: "cand-014", plddt: 0.66, iptm: 0.73, isOnFront: false },
  { candidateId: "cand-015", plddt: 0.78, iptm: 0.68, isOnFront: false },
];
