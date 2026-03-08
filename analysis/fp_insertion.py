"""
FP insertion position sweep.

Scans all loop regions in SSTR2 and scores each possible cpGFP insertion
site using local scorers only.

Priority insertion sites for SSTR2 (based on published GPCR biosensor work):
  1. ECL2 (residues 149–173) — extracellular, accessible, large loop
  2. ICL3 (residues 205–252) — intracellular, large and tolerates insertions
  3. ECL3 (residues 281–287) — extracellular, near ligand-binding pocket
"""

from scorers.fp_model import score_construct

# Secondary structure labels considered safe for FP insertion
SAFE_LABELS = {"L", "C", "T", "S"}  # loop, coil, turn, bend (DSSP notation)

# Known priority insertion regions for SSTR2 (0-indexed).
# These are checked first and flagged in the output.
SSTR2_PRIORITY_REGIONS = [
    (148, 173, "ECL2"),
    (204, 252, "ICL3"),
    (280, 287, "ECL3"),
]


def find_loop_positions(topology: str, window: int = 5) -> list[int]:
    """
    Return positions where a window of `window` consecutive residues
    are all in loop/coil regions (safe for FP insertion).
    """
    safe = [c in SAFE_LABELS for c in topology]
    positions = []
    for i in range(len(safe) - window + 1):
        if all(safe[i : i + window]):
            positions.append(i)
    return positions


def insert_fp(sequence: str, position: int, fp_sequence: str, linker: str = "GGSGGS") -> str:
    """Insert FP (with flanking linkers) at the given position."""
    insert = linker + fp_sequence + linker
    return sequence[:position] + insert + sequence[position:]


def sweep_insertion_sites(
    receptor_sequence: str,
    topology: str,
    fp_name: str,
    fp_sequence: str,
    linker: str = "GGSGGS",
) -> list[dict]:
    """
    Try all viable loop insertion positions. Returns list of dicts sorted by score.
    No Tamarind calls — purely local scoring.
    """
    positions = find_loop_positions(topology)
    results = []

    for pos in positions:
        construct = insert_fp(receptor_sequence, pos, fp_sequence, linker)
        loop_context = receptor_sequence[max(0, pos - 5) : pos + 5]
        score = score_construct(fp_name, linker, loop_context)
        # Tag with region name if it falls within a priority region
        region = next(
            (name for start, end, name in SSTR2_PRIORITY_REGIONS if start <= pos < end),
            "other"
        )
        results.append({
            "position": pos,
            "region": region,
            "score": score,
            "construct_length": len(construct),
            "loop_context": loop_context,
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results
