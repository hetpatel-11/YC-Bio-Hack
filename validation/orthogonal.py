from __future__ import annotations

"""Orthogonal validation utilities (MD snapshots, Rosetta filters, assays).

This module exposes a lightweight scoring helper that blends signals from
pre-computed molecular dynamics windows, Rosetta filter hits, and lab assay
benchmarks.  The inputs live in ``data/validation/orthogonal_signals.json`` and
can be updated without touching the code.

The GA uses :func:`estimate_validation_score` to reward constructs that already
have supporting signals, and the pipeline calls :func:`write_validation_report`
to persist a JSON summary for the agent/dashboard.
"""

from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "validation" / "orthogonal_signals.json"
DEFAULT_REPORT = Path("results/orthogonal_validation.json")


def _load_config() -> dict[str, Any]:
    if DATA_PATH.exists():
        with open(DATA_PATH) as fh:
            try:
                return json.load(fh)
            except json.JSONDecodeError:
                pass
    return {"md_windows": [], "rosetta_filters": [], "assays": []}


_CONFIG = _load_config()
_MD_WINDOWS: list[dict[str, Any]] = _CONFIG.get("md_windows", []) or []
_FILTERS: list[dict[str, Any]] = _CONFIG.get("rosetta_filters", []) or []
_ASSAYS: dict[str, dict[str, Any]] = {
    entry.get("sequence_sha1"): entry
    for entry in (_CONFIG.get("assays", []) or [])
    if entry.get("sequence_sha1")
}


@dataclass
class ValidationResult:
    score: float
    sources: list[str]
    md_window: dict[str, Any] | None
    assay: dict[str, Any] | None
    rosetta_hits: list[dict[str, Any]]


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def _sha1(sequence: str) -> str:
    return hashlib.sha1(sequence.encode()).hexdigest()


def _score_md_window(insert_pos: int | None) -> tuple[float | None, dict[str, Any] | None]:
    if insert_pos is None:
        return None, None
    for window in _MD_WINDOWS:
        start, end = window.get("start"), window.get("end")
        if start is None or end is None:
            continue
        if start <= insert_pos <= end:
            return _clamp(float(window.get("stability_score", 0.5))), window
    return None, None


def _score_assay(sequence: str) -> tuple[float | None, dict[str, Any] | None]:
    sha = _sha1(sequence)
    entry = _ASSAYS.get(sha)
    if not entry:
        return None, None
    return _clamp(float(entry.get("score", 0.5))), entry


def _score_rosetta_filters(sequence: str) -> tuple[float | None, list[dict[str, Any]]]:
    if not _FILTERS:
        return None, []
    penalty = 0.0
    hits: list[dict[str, Any]] = []
    for filt in _FILTERS:
        motif = (filt.get("motif") or "").upper()
        if not motif:
            continue
        seq_upper = sequence.upper()
        count = seq_upper.count(motif)
        if not count:
            continue
        penalty += float(filt.get("penalty", 0.0)) * count
        hits.append({
            "name": filt.get("name"),
            "motif": motif,
            "count": count,
            "description": filt.get("description"),
        })
    if not hits:
        return None, []
    return _clamp(1.0 - penalty), hits


def estimate_validation_score(
    sequence: str,
    *,
    insert_pos: int | None = None,
    linker_block: str = "",
) -> dict[str, Any]:
    """Return a blended validation score in [0, 1] plus signal metadata."""
    md_score, md_window = _score_md_window(insert_pos)
    assay_score, assay_entry = _score_assay(sequence)
    rosetta_score, rosetta_hits = _score_rosetta_filters(linker_block or sequence)

    components: list[tuple[str, float, float]] = []
    if md_score is not None:
        components.append(("md", 0.4, md_score))
    if assay_score is not None:
        components.append(("assay", 0.4, assay_score))
    if rosetta_score is not None:
        components.append(("rosetta", 0.2, rosetta_score))

    if components:
        weight_sum = sum(weight for _, weight, _ in components)
        blended = sum(weight * value for _, weight, value in components) / weight_sum
    else:
        weight_sum = 0.0
        blended = 0.5

    return {
        "validation_score": round(_clamp(blended), 4),
        "sources": [name for name, _, _ in components],
        "md_window": md_window,
        "assay": assay_entry,
        "rosetta_hits": rosetta_hits,
        "weight_sum": weight_sum,
    }


def _get_attr(candidate: Any, key: str, default: Any = None) -> Any:
    if isinstance(candidate, dict):
        return candidate.get(key, default)
    return getattr(candidate, key, default)


def summarize_candidates(
    candidates: Iterable[Any],
    *,
    max_items: int | None = None,
) -> list[dict[str, Any]]:
    """Compute validation summaries for a sequence of Individuals/dicts."""
    payload: list[dict[str, Any]] = []
    seen: set[str] = set()
    for candidate in candidates:
        seq = _get_attr(candidate, "sequence")
        if not seq or seq in seen:
            continue
        insert_pos = _get_attr(candidate, "insert_pos")
        linker_n = _get_attr(candidate, "linker_n", "")
        linker_c = _get_attr(candidate, "linker_c", "")
        info = estimate_validation_score(seq, insert_pos=insert_pos, linker_block=linker_n + linker_c)
        payload.append({
            "sequence": seq,
            "insert_pos": insert_pos,
            "linker_n": linker_n,
            "linker_c": linker_c,
            **info,
        })
        seen.add(seq)
        if max_items and len(payload) >= max_items:
            break
    return payload


def write_validation_report(
    candidates: Iterable[Any],
    *,
    path: str | Path = DEFAULT_REPORT,
    max_items: int = 25,
) -> list[dict[str, Any]]:
    """Persist a validation report to ``path`` and return the summaries."""
    summaries = summarize_candidates(candidates, max_items=max_items)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "source": str(DATA_PATH),
        "candidates": summaries,
    }
    with open(path, "w") as fh:
        json.dump(payload, fh, indent=2)
    return summaries


def load_validation_scores(path: str | Path = DEFAULT_REPORT) -> dict[str, float]:
    """Return {sequence: validation_score} from a saved report."""
    path = Path(path)
    if not path.exists():
        return {}
    data = json.loads(path.read_text())
    candidates = data.get("candidates") or []
    return {
        entry.get("sequence"): float(entry.get("validation_score", 0))
        for entry in candidates
        if entry.get("sequence")
    }
