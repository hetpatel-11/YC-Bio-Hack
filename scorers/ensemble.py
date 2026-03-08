"""
Unified scorer ensemble.

Two-phase design:
  Phase 1 (GA search) — local/free scorers only, no Tamarind calls.
  Phase 2 (post-GA)   — Tamarind ESMFold on top-50, then AF2 on top-5.

Usage:
    from scorers.ensemble import local_score, tamarind_score_batch

    # inside GA loop — FREE
    fitness = local_score(sequence, fp_name="mVenus", linker="GGSGGS")

    # after GA — uses API budget
    results = tamarind_score_batch(top50_sequences)
"""

from scorers.fp_model import score_construct
from scorers.tmbed import topology_score

# Weights for the GA search (local phase only)
LOCAL_WEIGHTS = {
    "tmbed":       0.40,
    "fp_brightness": 0.35,
    "proteinmpnn": 0.25,
}


def _proteinmpnn_score(sequence: str) -> float:
    """
    Placeholder — replace with actual ProteinMPNN call.
    ProteinMPNN can be run locally; returns log-probability score normalized to [0,1].
    """
    # TODO: call ProteinMPNN subprocess or local server
    return 0.5


def local_score(
    sequence: str,
    fp_name: str = "mVenus",
    linker: str = "GGSGGS",
    receptor_loop: str = "",
) -> float:
    """
    Compute a weighted local fitness score for use inside the GA.
    No Tamarind API calls — safe to call thousands of times.

    Returns a float in [0, 1].
    """
    tm = topology_score(sequence)
    fp = score_construct(fp_name, linker, receptor_loop)
    mpnn = _proteinmpnn_score(sequence)

    score = (
        LOCAL_WEIGHTS["tmbed"]        * tm
        + LOCAL_WEIGHTS["fp_brightness"] * fp
        + LOCAL_WEIGHTS["proteinmpnn"] * mpnn
    )
    return score


def tamarind_score_batch(sequences: list[str]) -> list[dict]:
    """
    Phase 2: score top-50 sequences with Tamarind ESMFold.
    Call ONCE after GA has converged — never from inside the search loop.

    Returns list of dicts with keys: sequence, plddt, pdb.
    """
    from scorers.tamarind import batch_esmfold  # import here to avoid accidental use

    raw = batch_esmfold(sequences)
    return [
        {"sequence": seq, **result}
        for seq, result in zip(sequences, raw)
    ]


def tamarind_complex_batch(chain_pairs: list[tuple[str, str]]) -> list[dict]:
    """
    Phase 3: run AlphaFold2 multimer on top-5 receptor+FP chain pairs.
    Call ONCE — ~40 API calls total.

    Returns list of dicts with keys: chains, plddt, ptm, iptm, pdb.
    """
    from scorers.tamarind import alphafold2_multimer

    results = []
    for receptor, fp in chain_pairs:
        result = alphafold2_multimer([receptor, fp])
        results.append({"chains": [receptor, fp], **result})
    return results
