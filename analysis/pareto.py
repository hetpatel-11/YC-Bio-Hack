from __future__ import annotations

"""
Pareto front computation and plotting.

Objectives: pLDDT (folding confidence) vs. ipTM (binding affinity).
Both are maximized.
"""

import json
from pathlib import Path


def _val(candidate: dict, obj: str) -> float:
    """Return numeric value for objective, defaulting to 0 if None/missing."""
    v = candidate.get(obj)
    return float(v) if v is not None else 0.0


def is_dominated(a: dict, b: dict, objectives: list[str]) -> bool:
    """Return True if candidate `a` is dominated by `b`."""
    return all(_val(b, obj) >= _val(a, obj) for obj in objectives) and any(
        _val(b, obj) > _val(a, obj) for obj in objectives
    )


def pareto_front(candidates: list[dict], objectives: list[str] = ["plddt", "iptm"]) -> list[dict]:
    """Return the subset of candidates on the Pareto front."""
    front = []
    for a in candidates:
        dominated = any(is_dominated(a, b, objectives) for b in candidates if b is not a)
        if not dominated:
            front.append(a)
    return front


def plot_pareto(candidates: list[dict], front: list[dict], output_path: str = "results/pareto.html"):
    """
    Generate a simple interactive Pareto plot using plotly (if available),
    otherwise dump JSON for the dashboard to render.
    """
    try:
        import plotly.graph_objects as go

        non_front = [c for c in candidates if c not in front]

        fig = go.Figure()
        fig.add_trace(go.Scatter(
            x=[c["plddt"] for c in non_front],
            y=[c["iptm"] for c in non_front],
            mode="markers",
            name="Candidates",
            marker=dict(color="lightblue", size=6),
            text=[c.get("sequence", "")[:20] for c in non_front],
        ))
        fig.add_trace(go.Scatter(
            x=[c["plddt"] for c in front],
            y=[c["iptm"] for c in front],
            mode="markers+lines",
            name="Pareto Front",
            marker=dict(color="red", size=10, symbol="star"),
            text=[c.get("sequence", "")[:20] for c in front],
        ))
        fig.update_layout(
            title="Pareto Front: pLDDT vs. ipTM",
            xaxis_title="pLDDT (folding confidence)",
            yaxis_title="ipTM (binding interface quality)",
        )
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        fig.write_html(output_path)
        print(f"[pareto] saved plot to {output_path}")
    except ImportError:
        # Fallback: dump JSON for dashboard
        out = Path(output_path).with_suffix(".json")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"candidates": candidates, "front": front}, indent=2))
        print(f"[pareto] plotly not available — saved JSON to {out}")
