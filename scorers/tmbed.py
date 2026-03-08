from __future__ import annotations

"""
TM topology scorer — SSTR2 hardcoded topology (no external API).

The TMbed public REST endpoint is unreliable. Since mutations are already
restricted to known loop regions via MUTABLE_POSITIONS in genetic.py,
live TM prediction is not needed during the GA.

This module uses the published SSTR2 UniProt topology to:
  1. Safety-check that no mutations landed in TM helices.
  2. Return a score of 1.0 if TM regions are intact, with a per-residue
     penalty of 0.2 for any TM mutation.
"""

# SSTR2 TM helix residue ranges (1-indexed, inclusive).
# Source: UniProt P30874 topology annotation.
SSTR2_TM_HELICES = [
    (23,  50),   # TM1
    (55,  82),   # TM2
    (90, 116),   # TM3
    (125, 148),  # TM4
    (174, 204),  # TM5
    (253, 280),  # TM6
    (288, 313),  # TM7
]

# 0-indexed set for fast membership checks
_TM_POSITIONS: set[int] = {
    i
    for start, end in SSTR2_TM_HELICES
    for i in range(start - 1, end)
}

SSTR2_WILDTYPE = (
    "MDMADEPLNGSHTWLSIPFDLNGSVVSTNTSNQTEPYYDLTSNAVLTFIYFVVCIIGLCGNTLVIYVILR"
    "YAKMKTITNIYILNLAIADELFMLGLPFLAMQVALVHWPFGKAICRVVMTVDGINQFTSIFCLTVMSIDR"
    "YLAVVHPIKSAKWRRPRTAKMITMAVWGVSLLVILPIMIYAGLRSNQWGRSSCTINWPGESGAWYTGFII"
    "YTFILGFLVPLTIICLCYLFIIIKVKSSGIRVGSSKRKKSEKKVTRMVSIVVAVFIFCWLPFYIFNVSSV"
    "SMAISPTPALKGMFDFVVVLTYANSCANPILYAFLSDNFKKSFQNVLCLVKVSGTDDGERSDSKQDKSRL"
    "NETTETQRTLLNGDLQTSI"
)


def topology_score(sequence: str) -> float:
    """
    Return 1.0 if all TM helix positions are unchanged from wild-type.
    Penalty: -0.2 per mutated TM residue, floored at 0.0.
    """
    if len(sequence) != len(SSTR2_WILDTYPE):
        return 0.5  # length change — cautious penalty

    tm_mutations = sum(
        1 for i in _TM_POSITIONS
        if i < len(sequence) and sequence[i] != SSTR2_WILDTYPE[i]
    )
    return max(0.0, 1.0 - 0.2 * tm_mutations)


def get_topology_annotation() -> dict:
    """Return SSTR2 topology metadata for use in the FP insertion sweep."""
    return {
        "tm_helices": SSTR2_TM_HELICES,
        "tm_positions": _TM_POSITIONS,
        "sequence_length": len(SSTR2_WILDTYPE),
    }
