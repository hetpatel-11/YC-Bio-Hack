from __future__ import annotations

"""
Unified scorer ensemble.

Two-phase design:
  Phase 1 (GA search)  — local/free scorers only, no Tamarind calls.
  Phase 2 (post-GA)    — Tamarind ESMFold on top-50, then AF2 on top-5.
  Phase 3 (post-AF2)   — structural RMSD vs WT reference structure.

Local scorers used in GA:
  - TM topology check  (hardcoded SSTR2 topology — no API)
  - BLOSUM62 conservation score  (replaces ProteinMPNN stub)
  - FP brightness / linker score

Usage:
    from scorers.ensemble import local_score, tamarind_score_batch

    # inside GA loop — FREE, no API calls
    fitness = local_score(sequence, fp_name="cpGFP", linker="GGSGGS")

    # after GA — uses Tamarind API budget
    results = tamarind_score_batch(top50_sequences)
"""

from scorers.conservation import conservation_score
from scorers.fp_model import score_construct
from scorers.tmbed import SSTR2_WILDTYPE, topology_score

# ---------------------------------------------------------------------------
# GA phase weights (all local, no API)
# ---------------------------------------------------------------------------
LOCAL_WEIGHTS = {
    "conservation": 0.45,  # BLOSUM62 — how conservative are loop mutations
    "fp_score":     0.30,  # cpGFP brightness + linker compatibility
    "tm_integrity": 0.25,  # TM helix preservation (safety check)
}


def local_score(
    sequence: str,
    fp_name: str = "cpGFP",
    linker: str = "GGSGGS",
    receptor_loop: str = "",
) -> float:
    """
    Compute weighted local fitness score for use inside the GA.
    No Tamarind API calls — safe to call thousands of times.

    Returns a float in [0, 1].
    """
    cons = conservation_score(sequence, wildtype=SSTR2_WILDTYPE)
    fp   = score_construct(fp_name, linker, receptor_loop)
    tm   = topology_score(sequence)

    return (
        LOCAL_WEIGHTS["conservation"] * cons
        + LOCAL_WEIGHTS["fp_score"]     * fp
        + LOCAL_WEIGHTS["tm_integrity"] * tm
    )


# ---------------------------------------------------------------------------
# Post-GA Tamarind phases
# ---------------------------------------------------------------------------

def tamarind_score_batch(sequences: list[str]) -> list[dict]:
    """
    Phase 2: score top-50 sequences with Tamarind ESMFold.
    Call ONCE after GA — never from inside the search loop.

    Returns list of dicts with keys: sequence, plddt, pdb.
    """
    from scorers.tamarind import batch_esmfold  # late import guards accidental use

    raw = batch_esmfold(sequences)
    return [{"sequence": seq, **result} for seq, result in zip(sequences, raw)]


def tamarind_complex_batch(chain_pairs: list[tuple[str, str]]) -> list[dict]:
    """
    Phase 3: run AlphaFold2 multimer on top-5 receptor+ligand chain pairs.
    Submits ALL jobs at once then polls them concurrently — wall time ≈ 1 job.

    Returns list of dicts with keys: chains, plddt, ptm, iptm, pdb.
    """
    from scorers.tamarind import alphafold2_multimer_batch

    chain_lists = [[receptor, ligand] for receptor, ligand in chain_pairs]
    raw_results = alphafold2_multimer_batch(chain_lists)
    return [
        {"chains": list(chains), **(result or {})}
        for chains, result in zip(chain_pairs, raw_results)
    ]


# ---------------------------------------------------------------------------
# Final composite ranking (after all phases complete)
# ---------------------------------------------------------------------------

def final_score(candidate: dict) -> float:
    """
    Composite score for final ranking of AF2 results.
    Combines structural metrics from all three phases.

    candidate dict should contain: plddt, iptm, local_fitness, tm_rmsd,
    and optionally orthogonal_validation (MD/Rosetta/assay blend).
    """
    plddt         = (candidate.get("plddt") or 0) / 100   # normalize to [0,1]
    iptm          = candidate.get("iptm") or 0
    local_fitness = candidate.get("local_fitness") or 0

    # tm_rmsd: lower = better; convert to a [0,1] score (cap at 5Å = 0.0)
    tm_rmsd = candidate.get("tm_rmsd")
    rmsd_score = max(0.0, 1.0 - (tm_rmsd / 5.0)) if tm_rmsd is not None else 0.5

    validation = candidate.get("orthogonal_validation")
    if validation is None:
        validation = candidate.get("validation_score")
    validation = validation if validation is not None else 0.5

    return (
        0.30 * plddt
        + 0.30 * iptm
        + 0.15 * rmsd_score
        + 0.15 * local_fitness
        + 0.10 * validation
    )
