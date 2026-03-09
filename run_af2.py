"""
Standalone AF2 phase — runs agent selection + AF2 multimer on existing ESMFold results.

Use this to resume after ESMFold completes (or when results are already cached):
    python run_af2.py

Reads:  results/esmfold_results.json
Writes: results/af2_shortlist.json, results/af2_results.json, results/top5.json,
        results/summary.md, results/pdb/af2multi_*.pdb
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

# Load .env so ANTHROPIC_API_KEY and TAMARIND_API_KEY are available
_env_file = Path(__file__).parent / ".env"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())

from agent.analyst import generate_summary, select_af2_candidates
from analysis.pareto import pareto_front, plot_pareto
from analysis.rmsd import batch_rmsd
from scorers.ensemble import final_score, tamarind_complex_batch
from scorers.tamarind import esmfold_plddt, remaining_calls

# ── config ───────────────────────────────────────────────────────────────────

def _load_ligands(fasta_path):
    entries, name, seq_parts = [], "", []
    for line in Path(fasta_path).read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith(">"):
            if name:
                entries.append((name, "".join(seq_parts)))
            name = line[1:].split()[0]; seq_parts = []
        else:
            seq_parts.append(line.upper())
    if name:
        entries.append((name, "".join(seq_parts)))
    return entries

LIGANDS = _load_ligands(Path(__file__).parent / "data" / "ligands.faa")
LIGAND_NAME, LIGAND_SEQUENCE = LIGANDS[0]

SEED_SEQUENCE = (
    "MDMADEPLNGSHTWLSIPFDLNGSVVSTNTSNQTEPYYDLTSNAVLTFIYFVVCIIGLCGNTLVIYVILR"
    "YAKMKTITNIYILNLAIADELFMLGLPFLAMQVALVHWPFGKAICRVVMTVDGINQFTSIFCLTVMSIDR"
    "YLAVVHPIKSAKWRRPRTAKMITMAVWGVSLLVILPIMIYAGLRSNQWGRSSCTINWPGESGAWYTGFII"
    "YTFILGFLVPLTIICLCYLFIIIKVKSSGIRVGSSKRKKSEKKVTRMVSIVVAVFIFCWLPFYIFNVSSV"
    "SMAISPTPALKGMFDFVVVLTYANSCANPILYAFLSDNFKKSFQNVLCLVKVSGTDDGERSDSKQDKSRL"
    "NETTETQRTLLNGDLQTSI"
)

ESMFOLD_RESULTS = Path("results/esmfold_results.json")
PID_FILE = Path("results/pipeline.pid")
TOP_K = 5


def _write_pid():
    PID_FILE.parent.mkdir(parents=True, exist_ok=True)
    PID_FILE.write_text(str(os.getpid()))


def _clear_pid():
    try:
        PID_FILE.unlink()
    except FileNotFoundError:
        pass


def main():
    _write_pid()
    try:
        _run()
    finally:
        _clear_pid()


def _run():
    # ── load ESMFold results ─────────────────────────────────────────────────
    if not ESMFOLD_RESULTS.exists():
        raise FileNotFoundError(
            f"{ESMFOLD_RESULTS} not found. Run pipeline.py first to generate ESMFold scores."
        )
    candidates = json.loads(ESMFOLD_RESULTS.read_text())
    candidates = [c for c in candidates if c.get("sequence")]
    if not candidates:
        raise ValueError("esmfold_results.json has no valid candidate entries.")

    print(f"\n=== AF2 Phase: {len(candidates)} ESMFold candidates loaded ===")
    for c in candidates:
        print(f"  pLDDT={c.get('plddt', '?'):.1f}  seq={c['sequence'][:30]}...")

    plddt_cache = {c["sequence"]: c.get("plddt", 0) for c in candidates}

    # ── WT baseline (cached) ─────────────────────────────────────────────────
    _wt_linker = "GGSGGS"
    _wt_chimeric = SEED_SEQUENCE[:228] + _wt_linker + (
        "MTTFKIESRIHGNLNGEKFELVGGGVGEEGRLEIEMKTKDKPLAFSPFLLSHCMGYGFYH"
        "FASFPKGTKNIYLHAATNGGYTNTRKEIYEDGGILEVNFRYTYEFNKIIGDVECIGHGFP"
        "SQSPIFKDTIVKSCPTVDLMLPMSGNIIASSYARAFQLKDGSFYTAEVKNNIDFKNPIHE"
        "SFSKSGPMFTHRRVEETHTKENLAMVEYQQVFNSAPRDM"
    ) + _wt_linker + SEED_SEQUENCE[228:]
    print(f"\n=== WT baseline (for RMSD reference) ===")
    wt_result = esmfold_plddt(_wt_chimeric)
    wt_pdb = wt_result.get("pdb")
    print(f"[run_af2] WT pLDDT: {wt_result.get('plddt')} (cache hit expected)")

    # ── Claude agent: narrative + shortlist ──────────────────────────────────
    print(f"\n=== Agent: selecting {TOP_K} candidates for AF2 ===")
    print(f"[run_af2] Budget remaining: {remaining_calls()} calls")
    agent_rationale = select_af2_candidates(str(ESMFOLD_RESULTS), n=TOP_K)
    print(f"[agent] {agent_rationale[:400]}...")

    af2_shortlist_path = "results/af2_shortlist.json"
    if Path(af2_shortlist_path).exists():
        shortlist = json.loads(Path(af2_shortlist_path).read_text())
        top_sequences = [c["sequence"] for c in shortlist.get("candidates", []) if c.get("sequence")]
    else:
        top_sequences = []

    # Fallback: sort by pLDDT and take top-k
    if not top_sequences:
        print("[run_af2] Agent did not write shortlist — falling back to pLDDT ranking")
        top_sequences = [
            seq for seq, _ in sorted(plddt_cache.items(), key=lambda x: x[1], reverse=True)
        ][:TOP_K]

    top_sequences = top_sequences[:TOP_K]
    print(f"\n[run_af2] {len(top_sequences)} candidates advancing to AF2 vs {LIGAND_NAME}")

    # ── AF2 multimer ─────────────────────────────────────────────────────────
    print(f"\n=== AF2 Multimer: {len(top_sequences)} × {LIGAND_NAME} ({len(LIGAND_SEQUENCE)} AA) ===")
    chain_pairs = [(seq, LIGAND_SEQUENCE) for seq in top_sequences]
    af2_results = tamarind_complex_batch(chain_pairs)

    # ── RMSD vs WT ───────────────────────────────────────────────────────────
    print("\n=== RMSD analysis vs WT ===")
    if wt_pdb:
        af2_results = batch_rmsd(af2_results, reference_pdb=wt_pdb)
        for r in af2_results:
            print(f"  TM RMSD={r.get('tm_rmsd')} Å  global RMSD={r.get('global_rmsd')} Å")
    else:
        print("[rmsd] WARNING: no WT PDB, skipping")

    # ── composite score ──────────────────────────────────────────────────────
    local_map = {c["sequence"]: 0.5 for c in candidates}  # placeholder local fitness
    for r in af2_results:
        seq = r["chains"][0]
        r["sequence"]      = seq
        r["plddt"]         = r.get("plddt") or plddt_cache.get(seq)
        r["local_fitness"] = local_map.get(seq, 0)
        r["final_score"]   = final_score(r)
        print(f"  {seq[:25]}... pLDDT={r.get('plddt')}  ipTM={r.get('iptm')}  "
              f"final={r.get('final_score', 0):.3f}")

    af2_results.sort(key=lambda x: x.get("final_score") or 0, reverse=True)

    # ── Pareto + save ────────────────────────────────────────────────────────
    front = pareto_front(af2_results)
    plot_pareto(af2_results, front)

    af2_results_path = "results/af2_results.json"
    Path(af2_results_path).write_text(
        json.dumps(
            [{k: v for k, v in r.items() if k != "pdb"} for r in af2_results[:5]],
            indent=2, default=str,
        )
    )
    Path("results/top5.json").write_text(json.dumps(af2_results[:5], indent=2, default=str))
    print(f"\n[run_af2] Saved {af2_results_path} and results/top5.json")

    best = af2_results[0]
    print(f"\n[run_af2] Best: final_score={best.get('final_score', 0):.3f}  "
          f"ipTM={best.get('iptm')}  pLDDT={best.get('plddt')}  "
          f"TM_RMSD={best.get('tm_rmsd')} Å")

    # ── Agent summary ────────────────────────────────────────────────────────
    print("\n=== Agent: generating demo summary ===")
    summary = generate_summary(af2_results_path)
    print(summary)

    print(f"\n=== Done | Tamarind calls used this session: {100 - remaining_calls()} total ===")


if __name__ == "__main__":
    main()
