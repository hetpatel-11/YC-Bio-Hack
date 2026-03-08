"""
Analyst agent smoke test.

Uses real Claude Opus 4.6 with tool use, but feeds it small synthetic
data (5 candidates) so it completes quickly and costs minimal tokens.

Tests:
  1. _compute_diversity()     — local util
  2. _read_candidates()       — reads the synthetic JSON we write
  3. select_af2_candidates()  — full agent loop with tool calls
  4. generate_summary()       — full agent loop, writes Markdown

Run:
    python test_analyst.py
"""

import json
import os
import pathlib

from dotenv import load_dotenv
load_dotenv()

# ---------------------------------------------------------------------------
# Synthetic ESMFold results (5 candidates)
# ---------------------------------------------------------------------------
CANDIDATES = [
    {"sequence": "MDMADEPLNGSHTWLSIPFDLNGSVVSTNTSNQTEP" + "A" * 333, "plddt": 91.2},
    {"sequence": "MDMADEPLNGSHTWLSIPFDLNGSVVSTNTSNQTEP" + "C" * 333, "plddt": 87.5},
    {"sequence": "MDMADEPLNGSHTWLSIPFDLNGSVVSTNTSNQTEP" + "G" * 333, "plddt": 83.1},
    {"sequence": "MDMADEPLNGSHTWLSIPFDLNGSVVSTNTSNQTEP" + "V" * 333, "plddt": 78.4},
    {"sequence": "MDMADEPLNGSHTWLSIPFDLNGSVVSTNTSNQTEP" + "S" * 333, "plddt": 72.9},
]

AF2_RESULTS = [
    {"sequence": c["sequence"], "plddt": c["plddt"],
     "iptm": round(0.60 + i * 0.05, 2), "ptm": round(0.55 + i * 0.04, 2),
     "local_fitness": round(0.85 - i * 0.03, 3), "final_score": round(0.78 - i * 0.04, 3)}
    for i, c in enumerate(CANDIDATES)
]

# Write test fixture files
pathlib.Path("results").mkdir(exist_ok=True)
esmfold_path = "results/test_esmfold_results.json"
af2_path     = "results/test_af2_results.json"
pathlib.Path(esmfold_path).write_text(json.dumps(CANDIDATES, indent=2))
pathlib.Path(af2_path).write_text(json.dumps(AF2_RESULTS, indent=2))


# ---------------------------------------------------------------------------
# 1. Local util: _compute_diversity
# ---------------------------------------------------------------------------
from agent.analyst import _compute_diversity, _read_candidates

seqs = [c["sequence"] for c in CANDIDATES]
div = _compute_diversity(seqs)
print("=" * 60)
print("[1] _compute_diversity()")
print(f"    n={div['n_sequences']}  mean_hamming={div['mean_hamming']}  min_hamming={div['min_hamming']}")
assert div["n_sequences"] == 5
assert div["min_hamming"] > 0
print("    PASSED")

# ---------------------------------------------------------------------------
# 2. _read_candidates()
# ---------------------------------------------------------------------------
read_back = _read_candidates(esmfold_path)
print("\n[2] _read_candidates()")
print(f"    read {len(read_back)} candidates from {esmfold_path}")
assert len(read_back) == 5
print("    PASSED")

# ---------------------------------------------------------------------------
# 3. select_af2_candidates() — real agent call
# ---------------------------------------------------------------------------
from agent.analyst import select_af2_candidates

print("\n[3] select_af2_candidates() — calling Claude Opus 4.6 ...")
rationale = select_af2_candidates(
    esmfold_results_path=esmfold_path,
    n=3,
    output_path="results/test_af2_shortlist.json",
)
print(f"    Agent rationale (first 300 chars):\n    {rationale[:300]}")
shortlist_path = pathlib.Path("results/test_af2_shortlist.json")
assert shortlist_path.exists(), "Agent did not write shortlist file"
shortlist = json.loads(shortlist_path.read_text())
print(f"    Shortlist: {len(shortlist.get('candidates', []))} candidates selected")
print(f"    Rationale key: {list(shortlist.keys())}")
print("    PASSED")

# ---------------------------------------------------------------------------
# 4. generate_summary() — real agent call
# ---------------------------------------------------------------------------
from agent.analyst import generate_summary

print("\n[4] generate_summary() — calling Claude Opus 4.6 ...")
summary = generate_summary(
    af2_results_path=af2_path,
    output_path="results/test_summary.md",
)
print(f"    Summary (first 400 chars):\n{summary[:400]}")
summary_path = pathlib.Path("results/test_summary.md")
assert summary_path.exists(), "Agent did not write summary.md"
print("    PASSED")

# ---------------------------------------------------------------------------
print("\n" + "=" * 60)
print("  Agent analyst: ALL TESTS PASSED")
print("=" * 60)
