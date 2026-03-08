from __future__ import annotations

"""
BLOSUM62 conservation scorer — replaces ProteinMPNN placeholder.

Scores how conservative each mutation is relative to wild-type SSTR2,
using the BLOSUM62 substitution matrix. This is fast, local, and captures
amino acid biochemical similarity without needing a structure or API call.

Score is normalized to [0, 1]:
  1.0 = all mutations are conservative (or identical to WT)
  0.0 = all mutations are radical substitutions penalised by BLOSUM62
"""

from scorers.tmbed import SSTR2_WILDTYPE

# BLOSUM62 matrix — subset of the most common substitutions.
# Values are log-odds scores; negative = penalised, positive = favoured.
# Full matrix: https://www.ncbi.nlm.nih.gov/Class/StructQual/BlosumReport.html
BLOSUM62: dict[tuple[str, str], int] = {
    ('A','A'): 4,  ('A','R'):-1,  ('A','N'):-2,  ('A','D'):-2,  ('A','C'): 0,
    ('A','Q'):-1,  ('A','E'):-1,  ('A','G'): 0,  ('A','H'):-2,  ('A','I'):-1,
    ('A','L'):-1,  ('A','K'):-1,  ('A','M'):-1,  ('A','F'):-2,  ('A','P'):-1,
    ('A','S'): 1,  ('A','T'): 0,  ('A','W'):-3,  ('A','Y'):-2,  ('A','V'): 0,
    ('R','R'): 5,  ('R','N'):-1,  ('R','D'):-2,  ('R','C'):-3,  ('R','Q'): 1,
    ('R','E'): 0,  ('R','G'):-2,  ('R','H'): 0,  ('R','I'):-3,  ('R','L'):-2,
    ('R','K'): 2,  ('R','M'):-1,  ('R','F'):-3,  ('R','P'):-2,  ('R','S'):-1,
    ('R','T'):-1,  ('R','W'):-3,  ('R','Y'):-2,  ('R','V'):-3,
    ('N','N'): 6,  ('N','D'): 1,  ('N','C'):-3,  ('N','Q'): 0,  ('N','E'): 0,
    ('N','G'): 0,  ('N','H'): 1,  ('N','I'):-3,  ('N','L'):-3,  ('N','K'): 0,
    ('N','M'):-2,  ('N','F'):-3,  ('N','P'):-2,  ('N','S'): 1,  ('N','T'): 0,
    ('N','W'):-4,  ('N','Y'):-2,  ('N','V'):-3,
    ('D','D'): 6,  ('D','C'):-3,  ('D','Q'): 0,  ('D','E'): 2,  ('D','G'):-1,
    ('D','H'):-1,  ('D','I'):-3,  ('D','L'):-4,  ('D','K'):-1,  ('D','M'):-3,
    ('D','F'):-3,  ('D','P'):-1,  ('D','S'): 0,  ('D','T'):-1,  ('D','W'):-4,
    ('D','Y'):-3,  ('D','V'):-3,
    ('C','C'): 9,  ('C','Q'):-3,  ('C','E'):-4,  ('C','G'):-3,  ('C','H'):-3,
    ('C','I'):-1,  ('C','L'):-1,  ('C','K'):-3,  ('C','M'):-1,  ('C','F'):-2,
    ('C','P'):-3,  ('C','S'):-1,  ('C','T'):-1,  ('C','W'):-2,  ('C','Y'):-2,
    ('C','V'):-1,
    ('Q','Q'): 5,  ('Q','E'): 2,  ('Q','G'):-2,  ('Q','H'): 0,  ('Q','I'):-3,
    ('Q','L'):-2,  ('Q','K'): 1,  ('Q','M'): 0,  ('Q','F'):-3,  ('Q','P'):-1,
    ('Q','S'): 0,  ('Q','T'):-1,  ('Q','W'):-2,  ('Q','Y'):-1,  ('Q','V'):-2,
    ('E','E'): 5,  ('E','G'):-2,  ('E','H'): 0,  ('E','I'):-3,  ('E','L'):-3,
    ('E','K'): 1,  ('E','M'):-2,  ('E','F'):-3,  ('E','P'):-1,  ('E','S'): 0,
    ('E','T'):-1,  ('E','W'):-3,  ('E','Y'):-2,  ('E','V'):-2,
    ('G','G'): 6,  ('G','H'):-2,  ('G','I'):-4,  ('G','L'):-4,  ('G','K'):-2,
    ('G','M'):-3,  ('G','F'):-3,  ('G','P'):-2,  ('G','S'): 0,  ('G','T'):-2,
    ('G','W'):-2,  ('G','Y'):-3,  ('G','V'):-3,
    ('H','H'): 8,  ('H','I'):-3,  ('H','L'):-3,  ('H','K'):-1,  ('H','M'):-2,
    ('H','F'):-1,  ('H','P'):-2,  ('H','S'):-1,  ('H','T'):-2,  ('H','W'):-2,
    ('H','Y'): 2,  ('H','V'):-3,
    ('I','I'): 4,  ('I','L'): 2,  ('I','K'):-1,  ('I','M'): 1,  ('I','F'): 0,
    ('I','P'):-3,  ('I','S'):-2,  ('I','T'):-1,  ('I','W'):-3,  ('I','Y'):-1,
    ('I','V'): 3,
    ('L','L'): 4,  ('L','K'):-2,  ('L','M'): 2,  ('L','F'): 0,  ('L','P'):-3,
    ('L','S'):-2,  ('L','T'):-1,  ('L','W'):-2,  ('L','Y'):-1,  ('L','V'): 1,
    ('K','K'): 5,  ('K','M'):-1,  ('K','F'):-3,  ('K','P'):-1,  ('K','S'): 0,
    ('K','T'):-1,  ('K','W'):-3,  ('K','Y'):-2,  ('K','V'):-2,
    ('M','M'): 5,  ('M','F'): 0,  ('M','P'):-2,  ('M','S'):-1,  ('M','T'):-1,
    ('M','W'):-1,  ('M','Y'):-1,  ('M','V'): 1,
    ('F','F'): 6,  ('F','P'):-4,  ('F','S'):-2,  ('F','T'):-2,  ('F','W'): 1,
    ('F','Y'): 3,  ('F','V'):-1,
    ('P','P'): 7,  ('P','S'):-1,  ('P','T'):-1,  ('P','W'):-4,  ('P','Y'):-3,
    ('P','V'):-2,
    ('S','S'): 4,  ('S','T'): 1,  ('S','W'):-3,  ('S','Y'):-2,  ('S','V'):-2,
    ('T','T'): 5,  ('T','W'):-2,  ('T','Y'):-2,  ('T','V'): 0,
    ('W','W'): 11, ('W','Y'): 2,  ('W','V'):-3,
    ('Y','Y'): 7,  ('Y','V'):-1,
    ('V','V'): 4,
}

# Make symmetric
_BLOSUM62_FULL: dict[tuple[str, str], int] = {}
for (a, b), v in BLOSUM62.items():
    _BLOSUM62_FULL[(a, b)] = v
    _BLOSUM62_FULL[(b, a)] = v


def blosum62(a: str, b: str) -> int:
    """Return BLOSUM62 score for amino acid pair (a, b). Returns -4 if unknown."""
    return _BLOSUM62_FULL.get((a, b), -4)


# Max self-substitution score per residue (diagonal), for normalization
_SELF_SCORES = {aa: _BLOSUM62_FULL.get((aa, aa), 1) for aa in "ACDEFGHIKLMNPQRSTVWY"}


def conservation_score(sequence: str, wildtype: str = SSTR2_WILDTYPE) -> float:
    """
    Score how conservative the mutations in `sequence` are relative to `wildtype`.

    For each mutated position, compute BLOSUM62(wt, mut) / BLOSUM62(wt, wt).
    Average over all mutated positions; return 1.0 if no mutations.

    Returns a float in [0, 1].
    """
    if len(sequence) != len(wildtype):
        return 0.3  # length mismatch

    mutations = [
        (wildtype[i], sequence[i])
        for i in range(len(wildtype))
        if wildtype[i] != sequence[i]
    ]

    if not mutations:
        return 1.0  # identical to WT

    scores = []
    for wt_aa, mut_aa in mutations:
        self_score = _SELF_SCORES.get(wt_aa, 4)
        sub_score  = blosum62(wt_aa, mut_aa)
        # Normalize: sub / self_score, clipped to [0, 1]
        normalized = max(0.0, min(1.0, sub_score / max(self_score, 1)))
        scores.append(normalized)

    return sum(scores) / len(scores)
