"""
Single-round pipeline smoke test — no Tamarind API calls.

Mocks ESMFold and AF2 responses so the full pipeline logic can be
exercised end-to-end: GA → ESMFold (mock) → final ranking → pareto.

Run:
    python test_one_round.py
"""

import json
from pathlib import Path
from unittest.mock import patch

from scorers.tmbed import SSTR2_WILDTYPE
from scorers.ensemble import local_score, final_score
from search.genetic import run_ga
from analysis.rmsd import batch_rmsd
from analysis.pareto import pareto_front, plot_pareto

# ---------------------------------------------------------------------------
# Config (minimal for fast iteration)
# ---------------------------------------------------------------------------
FP_NAME = "cpGFP"
FP_SEQUENCE = (
    "MTTFKIESRIHGNLNGEKFELVGGGVGEEGRLEIEMKTKDKPLAFSPFLLSHCMGYGFYH"
    "FASFPKGTKNIYLHAATNGGYTNTRKEIYEDGGILEVNFRYTYEFNKIIGDVECIGHGFP"
    "SQSPIFKDTIVKSCPTVDLMLPMSGNIIASSYARAFQLKDGSFYTAEVKNNIDFKNPIHE"
    "SFSKSGPMFTHRRVEETHTKENLAMVEYQQVFNSAPRDM"
)
POP     = 10
GENS    = 5
TOP_K   = 5

MOCK_PLDDT_BASE = 78.0   # ESMFold mock scores vary around this

# ---------------------------------------------------------------------------
# Minimal fake PDB (enough for RMSD code to find Cα atoms)
# ---------------------------------------------------------------------------
FAKE_PDB = "\n".join(
    f"ATOM  {i+1:5d}  CA  ALA A{i+1:4d}    "
    f"   {float(i)*1.5:8.3f}   0.000   0.000  1.00 50.00           C"
    for i in range(30)
)


def mock_esmfold(sequence: str) -> dict:
    """Return a deterministic mock ESMFold result based on sequence hash."""
    h = abs(hash(sequence)) % 1000
    plddt = MOCK_PLDDT_BASE + (h / 1000) * 20   # 78–98
    return {"plddt": round(plddt, 2), "pdb": FAKE_PDB, "raw": {}}


def mock_af2(chains: list, num_models: int = 5) -> dict:
    h = abs(hash(chains[0])) % 1000
    return {
        "plddt": round(70 + (h / 1000) * 25, 2),
        "ptm":   round(0.55 + (h / 1000) * 0.3, 3),
        "iptm":  round(0.60 + (h / 1000) * 0.25, 3),
        "pdb":   FAKE_PDB,
        "raw":   {},
    }


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("  Single-round pipeline test (no Tamarind API calls)")
    print("=" * 60)

    # --- GA ---
    print(f"\n[GA] {POP} pop × {GENS} gen → top {TOP_K}")
    top_individuals = run_ga(
        seed_receptor=SSTR2_WILDTYPE,
        fp_sequence=FP_SEQUENCE,
        fp_name=FP_NAME,
        population_size=POP,
        n_generations=GENS,
        top_k=TOP_K,
        plddt_cache={},
        round_num=1,
    )

    print(f"\n[GA] Top {len(top_individuals)} individuals:")
    for i, ind in enumerate(top_individuals):
        print(f"  #{i+1}  fitness={ind.fitness:.4f}  seq[:20]={ind.sequence[:20]}")

    # --- Mock ESMFold ---
    print(f"\n[ESMFold] Scoring {len(top_individuals)} sequences (mock)")
    plddt_cache: dict = {}
    esmfold_results = []
    for ind in top_individuals:
        r = mock_esmfold(ind.sequence)
        plddt_cache[ind.sequence] = r["plddt"]
        esmfold_results.append({"sequence": ind.sequence, **r})
        print(f"  pLDDT={r['plddt']:.1f}  seq[:20]={ind.sequence[:20]}")

    # --- Mock AF2 multimer (top 3) ---
    TOP_K_AF2 = 3
    ranked = sorted(plddt_cache.items(), key=lambda x: x[1], reverse=True)
    top_seqs = [seq for seq, _ in ranked[:TOP_K_AF2]]

    print(f"\n[AF2] Running multimer on top {TOP_K_AF2} (mock)")
    af2_results = []
    for seq in top_seqs:
        r = mock_af2([seq, FP_SEQUENCE])
        af2_results.append({"chains": [seq, FP_SEQUENCE], **r})
        print(f"  pLDDT={r['plddt']:.1f}  ptm={r['ptm']:.3f}  iptm={r['iptm']:.3f}")

    # --- RMSD vs WT PDB (same fake PDB → RMSD=0) ---
    print("\n[RMSD] Computing structural RMSD vs WT mock structure")
    af2_results = batch_rmsd(af2_results, reference_pdb=FAKE_PDB)
    for r in af2_results:
        print(f"  TM RMSD={r.get('tm_rmsd')} Å  global RMSD={r.get('global_rmsd')} Å")

    # --- Final composite scoring ---
    print("\n[Ranking] Composite final scores")
    local_map = {ind.sequence: ind.fitness for ind in top_individuals}
    for r in af2_results:
        seq = r["chains"][0]
        r["sequence"]      = seq
        r["plddt"]         = plddt_cache.get(seq, r.get("plddt"))
        r["local_fitness"] = local_map.get(seq, 0)
        r["final_score"]   = final_score(r)

    af2_results.sort(key=lambda x: x.get("final_score") or 0, reverse=True)
    for i, r in enumerate(af2_results):
        print(f"  #{i+1}  final={r['final_score']:.4f}  pLDDT={r['plddt']:.1f}  "
              f"ipTM={r['iptm']:.3f}  local={r['local_fitness']:.4f}")

    # --- Pareto ---
    print("\n[Pareto] Computing Pareto front")
    front = pareto_front(af2_results)
    plot_pareto(af2_results, front, output_path="results/test_pareto.json")
    print(f"  {len(front)}/{len(af2_results)} candidates on Pareto front")

    # --- Save results ---
    Path("results").mkdir(exist_ok=True)
    Path("results/test_run.json").write_text(
        json.dumps(
            [{k: v for k, v in r.items() if k != "pdb"} for r in af2_results],
            indent=2, default=str,
        )
    )
    best = af2_results[0]
    print(f"\n[Best] seq[:30]={best['sequence'][:30]}")
    print(f"       final_score={best['final_score']:.4f}  "
          f"pLDDT={best['plddt']:.1f}  ipTM={best['iptm']:.3f}")
    print("\n=== Test PASSED — full pipeline flow OK, 0 Tamarind calls ===")


if __name__ == "__main__":
    main()
