export interface Candidate {
  id: string;
  rank: number;
  sequence: string;
  fpName: string;
  linker: string;
  insertionPosition: number;
  scores: {
    tmbed: number;
    fpBrightness: number;
    proteinmpnn: number;
    localFitness: number;
    plddt: number;
    ptm: number;
    iptm: number;
  };
  pdbData?: string;
  isOnParetoFront: boolean;
}

export interface PipelineStatus {
  currentPhase: "idle" | "ga_search" | "esmfold_batch" | "af2_batch" | "complete";
  gaProgress: {
    currentGeneration: number;
    totalGenerations: number;
    bestFitness: number;
    meanFitness: number;
  };
  apiCalls: {
    used: number;
    max: number;
    esmfoldCalls: number;
    af2Calls: number;
  };
  candidatesFound: number;
}

export interface InsertionSite {
  position: number;
  score: number;
  loopContext: string;
  constructLength: number;
}

export interface ParetoPoint {
  candidateId: string;
  plddt: number;
  iptm: number;
  isOnFront: boolean;
}
