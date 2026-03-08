from __future__ import annotations

"""
Genetic Algorithm for SSTR2 loop sequence optimization.

Supports a pLDDT feedback cache: sequences already scored by Tamarind ESMFold
have their fitness blended with the real pLDDT signal, replacing the local-only
proxy. This enables a multi-round feedback loop without wasting API calls on
sequences already evaluated.

Mutable positions are restricted to SSTR2 loop regions — TM helices are fixed.
"""

import random
from dataclasses import dataclass, field

from scorers.ensemble import local_score

AMINO_ACIDS = "ACDEFGHIKLMNPQRSTVWY"

# SSTR2 (369 AA) mutable surface loop positions — 0-indexed.
# TM helices are fixed. Only extracellular loops (ECLs), intracellular loops
# (ICLs), and C-terminal tail are mutated.
# Topology reference: Hoyer et al. 1995; UniProt P30874 topology annotation.
#
#   ECL1  : residues  83– 89  → indices  82– 88
#   ICL2  : residues 117–124  → indices 116–123
#   ECL2  : residues 149–173  → indices 148–172   ← primary FP insertion region
#   ICL3  : residues 205–252  → indices 204–251   ← large, tolerates insertions
#   ECL3  : residues 281–287  → indices 280–286
#   C-tail: residues 314–369  → indices 313–368

MUTABLE_POSITIONS: list[int] = (
    list(range(82, 89))     # ECL1
    + list(range(116, 124)) # ICL2
    + list(range(148, 173)) # ECL2
    + list(range(204, 252)) # ICL3
    + list(range(280, 287)) # ECL3
    + list(range(313, 369)) # C-tail
)

# When pLDDT feedback is available, blend local and oracle scores.
# Higher PLDDT_WEIGHT = more trust in real folding signal.
LOCAL_WEIGHT  = 0.35
PLDDT_WEIGHT  = 0.65


@dataclass
class Individual:
    sequence: str
    fitness: float = 0.0
    metadata: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# GA operators
# ---------------------------------------------------------------------------

def random_mutation(sequence: str, n_mutations: int = 1) -> str:
    seq = list(sequence)
    for pos in random.sample(MUTABLE_POSITIONS, min(n_mutations, len(MUTABLE_POSITIONS))):
        seq[pos] = random.choice(AMINO_ACIDS)
    return "".join(seq)


def single_point_crossover(a: str, b: str) -> tuple[str, str]:
    if len(a) != len(b):
        return a, b
    point = random.randint(1, len(a) - 1)
    return a[:point] + b[point:], b[:point] + a[point:]


def evaluate(
    ind: Individual,
    fp_name: str,
    linker: str,
    plddt_cache: dict[str, float] | None = None,
) -> Individual:
    """
    Score an individual. If its sequence is in plddt_cache (already ESMFolded),
    blend the real pLDDT signal with the local score. Otherwise use local only.
    """
    local = local_score(ind.sequence, fp_name=fp_name, linker=linker)

    if plddt_cache and ind.sequence in plddt_cache:
        plddt_norm = plddt_cache[ind.sequence] / 100.0  # normalise to [0,1]
        ind.fitness = LOCAL_WEIGHT * local + PLDDT_WEIGHT * plddt_norm
        ind.metadata["plddt_used"] = True
    else:
        ind.fitness = local
        ind.metadata["plddt_used"] = False

    return ind


def tournament_select(population: list[Individual], k: int = 3) -> Individual:
    contestants = random.sample(population, min(k, len(population)))
    return max(contestants, key=lambda x: x.fitness)


# ---------------------------------------------------------------------------
# Main GA loop
# ---------------------------------------------------------------------------

def run_ga(
    seed_sequences: list[str],
    fp_name: str = "cpGFP",
    linker: str = "GGSGGS",
    population_size: int = 30,
    n_generations: int = 40,
    mutation_rate: float = 0.3,
    crossover_rate: float = 0.5,
    top_k: int = 20,
    plddt_cache: dict[str, float] | None = None,
    round_num: int = 1,
) -> list[Individual]:
    """
    Run the GA and return the top-k individuals by fitness (descending).

    Args:
        seed_sequences: Starting sequences (WT + survivors from previous round).
        plddt_cache:    {sequence: pLDDT} from previous ESMFold rounds.
                        Sequences in cache get blended fitness (local + real pLDDT).
        round_num:      For logging only.
    """
    # Seed population from provided sequences + random variants
    population: list[Individual] = []
    for seq in seed_sequences:
        population.append(Individual(sequence=seq))

    while len(population) < population_size:
        base = random.choice(seed_sequences)
        mutated = random_mutation(base, n_mutations=random.randint(1, 4))
        population.append(Individual(sequence=mutated))

    population = [evaluate(ind, fp_name, linker, plddt_cache) for ind in population]
    cached_count = sum(1 for ind in population if ind.metadata.get("plddt_used"))
    print(f"[GA round {round_num}] Gen 0 | best={max(p.fitness for p in population):.4f} | "
          f"pLDDT-guided={cached_count}/{len(population)}")

    for gen in range(1, n_generations + 1):
        offspring = []

        while len(offspring) < population_size:
            parent_a = tournament_select(population)
            parent_b = tournament_select(population)

            if random.random() < crossover_rate:
                child_a, child_b = single_point_crossover(parent_a.sequence, parent_b.sequence)
            else:
                child_a, child_b = parent_a.sequence, parent_b.sequence

            if random.random() < mutation_rate:
                child_a = random_mutation(child_a)
            if random.random() < mutation_rate:
                child_b = random_mutation(child_b)

            offspring.extend([Individual(sequence=child_a), Individual(sequence=child_b)])

        offspring = [evaluate(ind, fp_name, linker, plddt_cache) for ind in offspring]

        combined = population + offspring
        combined.sort(key=lambda x: x.fitness, reverse=True)
        population = combined[:population_size]

        if gen % 10 == 0:
            mean_fit = sum(p.fitness for p in population) / len(population)
            print(f"[GA round {round_num}] Gen {gen} | best={population[0].fitness:.4f} | mean={mean_fit:.4f}")

    population.sort(key=lambda x: x.fitness, reverse=True)
    return population[:top_k]
