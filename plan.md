
# 🧬 Drug Discovery Pipeline — Hackathon Plan

## Project Overview

Design an **optimal transmembrane receptor sensor** for drug delivery by finding the best protein sequence that incorporates a **fluorescent protein (FP)** at the optimal insertion position. We use an ensemble of ML scoring models and implement a search algorithm to navigate the sequence space efficiently.

**Team Size**: 3 people
**Duration**: 1 day
**Goal**: Working demo with top-K designed sequences, predicted structures, and FP insertion site visualization

---

## Architecture

```
[Seed Sequence]
      │
      ▼
[Mutation Generator]   ← linker variants + FP insertion positions
      │
      ▼
[Scorer Ensemble]  ← LOCAL / FREE (bulk search, no API calls)
  ├── ProteinMPNN              (sequence plausibility)
  ├── TMbed                   (transmembrane topology)
  └── FP Brightness            (custom model on FPbase)
      │
      ▼
[Search Algorithm]
  └── Genetic Algorithm
      │
      ▼
[Top-50 Candidates filtered locally]
      │
      ▼
[Tamarind API]  ← ~90 calls total, reserved for final validation
  ├── ESMFold         → pLDDT for top-50 monomer structures
  └── AlphaFold2      → pTM + ipTM for top-5 complex predictions
      │
      ▼
[Top-5 Final Candidates + Pareto Front]
      │
      ▼
[Dashboard Visualization]
```

---

## Milestones — Single Day

### Morning (9am–12pm)

- [ ] **Kickoff** — assign roles, set up shared repo, agree on data formats
- [ ] **Scaffold definition** — choose receptor (GPCR or synthetic sensor), define fixed vs. mutable regions
- [ ] **Local scorer wrappers** — TMbed, ProteinMPNN, FP brightness model (these run free, drive the GA)
- [ ] **Tamarind API integration** — wrap ESMFold + AlphaFold2 behind `score(sequence) → float`
  - **Do NOT call during GA search** — only call on final shortlist
  - Cache every response to `tamarind_cache.json` — never re-call a sequence already scored
  - Track call count in a shared counter; hard-stop at 95 calls
- [ ] **GA baseline** — population init, mutation, crossover, selection loop

### Afternoon (12pm–5pm)

- [ ] **First end-to-end run** — GA using only local scorers; verify no Tamarind calls happen during search
- [ ] **Score logging** — all runs to `results.jsonl` with sequence + scores + metadata
- [ ] **FP insertion sweep** — grid search over loop regions, masked by secondary structure (local)
- [ ] **Tamarind ESMFold batch** — submit top-50 GA winners for pLDDT (~50 calls)
- [ ] **Tamarind AF2 batch** — submit top-5 ESMFold survivors for full complex prediction (~40 calls, 5 models each or multimer)
- [ ] **Pareto front** — folding confidence (pLDDT) vs. binding affinity (ipTM) trade-off
- [ ] **Dashboard** — top-5 sequences with all scores and 3D structures (Tamarind CIF/PDB output)
- [ ] **FP insertion visualization** — best site highlighted on 3D model (py3Dmol / Molstar)
- [ ] **Demo script** — 3-minute walk-through: problem → approach → results
- [ ] **Slide deck (3 slides)** — Problem, Pipeline, Results

### 5pm — Freeze & Rehearse

- [ ] Code freeze
- [ ] Demo rehearsal × 2
- [ ] Back up all results

---

## Tamarind API — Structure Prediction

**Budget: ~100 calls total — treat each call as precious.**

| Use Case | Tamarind Tool | Planned Calls | Notes |
|----------|--------------|--------------|-------|
| Monomer pLDDT (top-50 GA winners) | **ESMFold** | ~50 | Fast; language model, no MSA needed |
| Complex / binding affinity (top-5) | **AlphaFold2** multimer | ~40 | pTM + ipTM + pAE; 5 models each = 5 calls |
| Reserve / debug | any | ~10 | Do not exceed this buffer |
| **Total** | | **≤ 100** | Hard limit — shared counter enforced in code |

**Rules:**
- Never call Tamarind inside a search loop
- Always check cache before submitting a job
- Test API integration with **1 call** (seed sequence) before running any batch
- AF2 multimer counts as 1 call per submission, returns up to 5 ranked models

**Key Outputs from Tamarind:**
- PDB / CIF structure file
- pLDDT — per-residue confidence (higher = better)
- pTM — overall fold confidence (> 0.5 = good)
- ipTM — interface confidence for complexes (> 0.8 = high quality)
- pAE matrix — positional error between residue pairs

**Input Limits:**
- AlphaFold3-class models (Boltz, Chai): hard limit **2048 residues**
- AlphaFold2: up to **~5000 residues**

**MSA:** Enabled by default via ColabFold MMseqs2 (uniref30, bfd, colabfold env). Can be disabled for speed.

---

## Technical Stack

| Component | Tool | API calls? |
|-----------|------|-----------|
| Language | Python 3.11+ | — |
| Bulk scoring (GA loop) | TMbed + ProteinMPNN + FP model | No — local/free |
| Monomer structure (top-50) | Tamarind ESMFold | Yes — ~50 calls |
| Complex structure (top-5) | Tamarind AlphaFold2 multimer | Yes — ~40 calls |
| API call guard | Shared counter + cache (`tamarind_cache.json`) | — |
| Structure viz | py3Dmol / Molstar | — |
| Dashboard | React + Recharts | — |
| Data logging | JSONL + Pandas | — |
| Repo | GitHub (main + feature branches) | — |

---

## Sequence Design Constraints

```python
CONSTRAINTS = {
    "receptor":      "SSTR2 (NP_001041.1, 369 AA, 7 TM helices) — TM helices fixed, loops mutable",
    "mutable_loops": ["ECL1 (83–89)", "ICL2 (117–124)", "ECL2 (149–173)",
                      "ICL3 (205–252)", "ECL3 (281–287)", "C-tail (314–369)"],
    "fp":            "cpGFP cp145 variant (219 AA) — fixed module, not mutated",
    "linker":        "5–20 AA, flexible (GGS repeats as baseline)",
    "fp_insertion":  "ECL2 / ICL3 / ECL3 preferred (extracellular access + conformational coupling)",
    "max_length":    800,  # SSTR2 (369) + 2×linker (12) + cpGFP (219) ≈ 600 AA
    "forbidden":     ["cysteine-rich motifs", "signal peptides"],
}
```

---

## Scoring Weights (tunable)

**GA search uses local-only scores. Tamarind scores applied post-hoc for final ranking.**

| Model | Phase | Default Weight | Notes |
|-------|-------|---------------|-------|
| TMbed topology | GA search | 0.40 | Must preserve TM orientation |
| ProteinMPNN plausibility | GA search | 0.35 | Sequence naturalness |
| FP brightness model | GA search | 0.25 | Core readout for sensor function |
| Tamarind ESMFold pLDDT | Post-GA | re-ranks top-50 | Applied after GA; no weight in search loop |
| Tamarind AF2 ipTM | Final | re-ranks top-5 | Applied last; demo metric |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Burning through 100 API calls | Never call Tamarind in the GA loop; use shared counter with hard stop at 95 |
| Accidental duplicate API calls | Cache all responses to `tamarind_cache.json`; check before every submission |
| API test wasting credits | Use seed sequence for the single integration test; reuse that result |
| Search doesn't converge | GA runs on local scorers only — can run many iterations for free |
| FP disrupts folding | Pre-filter insertions to loop regions; penalize locally before Tamarind call |
| Integration breaks | Each module has a standalone test script; Tamarind mock mode for local dev |
| Time crunch | Prioritize end-to-end pipeline; Tamarind calls are the last step |

---

## Repo Structure

```
drug-discovery-hackathon/
├── README.md
├── plan.md                  ← this file
├── data/
│   ├── seed_sequences/
│   └── fp_sequences/        # GFP, mCherry, mVenus
├── scorers/
│   ├── ensemble.py          # unified scorer
│   ├── tamarind.py          # ESMFold + AF2 via Tamarind API
│   ├── tmbed.py
│   └── fp_model.py
├── search/
│   └── genetic.py
├── analysis/
│   ├── fp_insertion.py      # position sweep
│   └── pareto.py
├── dashboard/               # React app
├── results/
│   └── runs/                # timestamped JSONL logs
└── notebooks/
    └── exploration.ipynb
```

---

## Communication

- **Sync**: Every 2 hours (5-min standup — what's done, what's blocked)
- **Async**: Shared Slack/Discord channel `#hackathon-drugdesign`
- **Blockers**: Tag `@lead` immediately, don't wait for next sync
- **Commits**: Small and frequent; PR to `main` only after local test passes

---

## Definition of Done (Demo-Ready)

- [ ] Pipeline runs end-to-end without manual intervention
- [ ] GA search runs **entirely on local scorers** — zero Tamarind calls during search
- [ ] Tamarind call counter tracked; **≤ 100 calls used total**
- [ ] **Top-50 candidates** scored with Tamarind ESMFold (~50 calls)
- [ ] **Top-5 candidates** validated with Tamarind AlphaFold2 multimer (~40 calls)
- [ ] **Top-5 candidates** displayed on dashboard with all scores and 3D structures
- [ ] **FP insertion site** visualized on 3D structure of best candidate
- [ ] **Pareto front** plot: folding confidence vs. binding affinity
- [ ] 3-minute live demo that tells a clear story

---

*Last updated: Hackathon Day 0 — assign owners before kickoff*
