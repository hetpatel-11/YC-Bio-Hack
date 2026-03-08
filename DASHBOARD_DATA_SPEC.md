# Dashboard Data Spec & API Flow

Everything the UI needs to know: where data lives, what it contains,
how to fetch PDB structures, and how to track pipeline status in real time.

---

## 1. Pipeline Status — How to Track Progress

The pipeline writes timestamped JSONL logs to `results/runs/` as it runs.
Each log entry is one JSON object on one line.

### Status file: `results/tamarind_calls.json`
```json
{ "calls": 12 }
```
Poll this file to show budget consumed vs remaining (budget = 95).

### Log stream: `results/runs/<timestamp>.jsonl`
Each line is a JSON event. `phase` tells you where the pipeline is:

| `phase` | When | Key fields |
|---------|------|-----------|
| `ga_r1` | GA round 1 done | `sequence`, `fitness`, `insert_pos`, `linker_n`, `linker_c` |
| `ga_r2` | GA round 2 done | same |
| `ga_r3` | GA round 3 done | same |
| `esmfold_r1` | ESMFold batch 1 returned | `sequence`, `plddt`, `ptm` |
| `esmfold_r2` | ESMFold batch 2 returned | same |
| `esmfold_r3` | ESMFold batch 3 returned | same |
| `af2` | AF2 multimer returned | `sequence`, `plddt`, `iptm`, `ptm`, `tm_rmsd`, `final_score` |

**Polling strategy**: tail the latest `.jsonl` file in `results/runs/`,
or watch for new entries with a 2-second interval. The pipeline takes
~20–40 min total (mostly waiting for Tamarind jobs to complete).

---

## 2. Result Files — Schemas

All files are written to `results/`. Re-read on change to refresh the UI.

### `results/esmfold_results.json`
Written after all 3 ESMFold rounds complete.
```json
[
  { "sequence": "MDMAD...GGSGGS...cpGFP...GGSGGS...", "plddt": 82.3 },
  { "sequence": "...", "plddt": 78.1 },
  ...
]
```
Sorted by pLDDT descending. Used to populate the candidate table.

### `results/af2_results.json`
Written after AF2 multimer + RMSD + final scoring.
```json
[
  {
    "sequence":      "MDMAD...full 600aa chimeric...",
    "plddt":         82.3,
    "ptm":           0.67,
    "iptm":          0.81,
    "tm_rmsd":       1.42,
    "global_rmsd":   2.10,
    "n_residues":    369,
    "local_fitness": 0.71,
    "final_score":   0.763
  },
  ...
]
```
Top-5, sorted by `final_score` descending.

### `results/af2_shortlist.json`
Written by the Claude Opus 4.6 agent.
```json
{
  "rationale": "Selected candidates 1, 3, 5 because...",
  "candidates": [
    { "sequence": "...", "plddt": 82.3 },
    ...
  ]
}
```

### `results/pareto.json`
Written by `analysis/pareto.py` (plotly fallback mode).
```json
{
  "candidates": [ { "sequence": "...", "plddt": 82.3, "iptm": 0.81, "final_score": 0.76 }, ... ],
  "front":      [ { "sequence": "...", "plddt": 90.1, "iptm": 0.79, "final_score": 0.81 }, ... ]
}
```
`front` = Pareto-optimal subset. Non-front candidates = dominated.

### `results/summary.md`
Markdown file written by the Claude Opus 4.6 agent.
Render as-is in a `<ReactMarkdown>` component or iframe.

### `results/tamarind_cache.json`
Internal cache — do not display directly. Cache key format:
```
"esmfold::<sequence>::{}"
"alphafold2_multimer::<seq1>:<seq2>::{\"num_models\": 5}"
```
Each value:
```json
{
  "plddt": 82.3,
  "ptm":   0.67,
  "pdb":   "<full PDB string or null>",
  "raw":   { ... }
}
```
**PDB strings live here** — `cache[key]["pdb"]`.

---

## 3. PDB Structures — How to Get Them

### How Tamarind returns PDB files (verified)

The Tamarind result flow has **two separate responses**:

1. **`GET /jobs`** → `Score` field (JSON string) contains scores only:
   `{ "plddt": 59.4, "ptm": 0.561, "num_recycles": 3, "chain_linker": 25 }` — **no PDB**

2. **`POST /result`** → returns a **signed S3 URL** (quoted string) to a ZIP file.
   The ZIP contains `model.pdb` (or `<jobname>.pdb`). This is the actual structure.

Our wrapper (`scorers/tamarind.py:_download_pdb`) handles this automatically:
- Downloads the ZIP from the S3 URL
- Extracts the `.pdb` file
- Saves it to `results/pdb/<job_name>.pdb` on disk
- Stores the PDB string in `results/tamarind_cache.json` under the `"pdb"` key

### PDB file index

Each completed job produces:

| Location | Contents |
|---|---|
| `results/pdb/<job_name>.pdb` | Full PDB file on disk (e.g. `esmfold_93643045.pdb`) |
| `results/tamarind_cache.json` → `["pdb"]` | Same PDB as string in JSON |
| `results/tamarind_cache.json` → `["pdb_file"]` | Relative path string `"results/pdb/<job>.pdb"` |
| `results/tamarind_cache.json` → `["seq_hash"]` | Job name = lookup key (e.g. `"esmfold_93643045"`) |

**Verified PDB stats** (WT chimeric SSTR2-cpGFP, 600 AA):
- 4700 ATOM records, 600 Cα atoms, single chain A, residues 1–600
- File size: ~380 KB

### How to serve PDB to the viewer

**Option A — Serve the file directly** (fastest, local dev):
```js
// Express route
app.get('/api/structure/:jobname', (req, res) => {
  const pdbPath = path.join('results', 'pdb', `${req.params.jobname}.pdb`)
  res.setHeader('Content-Type', 'text/plain')
  res.sendFile(path.resolve(pdbPath))
})
```

**Option B — Read from JSON cache** (works if files not on same server):
```js
const cache = JSON.parse(fs.readFileSync('results/tamarind_cache.json'))
const key = `esmfold::${sequence}::{}`
const pdb = cache[key]?.pdb      // full PDB string
const file = cache[key]?.pdb_file // "results/pdb/esmfold_93643045.pdb"
const hash = cache[key]?.seq_hash // "esmfold_93643045"
```

### 3D viewer integration (Molstar / py3Dmol / NGL)

```js
// Molstar (recommended for production)
import { PluginContext } from 'molstar/lib/mol-plugin/context'
viewer.loadStructureFromData(pdbString, 'pdb')

// py3Dmol (simpler, iframe-based)
const view = $3Dmol.createViewer(element)
view.addModel(pdbString, 'pdb')
view.setStyle({ cartoon: { color: 'spectrum' } })
// Highlight insertion region (ICL3, ~residues 205–252 + FP block)
view.addStyle({ resi: '205-252', chain: 'A' }, { cartoon: { color: 'red' } })
view.render()
```

### Insertion site visualization

Each GA individual stores `insert_pos` and `linker_n`/`linker_c` length in
the log files. The FP block in the chimeric sequence runs from:
```
fp_start = insert_pos + len(linker_n)
fp_end   = fp_start + 219          # cpGFP is 219 AA
linker_n_end = insert_pos + len(linker_n)
linker_c_start = fp_end
linker_c_end   = linker_c_start + len(linker_c)
```
Highlight these residue ranges in the 3D viewer with distinct colors:
- SSTR2 loops (before/after insert): blue cartoon
- N-linker: yellow
- cpGFP: green
- C-linker: orange

---

## 4. Dashboard Pages / Panels

### Panel 1 — Pipeline Status (live)
Poll `results/tamarind_calls.json` every 2s.
Watch `results/runs/*.jsonl` for new log lines.

```
Phase:     [GA R1 ✓] [ESMFold R1 ✓] [GA R2 ✓] [ESMFold R2 ...] [ ] [ ] [ ]
Budget:    ████████░░░░░░░░░░░░  12 / 95 calls used
Est. time: ~35 min remaining
```

### Panel 2 — Candidate Table
Read `results/esmfold_results.json` → `results/af2_results.json` as phases complete.

| Rank | Seq (first 20aa) | Insert pos | N-linker | C-linker | pLDDT | ipTM | TM-RMSD | Score |
|------|-----------------|-----------|---------|---------|-------|------|---------|-------|
| 1    | MDMAD...        | 228       | GGSAG   | GGSET   | 87.2  | 0.83 | 1.2 Å  | 0.81  |

Click a row → loads structure in Panel 4.

### Panel 3 — Pareto Front
Read `results/pareto.json`.
x-axis: pLDDT, y-axis: ipTM.
Red stars = Pareto front. Blue dots = dominated candidates.
Hover shows sequence + scores. Click → loads structure.

### Panel 4 — 3D Structure Viewer
Molstar or py3Dmol component.
Load PDB from `results/tamarind_cache.json`.
Color scheme:
- TM helices: grey
- SSTR2 loops: blue
- N-linker: yellow
- cpGFP: green (spectrum coloring)
- C-linker: orange
- ICL3 region: red highlight

### Panel 5 — AI Summary
Render `results/summary.md` as Markdown.
Show after pipeline completes.

---

## 5. Backend API Routes Needed

```
GET  /api/status          → { phase, calls_used, calls_remaining, phases_complete[] }
GET  /api/candidates      → esmfold_results.json contents (or af2 if ready)
GET  /api/top5            → af2_results.json contents
GET  /api/pareto          → pareto.json contents
GET  /api/structure/:seq  → PDB string for a given sequence (from cache)
GET  /api/summary         → summary.md as text
GET  /api/logs/stream     → SSE stream of new JSONL log lines (optional)
```

For a hackathon, a simple Python Flask/FastAPI backend reading these
files directly is sufficient. No database needed.

---

## 6. Quick Backend (FastAPI)

```python
# dashboard/backend.py
from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
import json, hashlib
from pathlib import Path

app = FastAPI()
RESULTS = Path("results")

@app.get("/api/status")
def status():
    calls = json.loads((RESULTS / "tamarind_calls.json").read_text())["calls"]
    return {"calls_used": calls, "calls_remaining": 95 - calls,
            "af2_ready": (RESULTS / "af2_results.json").exists()}

@app.get("/api/top5")
def top5():
    p = RESULTS / "af2_results.json"
    return json.loads(p.read_text()) if p.exists() else []

@app.get("/api/pareto")
def pareto():
    p = RESULTS / "pareto.json"
    return json.loads(p.read_text()) if p.exists() else {}

@app.get("/api/structure/{job_name}", response_class=PlainTextResponse)
def structure(job_name: str):
    """Serve PDB file by job name (e.g. 'esmfold_93643045' or 'af2multi_12345678')."""
    pdb_path = RESULTS / "pdb" / f"{job_name}.pdb"
    if pdb_path.exists():
        return pdb_path.read_text()
    # Fallback: read from cache JSON
    cache = json.loads((RESULTS / "tamarind_cache.json").read_text())
    for val in cache.values():
        if val.get("seq_hash") == job_name and val.get("pdb"):
            return val["pdb"]
    return ""

@app.get("/api/structures")
def list_structures():
    """List all available PDB files with their job names and scores."""
    cache = json.loads((RESULTS / "tamarind_cache.json").read_text())
    result = []
    for key, val in cache.items():
        tool = key.split("::")[0]   # "esmfold" or "alphafold2_multimer"
        result.append({
            "job_name": val.get("seq_hash"),
            "tool":     tool,
            "plddt":    val.get("plddt"),
            "ptm":      val.get("ptm"),
            "iptm":     val.get("iptm"),
            "pdb_file": val.get("pdb_file"),
            "has_pdb":  val.get("pdb") is not None,
        })
    return result

@app.get("/api/summary", response_class=PlainTextResponse)
def summary():
    p = RESULTS / "summary.md"
    return p.read_text() if p.exists() else "Pipeline not complete yet."
```

Run: `uvicorn dashboard.backend:app --reload --port 8000`
