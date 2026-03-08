"""
Tamarind API wrapper — ESMFold (monomer pLDDT) and AlphaFold2 (complex ipTM).

BUDGET: ~100 calls total. This module enforces a hard stop at MAX_CALLS.
Never call from inside a search loop — only from post-GA batch steps.
"""

import json
import os
import time
from pathlib import Path

import requests

TAMARIND_API_KEY = os.environ.get("TAMARIND_API_KEY", "")
BASE_URL = "https://api.tamarind.bio"  # update if different

CACHE_FILE = Path(__file__).parent.parent / "results" / "tamarind_cache.json"
COUNTER_FILE = Path(__file__).parent.parent / "results" / "tamarind_calls.json"
MAX_CALLS = 95  # hard stop — 5-call buffer below the 100 limit


# ---------------------------------------------------------------------------
# Call tracking
# ---------------------------------------------------------------------------

def _load_counter() -> int:
    if COUNTER_FILE.exists():
        return json.loads(COUNTER_FILE.read_text())["calls"]
    return 0


def _increment_counter() -> int:
    count = _load_counter() + 1
    COUNTER_FILE.parent.mkdir(parents=True, exist_ok=True)
    COUNTER_FILE.write_text(json.dumps({"calls": count}))
    return count


def remaining_calls() -> int:
    return MAX_CALLS - _load_counter()


def _guard():
    used = _load_counter()
    if used >= MAX_CALLS:
        raise RuntimeError(
            f"Tamarind call budget exhausted ({used}/{MAX_CALLS}). "
            "Increase MAX_CALLS only with explicit approval."
        )


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

def _load_cache() -> dict:
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text())
    return {}


def _save_cache(cache: dict):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, indent=2))


def _cache_key(tool: str, sequence: str, **kwargs) -> str:
    extras = json.dumps(kwargs, sort_keys=True)
    return f"{tool}::{sequence}::{extras}"


# ---------------------------------------------------------------------------
# Low-level request
# ---------------------------------------------------------------------------

def _submit_job(tool: str, payload: dict) -> dict:
    """Submit a job and poll until complete. Returns the result dict."""
    _guard()
    headers = {"Authorization": f"Bearer {TAMARIND_API_KEY}", "Content-Type": "application/json"}

    # Submit
    resp = requests.post(f"{BASE_URL}/submit/{tool}", json=payload, headers=headers, timeout=30)
    resp.raise_for_status()
    job_id = resp.json()["job_id"]
    count = _increment_counter()
    print(f"[tamarind] submitted {tool} job {job_id} | calls used: {count}/{MAX_CALLS}")

    # Poll
    for _ in range(120):  # up to 20 min
        time.sleep(10)
        status_resp = requests.get(f"{BASE_URL}/status/{job_id}", headers=headers, timeout=30)
        status_resp.raise_for_status()
        data = status_resp.json()
        if data["status"] == "complete":
            return data
        if data["status"] == "failed":
            raise RuntimeError(f"Tamarind job {job_id} failed: {data.get('error')}")

    raise TimeoutError(f"Tamarind job {job_id} timed out after 20 min")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def esmfold_plddt(sequence: str) -> dict:
    """
    Run ESMFold on a single monomer sequence.
    Returns {"plddt": float, "pdb": str, "raw": dict}.
    Cached — will not re-call for a sequence already scored.
    """
    cache = _load_cache()
    key = _cache_key("esmfold", sequence)
    if key in cache:
        print(f"[tamarind] cache hit: ESMFold {sequence[:20]}...")
        return cache[key]

    result = _submit_job("esmfold", {"sequence": sequence})
    output = {
        "plddt": result.get("plddt_mean"),
        "pdb": result.get("pdb"),
        "raw": result,
    }
    cache[key] = output
    _save_cache(cache)
    return output


def alphafold2_multimer(chains: list[str], num_models: int = 5) -> dict:
    """
    Run AlphaFold2 multimer on a list of chains (protein complex).
    Returns {"plddt": float, "ptm": float, "iptm": float, "pdb": str, "raw": dict}.
    Cached. Counts as 1 API call regardless of num_models.
    """
    sequence_key = "|".join(chains)
    cache = _load_cache()
    key = _cache_key("alphafold2_multimer", sequence_key, num_models=num_models)
    if key in cache:
        print(f"[tamarind] cache hit: AF2 multimer {sequence_key[:30]}...")
        return cache[key]

    payload = {"sequences": chains, "num_models": num_models}
    result = _submit_job("alphafold2_multimer", payload)
    # Use rank-1 model metrics
    best = result.get("models", [result])[0]
    output = {
        "plddt": best.get("plddt_mean"),
        "ptm": best.get("ptm"),
        "iptm": best.get("iptm"),
        "pdb": best.get("pdb"),
        "raw": result,
    }
    cache[key] = output
    _save_cache(cache)
    return output


def batch_esmfold(sequences: list[str]) -> list[dict]:
    """Score a list of sequences with ESMFold. Respects cache and budget."""
    results = []
    for seq in sequences:
        if remaining_calls() <= 0:
            print("[tamarind] WARNING: budget exhausted, stopping batch early")
            break
        results.append(esmfold_plddt(seq))
    return results
