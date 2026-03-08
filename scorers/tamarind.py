from __future__ import annotations

"""
Tamarind API wrapper — ESMFold (monomer pLDDT) and AlphaFold2 (complex ipTM).

API reference: https://app.tamarind.bio/api-docs
Base URL:      https://app.tamarind.bio/api
Auth:          x-api-key header

BUDGET: ~100 calls total. This module enforces a hard stop at MAX_CALLS.
Never call from inside a search loop — only from post-GA batch steps.
"""

import io
import json
import os
import time
import zipfile
from pathlib import Path

import requests

TAMARIND_API_KEY = os.environ.get("TAMARIND_API_KEY", "")
BASE_URL = "https://app.tamarind.bio/api"

CACHE_FILE = Path(__file__).parent.parent / "results" / "tamarind_cache.json"
COUNTER_FILE = Path(__file__).parent.parent / "results" / "tamarind_calls.json"
MAX_CALLS = 95  # hard stop — 5-call buffer below the 100 limit

POLL_INTERVAL = 15   # seconds between status checks
POLL_TIMEOUT  = 120  # max polls before giving up (~30 min)


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
# Low-level request helpers
# ---------------------------------------------------------------------------

def _headers() -> dict:
    return {
        "x-api-key": TAMARIND_API_KEY,
        "Content-Type": "application/json",
    }


def _submit(job_name: str, job_type: str, settings: dict) -> str:
    """POST /submit-job — returns job_id string."""
    _guard()
    payload = {
        "jobName": job_name,
        "type": job_type,
        "settings": settings,
    }
    resp = requests.post(f"{BASE_URL}/submit-job", json=payload, headers=_headers(), timeout=30)
    resp.raise_for_status()
    # Response is a plain success message; job name is used to retrieve results
    count = _increment_counter()
    print(f"[tamarind] submitted '{job_name}' ({job_type}) | calls used: {count}/{MAX_CALLS}")
    return job_name


def _poll(job_name: str) -> dict:
    """
    GET /jobs — poll until job is complete, return the completed job dict.

    Actual API field names (verified from live response):
      JobName, JobStatus, Score (JSON string), Type
    Status values: "Complete", "In Queue", "Running", "Stopped"
    Score is embedded as a JSON string in the job dict — no /result call needed.
    """
    import json as _json
    for attempt in range(POLL_TIMEOUT):
        time.sleep(POLL_INTERVAL)
        resp = requests.get(f"{BASE_URL}/jobs", headers=_headers(), timeout=30)
        resp.raise_for_status()
        body = resp.json()
        jobs = body if isinstance(body, list) else body.get("jobs", [])
        job = next(
            (j for j in jobs if (j.get("JobName") or j.get("jobName")) == job_name),
            None,
        )
        if job is None:
            print(f"[tamarind] job '{job_name}' not found yet ({attempt * POLL_INTERVAL}s)")
            continue
        status = job.get("JobStatus") or job.get("status") or ""
        if status.lower() in ("complete", "completed", "done", "finished"):
            # Parse Score JSON string if present
            score_raw = job.get("Score") or job.get("score")
            if isinstance(score_raw, str):
                try:
                    job["_score"] = _json.loads(score_raw)
                except Exception:
                    job["_score"] = {}
            elif isinstance(score_raw, dict):
                job["_score"] = score_raw
            return job
        if status.lower() in ("failed", "error", "stopped"):
            raise RuntimeError(f"Tamarind job '{job_name}' failed (status={status})")
        print(f"[tamarind] job '{job_name}' status: {status} ({attempt * POLL_INTERVAL}s elapsed)")

    raise TimeoutError(f"Tamarind job '{job_name}' timed out after {POLL_TIMEOUT * POLL_INTERVAL}s")


def _download_pdb(job_name: str) -> str | None:
    """
    POST /result → signed S3 ZIP URL → download ZIP → extract PDB string.

    Tamarind /result returns a quoted URL string (not JSON object).
    The ZIP contains files like 'result.pdb', '<job>.pdb', or similar.
    Also saves PDB to results/pdb/<job_name>.pdb for the dashboard.
    Returns the PDB string or None on failure.
    """
    try:
        resp = requests.post(
            f"{BASE_URL}/result",
            json={"jobName": job_name},
            headers=_headers(),
            timeout=30,
        )
        resp.raise_for_status()

        # Response is a quoted URL string, e.g. '"https://downloads.tamarind.bio/..."'
        url = resp.text.strip().strip('"')
        if not url.startswith("http"):
            print(f"[tamarind] /result did not return a URL: {url[:80]}")
            return None

        # Download the ZIP
        zip_resp = requests.get(url, timeout=120)
        zip_resp.raise_for_status()

        # Extract PDB from ZIP
        pdb_string = None
        with zipfile.ZipFile(io.BytesIO(zip_resp.content)) as zf:
            for name in zf.namelist():
                if name.endswith(".pdb"):
                    pdb_string = zf.read(name).decode("utf-8", errors="replace")
                    print(f"[tamarind] extracted PDB '{name}' ({len(pdb_string)} chars)")
                    break

        if pdb_string is None:
            print(f"[tamarind] no .pdb file found in ZIP for job '{job_name}'")
            print(f"[tamarind] ZIP contents: {zf.namelist()}")
            return None

        # Save to disk for dashboard / 3D viewer
        pdb_dir = CACHE_FILE.parent / "pdb"
        pdb_dir.mkdir(parents=True, exist_ok=True)
        (pdb_dir / f"{job_name}.pdb").write_text(pdb_string)
        print(f"[tamarind] PDB saved to results/pdb/{job_name}.pdb")
        return pdb_string

    except Exception as e:
        print(f"[tamarind] WARNING: PDB download failed for '{job_name}': {e}")
        return None


def _get_result(job: dict) -> dict:
    """
    Return the score dict for a completed job AND download the PDB.

    Score fields come from job['_score'] (already parsed from the Score JSON
    embedded in the GET /jobs response).
    PDB is fetched separately via POST /result → signed S3 ZIP URL.
    """
    score = job.get("_score", {})
    job_name = job.get("JobName") or job.get("jobName", "")
    pdb = _download_pdb(job_name)
    score["pdb"] = pdb
    return score


def _run_job(job_name: str, job_type: str, settings: dict) -> dict:
    """Submit, poll, and fetch result in one call."""
    _submit(job_name, job_type, settings)
    completed_job = _poll(job_name)
    return _get_result(completed_job)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def esmfold_plddt(sequence: str) -> dict:
    """
    Run ESMFold on a single monomer sequence via Tamarind.
    Returns {"plddt": float, "pdb": str, "raw": dict}.
    Cached — will not re-call for a sequence already scored.
    """
    cache = _load_cache()
    key = _cache_key("esmfold", sequence)
    if key in cache:
        print(f"[tamarind] cache hit: ESMFold {sequence[:20]}...")
        return cache[key]

    job_name = f"esmfold_{abs(hash(sequence)) % 10**8}"
    result = _run_job(job_name, "esmfold", {"sequence": sequence})

    # Tamarind ESMFold Score fields (verified): plddt, ptm, num_recycles, chain_linker
    # PDB is fetched from the signed S3 ZIP URL and saved to results/pdb/<job_name>.pdb
    output = {
        "plddt":    result.get("plddt") or result.get("plddt_mean") or result.get("avg_plddt"),
        "ptm":      result.get("ptm"),
        "pdb":      result.get("pdb"),          # PDB string, populated by _get_result
        "pdb_file": f"results/pdb/{job_name}.pdb",   # path on disk for dashboard
        "seq_hash": job_name,                   # lookup key for /api/structure endpoint
        "raw":      result,
    }
    cache[key] = output
    _save_cache(cache)
    return output


def alphafold2_multimer(chains: list[str], num_models: int = 5) -> dict:
    """
    Run AlphaFold2 multimer on a list of chains (e.g., [receptor_seq, fp_seq]).
    Chains are joined with ':' per Tamarind's multimer convention.
    Returns {"plddt": float, "ptm": float, "iptm": float, "pdb": str, "raw": dict}.
    Cached. Counts as 1 API call.
    """
    sequence_key = ":".join(chains)
    cache = _load_cache()
    key = _cache_key("alphafold2_multimer", sequence_key, num_models=num_models)
    if key in cache:
        print(f"[tamarind] cache hit: AF2 multimer {sequence_key[:30]}...")
        return cache[key]

    job_name = f"af2multi_{abs(hash(sequence_key)) % 10**8}"
    settings = {
        "sequence":  sequence_key,        # chains separated by ':'
        "numModels": str(num_models),
        "modelType": "alphafold2_multimer_v3",
        "useMSA":    True,
    }
    result = _run_job(job_name, "alphafold", settings)

    # AF2 Score fields: plddt, ptm, iptm (verified against Tamarind docs pattern)
    # PDB fetched from signed S3 ZIP and saved to results/pdb/<job_name>.pdb
    output = {
        "plddt":    result.get("plddt") or result.get("plddt_mean") or result.get("avg_plddt"),
        "ptm":      result.get("ptm"),
        "iptm":     result.get("iptm"),
        "pdb":      result.get("pdb"),          # PDB string from ZIP download
        "pdb_file": f"results/pdb/{job_name}.pdb",
        "seq_hash": job_name,
        "raw":      result,
    }
    cache[key] = output
    _save_cache(cache)
    return output


def alphafold2_multimer_batch(chain_lists: list[list[str]], num_models: int = 5) -> list[dict]:
    """
    Submit ALL AF2 multimer jobs at once, then poll them concurrently via threads.

    This is faster than the sequential alphafold2_multimer() because all jobs run
    on Tamarind's servers in parallel — total wall time ≈ max(single job time).

    Returns list of result dicts in the same order as chain_lists.
    """
    import threading

    results: list[dict | None] = [None] * len(chain_lists)
    _cache_lock = threading.Lock()

    # ── step 1: check cache, submit uncached jobs ────────────────────────────
    pending: list[tuple[int, str, str]] = []   # (index, job_name, cache_key)

    for i, chains in enumerate(chain_lists):
        sequence_key = ":".join(chains)
        key = _cache_key("alphafold2_multimer", sequence_key, num_models=num_models)
        cache = _load_cache()
        if key in cache:
            print(f"[tamarind] cache hit: AF2 multimer {sequence_key[:30]}...")
            results[i] = cache[key]
            continue

        job_name = f"af2multi_{abs(hash(sequence_key)) % 10**8}"
        settings = {
            "sequence":  sequence_key,
            "numModels": str(num_models),
            "modelType": "alphafold2_multimer_v3",
            "useMSA":    True,
        }
        _submit(job_name, "alphafold", settings)
        pending.append((i, job_name, key, sequence_key))

    if not pending:
        return results  # type: ignore[return-value]

    print(f"[tamarind] polling {len(pending)} AF2 jobs concurrently…")

    # ── step 2: poll + fetch all pending jobs in parallel ────────────────────
    def _poll_and_store(i: int, job_name: str, cache_key: str, sequence_key: str):
        try:
            completed = _poll(job_name)
            result = _get_result(completed)
            output = {
                "plddt":    result.get("plddt") or result.get("plddt_mean") or result.get("avg_plddt"),
                "ptm":      result.get("ptm"),
                "iptm":     result.get("iptm"),
                "pdb":      result.get("pdb"),
                "pdb_file": f"results/pdb/{job_name}.pdb",
                "seq_hash": job_name,
                "raw":      result,
            }
            results[i] = output
            with _cache_lock:
                cache = _load_cache()
                cache[cache_key] = output
                _save_cache(cache)
            print(f"[tamarind] AF2 job '{job_name}' done | "
                  f"pLDDT={output.get('plddt')}  ipTM={output.get('iptm')}")
        except Exception as e:
            print(f"[tamarind] ERROR in AF2 job '{job_name}': {e}")
            results[i] = {"error": str(e), "plddt": None, "iptm": None, "pdb": None}

    threads = [
        threading.Thread(target=_poll_and_store, args=(i, jn, ck, sk), daemon=True)
        for i, jn, ck, sk in pending
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    return results  # type: ignore[return-value]


def batch_esmfold(sequences: list[str]) -> list[dict]:
    """Score a list of sequences with ESMFold. Respects cache and budget."""
    results = []
    for seq in sequences:
        if remaining_calls() <= 0:
            print("[tamarind] WARNING: budget exhausted, stopping batch early")
            break
        results.append(esmfold_plddt(seq))
    return results
