"""
Fluorescent protein brightness model.

Scores how well a given FP sequence (or FP+linker construct) is expected
to produce a bright fluorescent signal, based on known FPbase data.

For the hackathon: simple lookup against known FP brightness values.
Replace with a trained MLP if time allows.
"""

# Brightness values (relative units) sourced from FPbase.
# Higher = brighter. Normalized to [0, 1] relative to mVenus.
FP_BRIGHTNESS = {
    "GFP":     0.67,
    "mCherry": 0.47,
    "mVenus":  1.00,
    "mTurquoise2": 0.84,
    "mNeonGreen":  1.02,
}

# Penalize forbidden sequence motifs
FORBIDDEN_MOTIFS = ["CC", "CCC", "MGSS"]  # cysteine-rich, signal peptide artifacts


def brightness_score(fp_name: str, linker: str = "") -> float:
    """
    Return a brightness score in [0, 1] for the given FP with an optional linker.

    Applies a small penalty if the linker contains forbidden motifs.
    """
    base = FP_BRIGHTNESS.get(fp_name, 0.5)
    penalty = sum(0.1 for motif in FORBIDDEN_MOTIFS if motif in linker)
    return max(0.0, base - penalty)


def score_construct(fp_name: str, linker: str, receptor_loop: str) -> float:
    """
    Score a full FP-insertion construct.
    Combines brightness with a loop compatibility heuristic:
    prefer short, glycine-rich linkers.
    """
    bright = brightness_score(fp_name, linker)
    # Reward GGS-rich linkers (flexible, FP-insertion-friendly)
    ggs_fraction = (linker.count("G") + linker.count("S")) / max(len(linker), 1)
    loop_score = ggs_fraction
    return 0.7 * bright + 0.3 * loop_score
