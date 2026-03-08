
# Drug Discovery Pipeline — Hackathon Plan

## Project Overview

Design an **optimal SSTR2 GPCR biosensor** by inserting **cpGFP (cp145)** at the optimal position in a flexible loop, then co-evolving the receptor loop residues and linker sequences to maximize folding confidence, ligand coupling, and FP fluorescence response.

**Target receptor**: SSTR2 (Somatostatin Receptor 2, NP_001041.1, 369 AA, 7 TM helices)
**Fluorescent protein**: cpGFP cp145 variant (219 AA) — fixed, never mutated
**Team Size**: 3 people | **Duration**: 1 day

---

## Architecture

```
[SSTR2 WT + cpGFP (fixed)]
         │
         ▼
[ICL3 Insertion Sweep]       ← score every ICL3 position locally, pick top-3
         │
         ▼
[Genetic Algorithm]          ← FREE, no API — runs thousands of evals
  Co-evolves per individual:
  ├── SSTR2 loop residues    (ECL1/2/3, ICL2/3, C-tail — 20 AA alphabet)
  ├── N-linker               (5–10 AA, GGSAETQN alphabet, length + sequence)
  ├── C-linker               (5–10 AA, independently evolved)
  └── Insert position        (within ICL3, ±1–3 shift per mutation)
         │
    pLDDT feedback ──────────────────────────────────────────┐
    (blended 35% local / 65% real pLDDT after each ESMFold)  │
         │                                                    │
         ▼                                                    │
[Round 1: 30 pop × 40 gen → top-20 chimeric sequences]       │
         │ ESMFold (20 calls)  ─────────────────────────────►─┤
         ▼                                                    │
[Round 2: 30 pop × 30 gen → top-15 new sequences (deduped)]  │
         │ ESMFold (15 calls)  ─────────────────────────────►─┤
         ▼                                                    │
[Round 3: 30 pop × 20 gen → top-10 new sequences (deduped)]  │
         │ ESMFold (10 calls)  ─────────────────────────────►─┘
         │
         ▼
[AI Agent — Claude Opus 4.6]  ← reads ESMFold results, selects top-5 for AF2
  Tools: read_candidates, compute_diversity, write_shortlist
         │
         ▼
[Tamarind AlphaFold2 multimer — top-5]   (~40 calls)
         │
         ▼
[RMSD vs WT baseline]   ← free, pure-Python Cα RMSD from PDB strings
         │
         ▼
[Composite Ranking + Pareto Front]   pLDDT vs ipTM
         │
         ▼
[AI Agent: generate_summary()]  → results/summary.md
         │
         ▼
[Dashboard — React + Molstar 3D viewer]
```

---

## Call Budget

| Phase | Tool | Calls | Notes |
|-------|------|-------|-------|
| WT baseline ESMFold | ESMFold | 1 | Chimeric SSTR2@ICL3+GFP, RMSD reference |
| Round 1 ESMFold | ESMFold | ≤20 | Top-20 from GA round 1 (deduplicated) |
| Round 2 ESMFold | ESMFold | ≤15 | New sequences only (cache hits free) |
| Round 3 ESMFold | ESMFold | ≤10 | New sequences only |
| AF2 multimer | AlphaFold2 | ≤40 | Top-5 × ~8 calls each |
| Reserve | any | 9 | Hard stop at 95 |
| **Total** | | **≤ 95** | Counter + cache enforced in `scorers/tamarind.py` |

---

## Sequence Design

```
Chimeric construct (600 AA):

  SSTR2[:pos] + LINKER_N + cpGFP(219 AA) + LINKER_C + SSTR2[pos:]
       fixed       5–10 AA    fixed             5–10 AA    fixed
                  evolved                       evolved
  pos ∈ ICL3 (residues 205–252) — evolved by GA, swept pre-GA
```

**What the GA evolves:**
- **SSTR2 loop residues** — the conformational transducers; optimizing these tunes how strongly ligand binding deforms the ICL3 geometry around the cpGFP
- **N/C linkers** — length and sequence; GGS-rich linkers are flexible but may not maximise signal ΔF/F; GA explores alternatives
- **Insertion position in ICL3** — different positions within ICL3 yield different proximity to the TM5/TM6 hinge

**What is fixed:**
- 7 TM helices (hydrophobic core — mutations destroy folding)
- cpGFP sequence (well-characterized, fluorescence properties known)

---

## Local Scorers (GA phase — zero API calls)

| Scorer | File | Weight | What it measures |
|--------|------|--------|-----------------|
| BLOSUM62 conservation | `scorers/conservation.py` | 0.45 | How conservative loop mutations are vs WT SSTR2 |
| FP brightness + linker | `scorers/fp_model.py` | 0.30 | cpGFP relative brightness; GGS-fraction reward |
| TM topology integrity | `scorers/tmbed.py` | 0.25 | Safety check — no TM helix mutations |
| **Linker score** | `search/genetic.py` | blended (20%) | GGS fraction + brightness penalty |

**pLDDT feedback blending** (rounds 2–3):
```
fitness = 0.35 × local_score + 0.65 × (pLDDT / 100)
```

---

## Final Composite Score (post-AF2)

```python
final_score = 0.35 × pLDDT/100 + 0.30 × ipTM + 0.20 × rmsd_score + 0.15 × local_fitness
rmsd_score  = max(0, 1 − tm_rmsd / 5.0)   # lower RMSD vs WT = better (cap at 5 Å)
```

---

## Repo Structure

```
YC-Bio-Hack/
├── plan.md                      ← this file
├── pipeline.py                  ← main entrypoint
├── test_one_round.py            ← full pipeline smoke test (mock API)
├── test_analyst.py              ← Claude Opus 4.6 agent test (real API)
├── data/
│   ├── seed_sequences/
│   │   ├── protein.faa          ← SSTR2 NP_001041.1 FASTA
│   │   └── data_report.jsonl
│   └── fp_sequences/
│       └── fp_sequences.fasta   ← GFP, mCherry, mVenus, cpGFP cp145
├── scorers/
│   ├── ensemble.py              ← local_score(), final_score(), batch wrappers
│   ├── tamarind.py              ← ESMFold + AF2 via Tamarind API (budget enforced)
│   ├── conservation.py          ← BLOSUM62 scorer (replaced ProteinMPNN stub)
│   ├── tmbed.py                 ← hardcoded SSTR2 topology (replaced TMbed REST)
│   └── fp_model.py              ← FP brightness lookup + linker compatibility
├── search/
│   └── genetic.py               ← GA with evolving receptor + linker + insert_pos
├── analysis/
│   ├── rmsd.py                  ← pure-Python Cα RMSD from PDB strings
│   ├── pareto.py                ← Pareto front + plotly/JSON fallback
│   └── fp_insertion.py          ← insertion site sweep utilities
├── agent/
│   └── analyst.py               ← Claude Opus 4.6 with tool use
├── results/
│   ├── tamarind_cache.json      ← API response cache (never re-call same sequence)
│   ├── tamarind_calls.json      ← call counter
│   ├── esmfold_results.json     ← all ESMFold pLDDT scores
│   ├── af2_results.json         ← top-5 AF2 results with composite scores
│   ├── pareto.json              ← Pareto front data for dashboard
│   ├── summary.md               ← AI-generated executive summary
│   └── runs/                    ← timestamped JSONL logs per run
└── dashboard/                   ← React + Molstar (feature/dashboard-ui branch)
```

---

## Milestones Status

### Pipeline (feature/pipeline branch) ✅

- [x] SSTR2 + cpGFP sequences loaded from data files
- [x] Tamarind API wrapper — correct auth, endpoints, cache, budget guard
- [x] BLOSUM62 conservation scorer (replaced non-functional ProteinMPNN stub)
- [x] Hardcoded SSTR2 TM topology (replaced broken TMbed REST API)
- [x] Genetic Algorithm — co-evolves receptor loops + linker N/C + ICL3 insertion pos
- [x] ICL3 sweep — pre-GA local score over all ICL3 positions, seeds population
- [x] 3-round pLDDT feedback loop (blended local + real pLDDT fitness)
- [x] Pure-Python Cα RMSD vs WT baseline
- [x] Pareto front (pLDDT vs ipTM)
- [x] Claude Opus 4.6 agent — tool use, candidate selection, summary generation
- [x] Python 3.8 compatibility (`from __future__ import annotations` in all files)
- [x] All modules tested individually and end-to-end (0 Tamarind credits used)

### Dashboard (feature/dashboard-ui branch) — TODO

- [ ] React app skeleton
- [ ] Pareto front chart (Recharts)
- [ ] 3D structure viewer (Molstar / py3Dmol)
- [ ] Candidate table with all scores

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Burning 100 API calls | GA is 100% local; Tamarind called only in post-GA batches |
| Duplicate API calls | Cache all responses; check before every submission |
| ICL3 insertion disrupts folding | Pre-GA sweep picks statistically tolerated positions; pLDDT feedback culls bad ones |
| Linker too rigid / too flexible | GA evolves length (5–10) and composition; brightness + GGS penalty balances |
| Search doesn't converge in 1 day | 3-round feedback loop accelerates convergence; local score is fast enough for 40 gen |
| Tamarind API format changes | Wrapper isolated in `scorers/tamarind.py`; correct endpoints verified against live docs |

---

## Definition of Done

- [ ] Pipeline runs end-to-end without manual intervention
- [ ] GA runs entirely on local scorers — zero Tamarind calls during search
- [ ] ≤ 95 Tamarind calls used total
- [ ] Top chimeric sequences scored with ESMFold (pLDDT)
- [ ] Top-5 validated with AlphaFold2 multimer (ipTM)
- [ ] Pareto front: folding confidence vs. binding affinity
- [ ] AI-generated summary in `results/summary.md`
- [ ] Dashboard displays top-5 with scores and 3D structures
- [ ] 3-minute live demo: problem → pipeline → results

---

*Last updated: pipeline fully implemented and tested — ready for real Tamarind run*
