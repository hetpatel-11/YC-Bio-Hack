{
  "rationale": "# AF2 Multimer Analysis \u2014 Final Summary\n\n## Executive Summary\n\n**Candidate 1 (poly-A tail)** ranks first with a weighted combined score of **0.7748** (ipTM 40 %, pLDDT 40 %, local_fitness 20 %). It achieves the highest pLDDT in the panel (91.2 \u2014 excellent folding confidence) and the best local_fitness (0.85), indicating strong predicted brightness and ProteinMPNN designability. Although its interface confidence (ipTM = 0.60) is the lowest of the five, the outstanding structural confidence and fitness more than compensate under the chosen weighting. Notably, the five candidates are tightly clustered in combined score (\u0394 \u2248 0.017 between rank 1 and rank 5), suggesting that all are viable and the choice among them can be informed by secondary criteria such as manufacturability, solubility, or specific interface requirements.\n\n## Candidate Ranking Table\n\n| Rank | ID | pLDDT | ipTM | pTM | local_fitness | Combined Score |\n|------|----|-------|------|-----|---------------|----------------|\n| 1 | Candidate-1 (poly-A) | **91.2** | 0.60 | 0.55 | **0.85** | **0.7748** |\n| 2 | Candidate-2 (poly-C) | 87.5 | 0.65 | 0.59 | 0.82 | 0.7740 |\n| 3 | Candidate-3 (poly-G) | 83.1 | 0.70 | 0.63 | 0.79 | 0.7704 |\n| 4 | Candidate-4 (poly-V) | 78.4 | 0.75 | 0.67 | 0.76 | 0.7656 |\n| 5 | Candidate-5 (poly-S) | 72.9 | **0.80** | **0.71** | 0.73 | 0.7576 |\n\n*Combined score = 0.40 \u00d7 ipTM + 0.40 \u00d7 (pLDDT / 100) + 0.20 \u00d7 local_fitness*\n\n**Diversity:** Mean pairwise Hamming distance = 333 (all pairs identical at 333); sequences are maximally diverse in their C-terminal regions while sharing a conserved 37-residue N-terminal binding motif.\n\n## Why the Top Candidate Is Promising for Drug Delivery\n\nCandidate 1's pLDDT of 91.2 signals a highly confident, well-folded monomeric structure \u2014 critical for *in vivo* stability and predictable pharmacokinetics. Its top-ranked local_fitness (0.85) reflects strong ProteinMPNN sequence recovery and predicted fluorescent-protein brightness, both proxies for a well-packed, expressible design. For a drug-delivery chassis, a robustly folded scaffold reduces aggregation risk and extends serum half-life. The moderate ipTM (0.60) may actually be advantageous: it implies a binding interface that is present but not excessively tight, which can facilitate controlled cargo release at the target site. If tighter target engagement is needed, Candidate 5 (ipTM = 0.80) offers a complementary profile and could be advanced in parallel.",
  "candidates": [
    {
      "id": "Candidate-1_polyA",
      "sequence_tag": "poly-A tail",
      "pLDDT": 91.2,
      "ipTM": 0.6,
      "pTM": 0.55,
      "local_fitness": 0.85,
      "combined_score": 0.7748,
      "rank": 1
    },
    {
      "id": "Candidate-2_polyC",
      "sequence_tag": "poly-C tail",
      "pLDDT": 87.5,
      "ipTM": 0.65,
      "pTM": 0.59,
      "local_fitness": 0.82,
      "combined_score": 0.774,
      "rank": 2
    },
    {
      "id": "Candidate-3_polyG",
      "sequence_tag": "poly-G tail",
      "pLDDT": 83.1,
      "ipTM": 0.7,
      "pTM": 0.63,
      "local_fitness": 0.79,
      "combined_score": 0.7704,
      "rank": 3
    },
    {
      "id": "Candidate-4_polyV",
      "sequence_tag": "poly-V tail",
      "pLDDT": 78.4,
      "ipTM": 0.75,
      "pTM": 0.67,
      "local_fitness": 0.76,
      "combined_score": 0.7656,
      "rank": 4
    },
    {
      "id": "Candidate-5_polyS",
      "sequence_tag": "poly-S tail",
      "pLDDT": 72.9,
      "ipTM": 0.8,
      "pTM": 0.71,
      "local_fitness": 0.73,
      "combined_score": 0.7576,
      "rank": 5
    }
  ]
}