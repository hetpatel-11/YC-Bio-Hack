"""
Main pipeline entrypoint.

Run:
    python pipeline.py

Phases:
  1. GA search      — local scorers only, no API calls
  2. ESMFold batch  — Tamarind, top-50 GA winners (~50 calls)
  3. AF2 complex    — Tamarind, top-5 ESMFold survivors (~40 calls)
  4. Analysis       — Pareto front + results logging
"""

import json
import time
from pathlib import Path

from agent.analyst import generate_summary, select_af2_candidates, select_esmfold_candidates
from analysis.fp_insertion import sweep_insertion_sites
from analysis.pareto import pareto_front, plot_pareto
from scorers.ensemble import tamarind_complex_batch, tamarind_score_batch
from search.genetic import run_ga

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SEED_SEQUENCE = ""  # TODO: paste receptor seed sequence here
FP_NAME = "mVenus"
FP_SEQUENCE = ""    # TODO: paste FP amino acid sequence here
LINKER = "GGSGGS"

GA_POPULATION = 50
GA_GENERATIONS = 100
TOP_K_ESMFOLD = 50  # number of GA winners to send to ESMFold
TOP_K_AF2 = 5       # number of ESMFold survivors to send to AF2

RESULTS_DIR = Path("results/runs")


def log(data: dict):
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    run_id = int(time.time())
    out = RESULTS_DIR / f"{run_id}.jsonl"
    with out.open("a") as f:
        f.write(json.dumps(data) + "\n")


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def main():
    assert SEED_SEQUENCE, "Set SEED_SEQUENCE in pipeline.py before running."

    # -----------------------------------------------------------------------
    # Phase 1: GA search (local scorers only)
    # -----------------------------------------------------------------------
    print("\n=== Phase 1: Genetic Algorithm (local) ===")
    top_candidates = run_ga(
        seed_sequence=SEED_SEQUENCE,
        fp_name=FP_NAME,
        linker=LINKER,
        population_size=GA_POPULATION,
        n_generations=GA_GENERATIONS,
        top_k=TOP_K_ESMFOLD,
    )
    print(f"[pipeline] GA done — {len(top_candidates)} candidates shortlisted")
    ga_results_path = "results/ga_results.json"
    Path(ga_results_path).parent.mkdir(parents=True, exist_ok=True)
    Path(ga_results_path).write_text(
        json.dumps([{"sequence": ind.sequence, "local_fitness": ind.fitness} for ind in top_candidates], indent=2)
    )
    for ind in top_candidates:
        log({"phase": "ga", "sequence": ind.sequence, "local_fitness": ind.fitness})

    # -----------------------------------------------------------------------
    # AI Agent: select best candidates for ESMFold (saves ~5–10 Tamarind calls)
    # -----------------------------------------------------------------------
    print("\n=== Agent: selecting ESMFold candidates ===")
    agent_rationale = select_esmfold_candidates(ga_results_path, n=TOP_K_ESMFOLD)
    print(f"[agent] {agent_rationale[:300]}...")

    esmfold_shortlist_path = "results/esmfold_shortlist.json"
    if Path(esmfold_shortlist_path).exists():
        shortlist_data = json.loads(Path(esmfold_shortlist_path).read_text())
        sequences = [c["sequence"] for c in shortlist_data.get("candidates", [])]
    else:
        sequences = [ind.sequence for ind in top_candidates]  # fallback

    # -----------------------------------------------------------------------
    # Phase 2: ESMFold via Tamarind (~50 calls)
    # -----------------------------------------------------------------------
    print("\n=== Phase 2: Tamarind ESMFold (top-50) ===")
    esmfold_results = tamarind_score_batch(sequences)
    esmfold_results.sort(key=lambda x: x.get("plddt") or 0, reverse=True)
    esmfold_results_path = "results/esmfold_results.json"
    Path(esmfold_results_path).write_text(
        json.dumps([{k: v for k, v in r.items() if k != "pdb"} for r in esmfold_results], indent=2)
    )
    for r in esmfold_results:
        log({"phase": "esmfold", **{k: v for k, v in r.items() if k != "pdb"}})

    # -----------------------------------------------------------------------
    # AI Agent: select best candidates for AF2 (guards the most expensive calls)
    # -----------------------------------------------------------------------
    print("\n=== Agent: selecting AF2 candidates ===")
    agent_rationale_af2 = select_af2_candidates(esmfold_results_path, n=TOP_K_AF2)
    print(f"[agent] {agent_rationale_af2[:300]}...")

    af2_shortlist_path = "results/af2_shortlist.json"
    if Path(af2_shortlist_path).exists():
        af2_shortlist_data = json.loads(Path(af2_shortlist_path).read_text())
        top5_sequences = [c["sequence"] for c in af2_shortlist_data.get("candidates", [])]
    else:
        top5_sequences = [r["sequence"] for r in esmfold_results[:TOP_K_AF2]]  # fallback

    # -----------------------------------------------------------------------
    # Phase 3: AlphaFold2 multimer via Tamarind (~40 calls)
    # -----------------------------------------------------------------------
    print("\n=== Phase 3: Tamarind AF2 multimer (top-5) ===")
    chain_pairs = [(seq, FP_SEQUENCE) for seq in top5_sequences]
    af2_results = tamarind_complex_batch(chain_pairs)
    af2_results.sort(key=lambda x: x.get("iptm") or 0, reverse=True)
    for r in af2_results:
        log({"phase": "af2", **{k: v for k, v in r.items() if k != "pdb"}})

    # -----------------------------------------------------------------------
    # Phase 4: Analysis
    # -----------------------------------------------------------------------
    print("\n=== Phase 4: Analysis ===")

    # Merge ESMFold pLDDT into AF2 results for Pareto
    plddt_map = {r["sequence"]: r.get("plddt") for r in esmfold_results}
    for r in af2_results:
        seq = r["chains"][0]
        r["plddt"] = plddt_map.get(seq)
        r["sequence"] = seq

    front = pareto_front(af2_results)
    plot_pareto(af2_results, front)

    # FP insertion sweep on best candidate
    best_seq = af2_results[0]["sequence"]
    # Topology needed for sweep — use a placeholder until TMbed result is available
    # TODO: read topology from TMbed results for best_seq
    print(f"[pipeline] Best candidate: {best_seq[:30]}...")
    print(f"[pipeline] ipTM={af2_results[0].get('iptm'):.3f}  pLDDT={af2_results[0].get('plddt'):.3f}")

    # Save final top-5
    af2_results_path = "results/af2_results.json"
    Path(af2_results_path).write_text(
        json.dumps([{k: v for k, v in r.items() if k != "pdb"} for r in af2_results[:5]], indent=2, default=str)
    )
    Path("results/top5.json").write_text(
        json.dumps(af2_results[:5], indent=2, default=str)
    )

    # -----------------------------------------------------------------------
    # AI Agent: generate final summary for demo
    # -----------------------------------------------------------------------
    print("\n=== Agent: generating demo summary ===")
    summary = generate_summary(af2_results_path)
    print(summary)

    print("\n=== Done. Results saved to results/ ===")


if __name__ == "__main__":
    main()
