"""
Genetic Algorithm for receptor sequence optimization.

Runs entirely on LOCAL scorers — zero Tamarind API calls.
After convergence, call scorers.ensemble.tamarind_score_batch on the top-50.

Amino acid alphabet
-------------------
Standard 20 AAs. Forbidden: cysteine-rich motifs (see CONSTRAINTS).
"""

import random
import string
from dataclasses import dataclass, field

from scorers.ensemble import local_score

AMINO_ACIDS = "ACDEFGHIKLMNPQRSTVWY"

# Positions that are mutable (surface loops). Fixed regions are left unchanged.
# Update these indices based on the chosen receptor scaffold.
MUTABLE_POSITIONS: list[int] = []  # TODO: fill in after scaffold is chosen


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
    positions = MUTABLE_POSITIONS or list(range(len(seq)))
    for pos in random.sample(positions, min(n_mutations, len(positions))):
        seq[pos] = random.choice(AMINO_ACIDS)
    return "".join(seq)


def single_point_crossover(a: str, b: str) -> tuple[str, str]:
    if len(a) != len(b):
        return a, b
    point = random.randint(1, len(a) - 1)
    return a[:point] + b[point:], b[:point] + a[point:]


def evaluate(ind: Individual, fp_name: str, linker: str) -> Individual:
    ind.fitness = local_score(ind.sequence, fp_name=fp_name, linker=linker)
    return ind


def tournament_select(population: list[Individual], k: int = 3) -> Individual:
    contestants = random.sample(population, min(k, len(population)))
    return max(contestants, key=lambda x: x.fitness)


# ---------------------------------------------------------------------------
# Main GA loop
# ---------------------------------------------------------------------------

def run_ga(
    seed_sequence: str,
    fp_name: str = "mVenus",
    linker: str = "GGSGGS",
    population_size: int = 50,
    n_generations: int = 100,
    mutation_rate: float = 0.3,
    crossover_rate: float = 0.5,
    top_k: int = 50,
) -> list[Individual]:
    """
    Run the GA and return the top-k individuals sorted by fitness (descending).
    All scoring is local — no Tamarind calls.
    """
    # Initialize population from seed + random mutations
    population = [Individual(sequence=seed_sequence)]
    for _ in range(population_size - 1):
        mutated = random_mutation(seed_sequence, n_mutations=random.randint(1, 5))
        population.append(Individual(sequence=mutated))

    # Initial evaluation
    population = [evaluate(ind, fp_name, linker) for ind in population]

    print(f"[GA] Gen 0 | best={max(p.fitness for p in population):.4f}")

    for gen in range(1, n_generations + 1):
        offspring = []

        while len(offspring) < population_size:
            parent_a = tournament_select(population)
            parent_b = tournament_select(population)

            # Crossover
            if random.random() < crossover_rate:
                child_seq_a, child_seq_b = single_point_crossover(
                    parent_a.sequence, parent_b.sequence
                )
            else:
                child_seq_a, child_seq_b = parent_a.sequence, parent_b.sequence

            # Mutation
            if random.random() < mutation_rate:
                child_seq_a = random_mutation(child_seq_a)
            if random.random() < mutation_rate:
                child_seq_b = random_mutation(child_seq_b)

            offspring.extend([
                Individual(sequence=child_seq_a),
                Individual(sequence=child_seq_b),
            ])

        offspring = [evaluate(ind, fp_name, linker) for ind in offspring]

        # Elitism: keep best half of combined population
        combined = population + offspring
        combined.sort(key=lambda x: x.fitness, reverse=True)
        population = combined[:population_size]

        if gen % 10 == 0:
            print(f"[GA] Gen {gen} | best={population[0].fitness:.4f} | mean={sum(p.fitness for p in population)/len(population):.4f}")

    population.sort(key=lambda x: x.fitness, reverse=True)
    return population[:top_k]
