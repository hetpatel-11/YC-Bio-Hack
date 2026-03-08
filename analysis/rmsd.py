from __future__ import annotations

"""
RMSD analysis — compare mutant SSTR2 structures to wild-type.

Two modes:
  1. Sequence-level RMSD proxy (GA phase, no structure needed):
     Weighted Hamming distance over loop regions, penalising radical changes.

  2. Structural Cα RMSD (post-Tamarind, using BioPython):
     Parse PDB strings from ESMFold/AF2 results and compute Cα RMSD
     of TM helices between wild-type and each candidate.
     Lower RMSD = better preservation of SSTR2 fold.
"""

import io

from scorers.tmbed import SSTR2_WILDTYPE, SSTR2_TM_HELICES

# ---------------------------------------------------------------------------
# Sequence-level RMSD proxy (used in GA / local phase)
# ---------------------------------------------------------------------------

def sequence_rmsd_proxy(sequence: str, wildtype: str = SSTR2_WILDTYPE) -> float:
    """
    Normalized Hamming distance over TM helix positions only.
    Returns 0.0 (no change) to 1.0 (every TM residue mutated).
    Used as a cheap structural conservation proxy during GA search.
    """
    from scorers.tmbed import _TM_POSITIONS

    if len(sequence) != len(wildtype):
        return 1.0  # penalise length changes fully

    tm_pos = list(_TM_POSITIONS)
    if not tm_pos:
        return 0.0

    mismatches = sum(
        1 for i in tm_pos
        if i < len(sequence) and sequence[i] != wildtype[i]
    )
    return mismatches / len(tm_pos)


# ---------------------------------------------------------------------------
# Structural Cα RMSD (post-Tamarind, requires PDB strings)
# ---------------------------------------------------------------------------

def _parse_ca_coords(pdb_string: str, chain_id: str = "A") -> dict[int, tuple]:
    """
    Parse Cα atom coordinates from a PDB string.
    Returns {residue_number: (x, y, z)}.
    """
    coords = {}
    for line in pdb_string.splitlines():
        if not line.startswith("ATOM"):
            continue
        atom_name = line[12:16].strip()
        chain = line[21].strip()
        if atom_name != "CA" or chain != chain_id:
            continue
        try:
            res_num = int(line[22:26].strip())
            x = float(line[30:38])
            y = float(line[38:46])
            z = float(line[46:54])
            coords[res_num] = (x, y, z)
        except ValueError:
            continue
    return coords


def _rmsd(coords_a: dict, coords_b: dict, residues: list[int]) -> float:
    """Compute Cα RMSD over the given residue numbers."""
    import math

    diffs = []
    for r in residues:
        if r in coords_a and r in coords_b:
            a, b = coords_a[r], coords_b[r]
            diffs.append((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2)

    if not diffs:
        return float("nan")
    return math.sqrt(sum(diffs) / len(diffs))


def structural_rmsd(
    mutant_pdb: str,
    reference_pdb: str,
    regions: list[tuple[int, int]] = SSTR2_TM_HELICES,
    chain_id: str = "A",
) -> dict:
    """
    Compute Cα RMSD of specified regions between mutant and reference PDB strings.
    Does NOT require superposition — assumes Tamarind outputs are already in a
    comparable frame, or that relative RMSD trends are sufficient for ranking.

    Args:
        mutant_pdb:   PDB string from Tamarind ESMFold/AF2
        reference_pdb: PDB string for wild-type SSTR2 (ESMFold baseline call)
        regions:      List of (start, end) residue ranges (1-indexed, inclusive)
        chain_id:     Chain to compare (default 'A')

    Returns:
        {
            "tm_rmsd":    float,   # RMSD over TM helices (main metric)
            "global_rmsd": float,  # RMSD over all shared residues
            "n_residues":  int,    # number of Cα pairs used
        }
    """
    mut_coords = _parse_ca_coords(mutant_pdb, chain_id)
    ref_coords = _parse_ca_coords(reference_pdb, chain_id)

    tm_residues = [
        r for start, end in regions for r in range(start, end + 1)
    ]
    all_residues = sorted(set(mut_coords) & set(ref_coords))

    tm_rmsd = _rmsd(mut_coords, ref_coords, tm_residues)
    global_rmsd = _rmsd(mut_coords, ref_coords, all_residues)

    return {
        "tm_rmsd":     round(tm_rmsd, 3) if tm_rmsd == tm_rmsd else None,
        "global_rmsd": round(global_rmsd, 3) if global_rmsd == global_rmsd else None,
        "n_residues":  len(all_residues),
    }


def batch_rmsd(candidates: list[dict], reference_pdb: str) -> list[dict]:
    """
    Compute structural RMSD for a batch of candidates.
    Each candidate dict must have a 'pdb' key with a PDB string.
    Adds 'tm_rmsd' and 'global_rmsd' fields in-place and returns the list.
    """
    for c in candidates:
        pdb = c.get("pdb")
        if not pdb:
            c["tm_rmsd"] = None
            c["global_rmsd"] = None
            continue
        result = structural_rmsd(pdb, reference_pdb)
        c.update(result)
    return candidates
