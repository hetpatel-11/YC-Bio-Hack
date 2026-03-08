"""
Main pipeline entrypoint — multi-round feedback loop.

Run:
    python pipeline.py

Budget: ~100 Tamarind calls total.

Feedback loop (3 rounds):
  Round 1: GA (30 pop × 40 gen) → ESMFold top-20       (~20 calls)
  Round 2: GA seeded from survivors + pLDDT feedback
           → ESMFold new top-15 (deduped)               (~15 calls)
  Round 3: GA seeded from all survivors + pLDDT feedback
           → ESMFold new top-10 (deduped)               (~10 calls)
  WT baseline ESMFold (for RMSD reference)              (~1 call)
  AF2 multimer top-5                                    (~40 calls)
  ─────────────────────────────────────────────────────────────────
  Total                                                 ~86 calls

GA co-evolves:
  - SSTR2 loop residues (ECL1/2/3, ICL2/3, C-tail)
  - N- and C-linker sequence + length (5–10 AA each)
  - Insertion position within ICL3 (residues 205–252)
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from agent.analyst import generate_summary, select_af2_candidates
from analysis.pareto import pareto_front, plot_pareto
from analysis.rmsd import batch_rmsd
from scorers.ensemble import final_score, tamarind_complex_batch, tamarind_score_batch
from scorers.tamarind import esmfold_plddt, remaining_calls
from search.genetic import Individual, run_ga

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# SSTR2 (Somatostatin Receptor 2, Homo sapiens) — UniProt NP_001041.1, 369 AA
SEED_SEQUENCE = (
    "MDMADEPLNGSHTWLSIPFDLNGSVVSTNTSNQTEPYYDLTSNAVLTFIYFVVCIIGLCGNTLVIYVILR"
    "YAKMKTITNIYILNLAIADELFMLGLPFLAMQVALVHWPFGKAICRVVMTVDGINQFTSIFCLTVMSIDR"
    "YLAVVHPIKSAKWRRPRTAKMITMAVWGVSLLVILPIMIYAGLRSNQWGRSSCTINWPGESGAWYTGFII"
    "YTFILGFLVPLTIICLCYLFIIIKVKSSGIRVGSSKRKKSEKKVTRMVSIVVAVFIFCWLPFYIFNVSSV"
    "SMAISPTPALKGMFDFVVVLTYANSCANPILYAFLSDNFKKSFQNVLCLVKVSGTDDGERSDSKQDKSRL"
    "NETTETQRTLLNGDLQTSI"
)

# cpGFP (circularly permuted GFP, cp145 variant) — 219 AA
FP_SEQUENCE = (
    "MTTFKIESRIHGNLNGEKFELVGGGVGEEGRLEIEMKTKDKPLAFSPFLLSHCMGYGFYH"
    "FASFPKGTKNIYLHAATNGGYTNTRKEIYEDGGILEVNFRYTYEFNKIIGDVECIGHGFP"
    "SQSPIFKDTIVKSCPTVDLMLPMSGNIIASSYARAFQLKDGSFYTAEVKNNIDFKNPIHE"
    "SFSKSGPMFTHRRVEETHTKENLAMVEYQQVFNSAPRDM"
)

FP_NAME = "cpGFP"

# GA settings per round
GA_ROUNDS = [
    {"population_size": 30, "n_generations": 40, "top_k": 20, "esmfold_quota": 20},
    {"population_size": 30, "n_generations": 30, "top_k": 15, "esmfold_quota": 15},
    {"population_size": 30, "n_generations": 20, "top_k": 10, "esmfold_quota": 10},
]

TOP_K_AF2 = 5   # final AF2 multimer candidates

RESULTS_DIR = Path("results/runs")


def log(data: dict):
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    run_id = int(time.time())
    (RESULTS_DIR / f"{run_id}.jsonl").open("a").write(json.dumps(data) + "\n")


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def main():
    # WT baseline: chimeric SSTR2-cpGFP at canonical ICL3 mid-point (pos 228)
    # Used only for RMSD reference — 1 Tamarind call, cached forever.
    _wt_linker = "GGSGGS"
    _wt_chimeric = (
        SEED_SEQUENCE[:228]
        + _wt_linker + FP_SEQUENCE + _wt_linker
        + SEED_SEQUENCE[228:]
    )
    print("\n=== Baseline: ESMFold WT chimeric SSTR2-cpGFP@ICL3 (RMSD reference) ===")
    print(f"[pipeline] WT chimeric length: {len(_wt_chimeric)} AA")
    wt_result = esmfold_plddt(_wt_chimeric)
    wt_pdb    = wt_result.get("pdb")
    print(f"[pipeline] WT pLDDT: {wt_result.get('plddt')}")

    # Shared state across rounds
    plddt_cache: dict[str, float] = {}   # chimeric_sequence → pLDDT
    all_individuals: list[Individual] = []
    seed_survivors: list[Individual] = []   # top Individual objects from prior round

    # -----------------------------------------------------------------------
    # Feedback loop
    # -----------------------------------------------------------------------
    for round_idx, cfg in enumerate(GA_ROUNDS, start=1):
        print(f"\n{'='*60}")
        print(f"  Round {round_idx} / {len(GA_ROUNDS)}")
        print(f"  Budget remaining: {remaining_calls()} calls")
        print(f"{'='*60}")

        print(f"\n[Round {round_idx}] GA: {cfg['population_size']} pop × {cfg['n_generations']} gen")
        top_individuals = run_ga(
            seed_receptor=SEED_SEQUENCE,
            fp_sequence=FP_SEQUENCE,
            fp_name=FP_NAME,
            population_size=cfg["population_size"],
            n_generations=cfg["n_generations"],
            top_k=cfg["top_k"],
            plddt_cache=plddt_cache,
            round_num=round_idx,
            seed_individuals=seed_survivors,
        )
        all_individuals.extend(top_individuals)

        for ind in top_individuals:
            log({
                "phase": f"ga_r{round_idx}",
                "sequence": ind.sequence,
                "fitness": ind.fitness,
                "insert_pos": ind.insert_pos,
                "linker_n": ind.linker_n,
                "linker_c": ind.linker_c,
            })

        # --- ESMFold: score chimeric sequences not yet in cache ---
        new_sequences = [
            ind.sequence for ind in top_individuals
            if ind.sequence not in plddt_cache
        ][:cfg["esmfold_quota"]]

        print(f"\n[Round {round_idx}] ESMFold: {len(new_sequences)} new sequences "
              f"({cfg['top_k'] - len(new_sequences)} cache hits)")

        if new_sequences:
            esmfold_results = tamarind_score_batch(new_sequences)
            for r in esmfold_results:
                seq   = r.get("sequence", "")
                plddt = r.get("plddt")
                if seq and plddt is not None:
                    plddt_cache[seq] = plddt
                log({"phase": f"esmfold_r{round_idx}", **{k: v for k, v in r.items() if k != "pdb"}})

        # --- Survivors: top-k individuals by pLDDT (for next round seeding) ---
        ranked_inds = sorted(
            [ind for ind in top_individuals if ind.sequence in plddt_cache],
            key=lambda x: plddt_cache[x.sequence],
            reverse=True,
        )
        seed_survivors = ranked_inds[:cfg["top_k"]]

        top5_plddt = [(plddt_cache[ind.sequence], ind.insert_pos, ind.linker_n, ind.linker_c)
                      for ind in seed_survivors[:5]]
        print(f"[Round {round_idx}] Top pLDDT:")
        for plddt, pos, ln, lc in top5_plddt:
            print(f"  pLDDT={plddt:.1f}  pos={pos}  ln={ln}  lc={lc}")

    # -----------------------------------------------------------------------
    # Save ESMFold results
    # -----------------------------------------------------------------------
    esmfold_results_path = "results/esmfold_results.json"
    esmfold_summary = [
        {"sequence": seq, "plddt": plddt}
        for seq, plddt in sorted(plddt_cache.items(), key=lambda x: x[1], reverse=True)
    ]
    Path(esmfold_results_path).parent.mkdir(parents=True, exist_ok=True)
    Path(esmfold_results_path).write_text(json.dumps(esmfold_summary, indent=2))
    print(f"\n[pipeline] {len(plddt_cache)} unique chimeric sequences scored by ESMFold")

    # -----------------------------------------------------------------------
    # Agent selects top-5 for AF2
    # -----------------------------------------------------------------------
    print("\n=== Agent: selecting AF2 candidates ===")
    agent_rationale = select_af2_candidates(esmfold_results_path, n=TOP_K_AF2)
    print(f"[agent] {agent_rationale[:300]}...")

    af2_shortlist_path = "results/af2_shortlist.json"
    if Path(af2_shortlist_path).exists():
        shortlist = json.loads(Path(af2_shortlist_path).read_text())
        top5_sequences = [c["sequence"] for c in shortlist.get("candidates", [])]
    else:
        top5_sequences = [seq for seq, _ in
                          sorted(plddt_cache.items(), key=lambda x: x[1], reverse=True)[:TOP_K_AF2]]

    # -----------------------------------------------------------------------
    # AF2 multimer — submit full chimeric as chain A, nothing else needed
    # (Tamarind folds the chimeric sequence as a monomer for ipTM scoring)
    # -----------------------------------------------------------------------
    print(f"\n=== AF2 multimer: {len(top5_sequences)} candidates ===")
    chain_pairs = [(seq, FP_SEQUENCE) for seq in top5_sequences]
    af2_results = tamarind_complex_batch(chain_pairs)

    # -----------------------------------------------------------------------
    # RMSD vs WT baseline
    # -----------------------------------------------------------------------
    print("\n=== RMSD analysis vs WT ===")
    if wt_pdb:
        af2_results = batch_rmsd(af2_results, reference_pdb=wt_pdb)
        for r in af2_results:
            print(f"  TM RMSD={r.get('tm_rmsd')} Å  global RMSD={r.get('global_rmsd')} Å")
    else:
        print("[rmsd] WARNING: no WT PDB, skipping")

    # -----------------------------------------------------------------------
    # Final composite ranking
    # -----------------------------------------------------------------------
    local_map = {ind.sequence: ind.fitness for ind in all_individuals}
    for r in af2_results:
        seq = r["chains"][0]
        r["sequence"]      = seq
        r["plddt"]         = r.get("plddt") or plddt_cache.get(seq)
        r["local_fitness"] = local_map.get(seq, 0)
        r["final_score"]   = final_score(r)
        log({"phase": "af2", **{k: v for k, v in r.items() if k != "pdb"}})

    af2_results.sort(key=lambda x: x.get("final_score") or 0, reverse=True)

    # -----------------------------------------------------------------------
    # Pareto front + save outputs
    # -----------------------------------------------------------------------
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

    best = af2_results[0]
    print(f"\n[pipeline] Best candidate: {best['sequence'][:30]}...")
    print(f"[pipeline] final_score={best['final_score']:.3f}  "
          f"ipTM={best.get('iptm')}  pLDDT={best.get('plddt')}  TM_RMSD={best.get('tm_rmsd')} Å")

    # -----------------------------------------------------------------------
    # AI Agent: demo summary
    # -----------------------------------------------------------------------
    print("\n=== Agent: generating demo summary ===")
    summary = generate_summary(af2_results_path)
    print(summary)

    print(f"\n=== Done | total Tamarind calls used: {100 - remaining_calls()} ===")


if __name__ == "__main__":
    main()
