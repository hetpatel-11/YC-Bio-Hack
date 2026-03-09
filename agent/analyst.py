from __future__ import annotations

"""
AI Agent — Drug Discovery Analyst

Uses Claude Opus 4.6 with tool use to:
  1. Analyze local GA scores and select which top-50 to send to Tamarind ESMFold
  2. Analyze ESMFold results and select which top-5 to send to Tamarind AF2
  3. Interpret final AF2 results and generate a human-readable summary

This agent acts as the intelligent filter between each pipeline phase,
saving Tamarind API calls by reasoning about candidate quality.
"""

import json
import os

import anthropic

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))

SYSTEM_PROMPT = """You are a computational protein design expert assisting in a one-day drug discovery hackathon.

Your role is to analyze candidate protein sequences at each phase of the pipeline and make intelligent
decisions about which candidates to advance — conserving the limited Tamarind API budget (~100 calls total).

You have access to tools to read candidate data, filter sequences, and write decisions to disk.
Always explain your reasoning briefly before calling a tool or making a decision.

Key scoring metrics:
- local_fitness: composite score from TMbed + ProteinMPNN + FP brightness (0–1, higher = better)
- pLDDT: ESMFold folding confidence (0–100; > 70 is good, > 90 is excellent)
- pTM: AlphaFold2 global fold confidence (0–1; > 0.5 is good)
- ipTM: AlphaFold2 interface confidence for complexes (0–1; > 0.8 is high quality)

Prioritize diversity as well as top scores — avoid advancing 50 near-identical sequences."""

# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "read_candidates",
        "description": "Read scored candidate sequences from a JSON or JSONL file.",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the JSON or JSONL file containing candidates."
                }
            },
            "required": ["file_path"]
        }
    },
    {
        "name": "write_shortlist",
        "description": "Write the selected candidate sequences to a JSON file for the next pipeline phase.",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Output path for the shortlisted candidates."
                },
                "candidates": {
                    "type": "array",
                    "description": "List of candidate dicts to write.",
                    "items": {"type": "object"}
                },
                "rationale": {
                    "type": "string",
                    "description": "Brief explanation of why these candidates were selected."
                }
            },
            "required": ["file_path", "candidates", "rationale"]
        }
    },
    {
        "name": "compute_diversity",
        "description": "Compute pairwise Hamming distances between sequences and return diversity stats.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sequences": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of amino acid sequences to compare."
                }
            },
            "required": ["sequences"]
        }
    }
]


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def _read_candidates(file_path: str) -> list[dict]:
    path = file_path.strip()
    if path.endswith(".jsonl"):
        with open(path) as f:
            return [json.loads(line) for line in f if line.strip()]
    with open(path) as f:
        return json.load(f)


def _write_shortlist(file_path: str, candidates: list[dict], rationale: str) -> str:
    import pathlib
    pathlib.Path(file_path).parent.mkdir(parents=True, exist_ok=True)
    payload = {"rationale": rationale, "candidates": candidates}
    with open(file_path, "w") as f:
        json.dump(payload, f, indent=2)
    return f"Wrote {len(candidates)} candidates to {file_path}"


def _compute_diversity(sequences: list[str]) -> dict:
    if not sequences:
        return {"mean_hamming": 0, "min_hamming": 0, "n_sequences": 0}
    distances = []
    for i in range(len(sequences)):
        for j in range(i + 1, len(sequences)):
            a, b = sequences[i], sequences[j]
            length = min(len(a), len(b))
            dist = sum(a[k] != b[k] for k in range(length)) + abs(len(a) - len(b))
            distances.append(dist)
    return {
        "n_sequences": len(sequences),
        "mean_hamming": round(sum(distances) / len(distances), 1) if distances else 0,
        "min_hamming": min(distances) if distances else 0,
    }


def _execute_tool(tool_name: str, tool_input: dict) -> str:
    try:
        if tool_name == "read_candidates":
            data = _read_candidates(tool_input["file_path"])
            return json.dumps(data[:100])  # cap at 100 to stay within context
        elif tool_name == "write_shortlist":
            result = _write_shortlist(
                tool_input["file_path"],
                tool_input["candidates"],
                tool_input["rationale"],
            )
            return result
        elif tool_name == "compute_diversity":
            stats = _compute_diversity(tool_input["sequences"])
            return json.dumps(stats)
        else:
            return f"Unknown tool: {tool_name}"
    except Exception as e:
        return f"Tool error: {e}"


# ---------------------------------------------------------------------------
# Agent loop
# ---------------------------------------------------------------------------

def run_agent(user_prompt: str, max_turns: int = 10) -> str:
    """
    Run the analyst agent with a given prompt.
    Returns the final text response from Claude.
    """
    messages = [{"role": "user", "content": user_prompt}]

    for turn in range(max_turns):
        response = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=4096,
            thinking={"type": "adaptive"},
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages,
        )

        # Append assistant response
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "end_turn":
            # Extract final text
            return next(
                (b.text for b in response.content if b.type == "text"), ""
            )

        if response.stop_reason != "tool_use":
            break

        # Execute all tool calls
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                print(f"[agent] calling tool: {block.name}({list(block.input.keys())})")
                result = _execute_tool(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })

        messages.append({"role": "user", "content": tool_results})

    return "[agent] max_turns reached without end_turn"


# ---------------------------------------------------------------------------
# Pipeline-phase helpers
# ---------------------------------------------------------------------------

def select_esmfold_candidates(ga_results_path: str, n: int = 50, output_path: str = "results/esmfold_shortlist.json") -> str:
    """
    Phase 1→2: Given GA results, select the best n candidates for ESMFold.
    Saves shortlist to output_path and returns the agent's rationale.
    """
    prompt = f"""
I have just finished a genetic algorithm search. The scored candidates are in '{ga_results_path}'.

Please:
1. Read the candidates from the file.
2. Compute diversity across the top sequences.
3. Select the best {n} candidates to submit to Tamarind ESMFold, balancing:
   - High local_fitness scores
   - Sequence diversity (avoid near-duplicates)
   - Reasonable sequence length (prefer ≤ 800 AA)
4. Write the selected {n} candidates to '{output_path}'.
5. Briefly explain your selection strategy.

Remember: each ESMFold call costs 1 Tamarind credit. We have ~100 total.
"""
    return run_agent(prompt)


def select_af2_candidates(esmfold_results_path: str, n: int = 5, output_path: str = "results/af2_shortlist.json") -> str:
    """
    Phase 2→3: Given ESMFold results, select the best n for AlphaFold2 multimer.
    """
    prompt = f"""
ESMFold has returned pLDDT scores for our top candidates. Results are in '{esmfold_results_path}'.
Orthogonal validation signals (MD windows, Rosetta filters, assays) are saved in 'results/orthogonal_validation.json'.

Please:
1. Read the ESMFold results.
2. Skim the orthogonal validation file to understand which sequences already have MD/assay support.
3. Select the best {n} candidates to submit to Tamarind AlphaFold2 multimer, prioritising:
   - pLDDT > 70 (confident fold)
   - Diversity (no two sequences > 95% identical)
   - Candidates where FP insertion is in a loop region
   - Orthogonal validation score > 0.55 when available (avoid scores flagged by Rosetta filters)
4. Write the selected {n} candidates to '{output_path}'.
5. Briefly explain why each was chosen, referencing any validation signal you used.

AF2 multimer costs ~8 Tamarind credits per candidate ({n} × 8 = ~{n*8} total). Choose wisely.
"""
    return run_agent(prompt)


def generate_summary(af2_results_path: str, output_path: str = "results/summary.md") -> str:
    """
    Phase 3→Demo: Generate a human-readable summary of the final top-5 candidates.
    """
    prompt = f"""
AlphaFold2 multimer results are in '{af2_results_path}'. Orthogonal validation signals are in 'results/orthogonal_validation.json'.

Please:
1. Read the AF2 results.
2. Rank the candidates by combined score (ipTM 30%, pLDDT 30%, TM RMSD 15%, local_fitness 15%, orthogonal validation 10%) and mention how validation signals modulate confidence.
3. Write a short Markdown summary to '{output_path}' with:
   - A one-paragraph executive summary of the best candidate
   - A table of all 5 candidates with their key metrics
   - A brief note on what makes the top candidate promising for drug delivery, referencing any MD/Rosetta/assay support
4. Return the summary text.
"""
    return run_agent(prompt)
