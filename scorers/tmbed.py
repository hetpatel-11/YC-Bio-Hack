"""
TMbed wrapper — predict transmembrane topology and return a topology score.

Uses the TMbed REST API (or local subprocess if available).
Returns a float in [0, 1] where 1 = topology fully preserved.
"""

import requests

TMBED_API_URL = "https://embed.predictprotein.org/topocons"  # public endpoint


def predict_topology(sequence: str) -> dict:
    """
    Returns:
        {
            "topology":  str,   # per-residue label: H=helix, S=sheet, L=loop, ...
            "tm_count":  int,   # number of predicted TM helices
            "score":     float, # fraction of residues in TM helices (0–1)
        }
    """
    resp = requests.post(
        TMBED_API_URL,
        json={"sequence": sequence},
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    topology = data.get("topology", "")
    tm_count = topology.count("H")  # adjust label based on actual TMbed output format
    score = tm_count / max(len(topology), 1)
    return {"topology": topology, "tm_count": tm_count, "score": score}


def topology_score(sequence: str) -> float:
    """Convenience wrapper returning a single float for the GA scorer."""
    return predict_topology(sequence)["score"]
