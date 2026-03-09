# YC-Bio-Hack —  Biosensor Design Pipeline

An automated protein engineering pipeline that designs an optimal **SSTR2 GPCR biosensor** by inserting circularly permuted GFP (cpGFP) into the receptor and co-evolving loop residues and linker sequences to maximize folding quality and somatostatin binding.

---

## Overview

The pipeline designs chimeric SSTR2-cpGFP constructs where cpGFP is inserted into intracellular loop 3 (ICL3) of the somatostatin receptor type 2 (SSTR2). When somatostatin-28 binds the receptor's extracellular loops, conformational changes propagate to the cpGFP insertion site, shifting its fluorescence. The goal is to find the insertion position and flanking linker sequences that maximize both structural integrity and ligand coupling.

---

## Pipeline Stages

```
GA Search (local) → ESMFold Batch → Orthogonal Validation → Agent Selection → AF2 Multimer → Ranking + Pareto
```

| Stage | Tool | API Calls | Output |
|-------|------|-----------|--------|
| 1. Genetic Algorithm | Local (BLOSUM62, topology) | 0 | Top-50 sequences |
| 2. ESMFold scoring | Tamarind ESMFold | ~50 | pLDDT per candidate |
| 3. Orthogonal validation | Local MD/Rosetta/assay data | 0 | `orthogonal_validation.json` |
| 4. Agent selection | Claude Opus 4.6 | 1 | Top-5 shortlist + rationale |
| 5. AF2 Multimer | Tamarind AlphaFold2 | ~5 | ipTM (receptor–ligand interface) |
| 6. Composite ranking | Local | 0 | `af2_results.json`, `top5.json` |

**API budget:** 95 Tamarind calls total (enforced hard limit).

### Composite Score

```
final_score = 0.30 × (pLDDT/100)
            + 0.30 × ipTM
            + 0.15 × rmsd_score      # sequence conservation vs WT
            + 0.15 × local_fitness
            + 0.10 × validation_score
```
`validation_score` blends MD windows, Rosetta filter hits, and lab assay anchors
from `data/validation/orthogonal_signals.json`.

---

## Quickstart

### Requirements

```bash
pip install -r requirements.txt
npm install
```

### Environment

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
# edit .env:
# TAMARIND_API_KEY=...
# ANTHROPIC_API_KEY=...
# PIPELINE_PYTHON=/opt/anaconda3/bin/python3   # or path to your Python
```

### Run the full pipeline

```bash
python pipeline.py
```

### Resume from AF2 phase (if ESMFold results already exist)

```bash
python run_af2.py
```

### Dashboard

```bash
npm run dev       # development
npm run start     # production (after npm run build)
```

Open [http://localhost:3000](http://localhost:3000). The dashboard polls `/api/pipeline` for live status and displays candidates, Pareto front, insertion sites, and 3D structures.

---

## Project Structure

```
├── pipeline.py              Full pipeline entrypoint
├── run_af2.py              AF2-only resume script
│
├── scorers/
│   ├── tamarind.py         Tamarind API (ESMFold + AF2 multimer), cached
│   ├── ensemble.py         Composite scorer (local + API phases)
│   ├── conservation.py     BLOSUM62 TM-loop conservation score
│   ├── fp_model.py         cpGFP brightness / linker compatibility
│   └── tmbed.py            TM topology validator (7-helix check)
│
├── search/
│   └── genetic.py          Genetic algorithm (pop=30, gen=40)
│
├── analysis/
│   ├── rmsd.py             Sequence-level RMSD proxy vs WT
│   └── pareto.py           Pareto front (pLDDT vs ipTM)
│
├── agent/
│   └── analyst.py          Claude Opus 4.6 — candidate selection + summary
│
├── data/
│   ├── seed_sequences/     SSTR2 WT (UniProt P30874, 369 AA)
│   └── ligands.faa         Somatostatin-28 (28 AA)
│
├── app/                    Next.js 15 dashboard
│   ├── page.tsx
│   └── api/pipeline/       REST endpoint (reads results/ files)
│
├── components/             React UI
│   ├── candidates-table.tsx
│   ├── pareto-chart.tsx
│   ├── protein-viewer.tsx  NGL.js 3D viewer
│   └── insertion-diagram.tsx
│
└── results/                Pipeline outputs (gitignored except structure)
    ├── esmfold_results.json
    ├── af2_results.json
    └── top5.json
```

---

## Key Design Choices

- **No structure required for GA** — all local scorers (BLOSUM62, topology check, cpGFP brightness) run without API calls, enabling thousands of evaluations per second.
- **Parallel AF2 jobs** — all multimer jobs are submitted simultaneously and polled concurrently, so wall time ≈ single job time.
- **Orthogonal validation checkpoint** — MD snapshots, Rosetta filters, and lab assay anchors are blended into `results/orthogonal_validation.json`, nudging both the GA and agent toward constructs supported by independent signals.
- **Claude agent in the loop** — the agent reads ESMFold + orthogonal signals, selects diverse candidates (avoiding near-duplicates), and writes a narrative rationale saved alongside results.
- **Cached API calls** — `results/tamarind_cache.json` deduplicates all Tamarind calls by sequence key, so reruns are free.

---

## Results

Top candidates after AF2 multimer vs somatostatin-28:

| Rank | AF2 pLDDT | ipTM | Final Score |
|------|-----------|------|-------------|
| 1 | 76.05 | 0.62 | 0.527 |
| 2 | 75.69 | 0.62 | 0.526 |
| 3 | 63.23 | 0.63 | 0.485 |

---

## Orthogonal validation data

- Authoritative signals live in `data/validation/orthogonal_signals.json`. Update this file
  with MD-derived stability windows, Rosetta filter motifs, or lab assay hits. Sequences are
  keyed by SHA1 so sensitive constructs can be referenced without exposing raw sequences.
- Running `pipeline.py` writes `results/orthogonal_validation.json`, which captures the
  blended validation score for the top candidates and is consumed by both the agent and the
  dashboard.
