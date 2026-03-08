from __future__ import annotations

"""
Genetic Algorithm for SSTR2-cpGFP biosensor optimization.

Each individual encodes three co-evolving components:
  1. SSTR2 receptor loop residues (ECL1/2/3, ICL2/3, C-tail)
  2. N-linker sequence (5–10 AA, flexible, GGS-rich preferred)
  3. C-linker sequence (5–10 AA, flexible, GGS-rich preferred)

The FP (cpGFP) is fixed and inserted at a per-individual insertion
position within ICL3.  Crossover operates on the receptor separately
from linkers so length variation does not corrupt the receptor topology.

pLDDT feedback: sequences already ESMFolded get blended fitness
(35% local + 65% real pLDDT) in subsequent GA rounds.
"""

import random
from dataclasses import dataclass, field

from scorers.ensemble import local_score
from scorers.fp_model import brightness_score

AMINO_ACIDS = "ACDEFGHIKLMNPQRSTVWY"

# Linker-friendly amino acids: flexible + hydrophilic, avoid Cys/Pro
LINKER_AAS = "GGSAETQN"
LINKER_MIN = 5
LINKER_MAX = 10

# ICL3 insertion range (0-indexed in bare 369-AA SSTR2).
# ICL3 spans residues 205–252; avoid first/last 2 positions as buffers.
ICL3_INSERT_RANGE = (206, 250)   # (inclusive start, inclusive end)

# SSTR2 bare-receptor loop positions (0-indexed, TM helices excluded).
# These index into the 369-AA receptor; chimeric positions are computed
# per-individual via Individual.mutable_positions.
_BARE_LOOP_POSITIONS: list[int] = (
    list(range(82, 89))     # ECL1   residues  83– 89
    + list(range(116, 124)) # ICL2   residues 117–124
    + list(range(148, 173)) # ECL2   residues 149–173
    + list(range(204, 252)) # ICL3   residues 205–252
    + list(range(280, 287)) # ECL3   residues 281–287
    + list(range(313, 369)) # C-tail residues 314–369
)

LOCAL_WEIGHT = 0.35
PLDDT_WEIGHT = 0.65


# ---------------------------------------------------------------------------
# Individual
# ---------------------------------------------------------------------------

@dataclass
class Individual:
    receptor:   str          # bare 369-AA SSTR2 sequence (mutable at loops)
    insert_pos: int          # 0-indexed position in receptor for FP insertion
    linker_n:   str          # N-terminal linker (5–10 AA)
    linker_c:   str          # C-terminal linker (5–10 AA)
    fp_sequence: str         # fixed FP sequence (passed through, never mutated)
    fitness:    float = 0.0
    metadata:   dict  = field(default_factory=dict)

    @property
    def sequence(self) -> str:
        """Full chimeric: SSTR2[:pos] + linker_n + FP + linker_c + SSTR2[pos:]"""
        return (
            self.receptor[:self.insert_pos]
            + self.linker_n
            + self.fp_sequence
            + self.linker_c
            + self.receptor[self.insert_pos:]
        )

    @property
    def insert_len(self) -> int:
        return len(self.linker_n) + len(self.fp_sequence) + len(self.linker_c)

    @property
    def mutable_positions(self) -> list[int]:
        """Chimeric-sequence indices for receptor loop residues (FP block excluded)."""
        result = []
        for p in _BARE_LOOP_POSITIONS:
            if p < self.insert_pos:
                result.append(p)
            else:
                result.append(p + self.insert_len)
        return result

    def linker_score(self) -> float:
        """Score both linkers: GGS fraction + brightness penalty check."""
        combined = self.linker_n + self.linker_c
        ggs = (combined.count("G") + combined.count("S")) / max(len(combined), 1)
        bright = brightness_score("cpGFP", self.linker_n + self.linker_c)
        return 0.6 * ggs + 0.4 * bright


# ---------------------------------------------------------------------------
# Mutation operators
# ---------------------------------------------------------------------------

def _random_linker(length: int | None = None) -> str:
    n = length if length is not None else random.randint(LINKER_MIN, LINKER_MAX)
    return "".join(random.choice(LINKER_AAS) for _ in range(n))


def mutate_receptor(ind: Individual, n_mutations: int = 1) -> Individual:
    """Point-mutate n_mutations receptor loop positions."""
    pool = _BARE_LOOP_POSITIONS
    seq = list(ind.receptor)
    for pos in random.sample(pool, min(n_mutations, len(pool))):
        seq[pos] = random.choice(AMINO_ACIDS)
    return Individual(
        receptor="".join(seq),
        insert_pos=ind.insert_pos,
        linker_n=ind.linker_n,
        linker_c=ind.linker_c,
        fp_sequence=ind.fp_sequence,
    )


def mutate_linker(ind: Individual) -> Individual:
    """
    Randomly choose one of four linker mutations:
      - point substitution in linker_n or linker_c
      - extend linker by 1 AA (if < LINKER_MAX)
      - shorten linker by 1 AA (if > LINKER_MIN)
    Applied independently to N- and C-linker (50% chance each).
    """
    ln, lc = list(ind.linker_n), list(ind.linker_c)

    def _mutate_one(lk: list[str]) -> list[str]:
        ops = ["sub"]
        if len(lk) < LINKER_MAX:
            ops.append("extend")
        if len(lk) > LINKER_MIN:
            ops.append("shorten")
        op = random.choice(ops)
        if op == "sub":
            i = random.randrange(len(lk))
            lk[i] = random.choice(LINKER_AAS)
        elif op == "extend":
            i = random.randrange(len(lk) + 1)
            lk.insert(i, random.choice(LINKER_AAS))
        else:  # shorten
            i = random.randrange(len(lk))
            lk.pop(i)
        return lk

    if random.random() < 0.5:
        ln = _mutate_one(ln)
    if random.random() < 0.5:
        lc = _mutate_one(lc)

    return Individual(
        receptor=ind.receptor,
        insert_pos=ind.insert_pos,
        linker_n="".join(ln),
        linker_c="".join(lc),
        fp_sequence=ind.fp_sequence,
    )


def mutate_insert_pos(ind: Individual, shift_max: int = 3) -> Individual:
    """Shift insertion position ±1–3 within ICL3."""
    lo, hi = ICL3_INSERT_RANGE
    shift = random.randint(1, shift_max) * random.choice([-1, 1])
    new_pos = max(lo, min(hi, ind.insert_pos + shift))
    return Individual(
        receptor=ind.receptor,
        insert_pos=new_pos,
        linker_n=ind.linker_n,
        linker_c=ind.linker_c,
        fp_sequence=ind.fp_sequence,
    )


def mutate(ind: Individual, mutation_rate: float = 0.3) -> Individual:
    """
    Apply stochastic mutations.  Each mutation type fires independently.
    Probabilities tuned so receptor loops dominate early; linker + site
    refinement kicks in frequently enough to explore linker space.
    """
    if random.random() < mutation_rate:
        ind = mutate_receptor(ind, n_mutations=random.randint(1, 3))
    if random.random() < mutation_rate * 0.8:
        ind = mutate_linker(ind)
    if random.random() < mutation_rate * 0.3:
        ind = mutate_insert_pos(ind)
    return ind


# ---------------------------------------------------------------------------
# Crossover — receptor and linker treated separately
# ---------------------------------------------------------------------------

def crossover(a: Individual, b: Individual) -> tuple[Individual, Individual]:
    """
    Single-point crossover on the receptor sequence only.
    Linkers and insert_pos are swapped as a unit between the two offspring.
    """
    rec_a, rec_b = a.receptor, b.receptor
    if len(rec_a) == len(rec_b):
        point = random.randint(1, len(rec_a) - 1)
        rec_a, rec_b = rec_a[:point] + rec_b[point:], rec_b[:point] + rec_a[point:]

    # swap linker+pos pair between offspring
    child_a = Individual(
        receptor=rec_a,
        insert_pos=b.insert_pos,
        linker_n=b.linker_n,
        linker_c=b.linker_c,
        fp_sequence=a.fp_sequence,
    )
    child_b = Individual(
        receptor=rec_b,
        insert_pos=a.insert_pos,
        linker_n=a.linker_n,
        linker_c=a.linker_c,
        fp_sequence=b.fp_sequence,
    )
    return child_a, child_b


# ---------------------------------------------------------------------------
# Fitness evaluation
# ---------------------------------------------------------------------------

def evaluate(
    ind: Individual,
    fp_name: str,
    plddt_cache: dict[str, float] | None = None,
) -> Individual:
    """
    Score an individual.  local_score is computed on the chimeric sequence;
    linker quality is blended in. pLDDT replaces 65% of local score when cached.
    """
    chimeric = ind.sequence
    local = local_score(chimeric, fp_name=fp_name, linker=ind.linker_n + ind.linker_c)
    lk_sc = ind.linker_score()
    combined_local = 0.8 * local + 0.2 * lk_sc

    if plddt_cache and chimeric in plddt_cache:
        plddt_norm = plddt_cache[chimeric] / 100.0
        ind.fitness = LOCAL_WEIGHT * combined_local + PLDDT_WEIGHT * plddt_norm
        ind.metadata["plddt_used"] = True
    else:
        ind.fitness = combined_local
        ind.metadata["plddt_used"] = False

    ind.metadata["linker_n"] = ind.linker_n
    ind.metadata["linker_c"] = ind.linker_c
    ind.metadata["insert_pos"] = ind.insert_pos
    return ind


def tournament_select(population: list[Individual], k: int = 3) -> Individual:
    contestants = random.sample(population, min(k, len(population)))
    return max(contestants, key=lambda x: x.fitness)


# ---------------------------------------------------------------------------
# ICL3 insertion-site sweep (pre-GA, free)
# ---------------------------------------------------------------------------

def sweep_icl3(
    receptor: str,
    fp_sequence: str,
    fp_name: str,
    n_top: int = 3,
) -> list[int]:
    """
    Score every position in ICL3_INSERT_RANGE with a short linker and return
    the top-n positions by local score.  Used to seed the initial population
    with biologically informed insertion sites.
    """
    lo, hi = ICL3_INSERT_RANGE
    scored = []
    trial_linker = "GGSGGS"
    for pos in range(lo, hi + 1):
        ind = Individual(
            receptor=receptor,
            insert_pos=pos,
            linker_n=trial_linker,
            linker_c=trial_linker,
            fp_sequence=fp_sequence,
        )
        ind = evaluate(ind, fp_name)
        scored.append((pos, ind.fitness))
    scored.sort(key=lambda x: x[1], reverse=True)
    top_positions = [pos for pos, _ in scored[:n_top]]
    print(f"[sweep_icl3] Top {n_top} insertion positions in ICL3: {top_positions}")
    for pos, sc in scored[:n_top]:
        print(f"  pos={pos}  score={sc:.4f}")
    return top_positions


# ---------------------------------------------------------------------------
# Main GA loop
# ---------------------------------------------------------------------------

def run_ga(
    seed_receptor: str,
    fp_sequence: str,
    fp_name: str = "cpGFP",
    population_size: int = 30,
    n_generations: int = 40,
    mutation_rate: float = 0.3,
    crossover_rate: float = 0.5,
    top_k: int = 20,
    plddt_cache: dict[str, float] | None = None,
    round_num: int = 1,
    seed_individuals: list[Individual] | None = None,
) -> list[Individual]:
    """
    Run the GA and return the top-k individuals by fitness.

    Args:
        seed_receptor:    Bare 369-AA SSTR2 sequence to seed the population.
        fp_sequence:      Fixed FP sequence (never mutated).
        seed_individuals: Survivors from a previous round (optional).
        plddt_cache:      {chimeric_sequence: pLDDT} from prior ESMFold runs.
    """
    # Sweep ICL3 to pick the best starting insertion positions
    top_positions = sweep_icl3(seed_receptor, fp_sequence, fp_name, n_top=3)

    population: list[Individual] = []

    # Seed from previous-round survivors
    if seed_individuals:
        for ind in seed_individuals:
            population.append(Individual(
                receptor=ind.receptor,
                insert_pos=ind.insert_pos,
                linker_n=ind.linker_n,
                linker_c=ind.linker_c,
                fp_sequence=fp_sequence,
            ))

    # Fill remaining slots with random individuals at top ICL3 positions
    while len(population) < population_size:
        pos = random.choice(top_positions)
        # Random receptor: apply 0–4 loop mutations to seed
        rec = seed_receptor
        for _ in range(random.randint(0, 4)):
            p = random.choice(_BARE_LOOP_POSITIONS)
            rec = rec[:p] + random.choice(AMINO_ACIDS) + rec[p+1:]
        ind = Individual(
            receptor=rec,
            insert_pos=pos,
            linker_n=_random_linker(),
            linker_c=_random_linker(),
            fp_sequence=fp_sequence,
        )
        population.append(ind)

    population = [evaluate(ind, fp_name, plddt_cache) for ind in population]
    cached_count = sum(1 for ind in population if ind.metadata.get("plddt_used"))
    print(f"[GA round {round_num}] Gen 0 | best={max(p.fitness for p in population):.4f} | "
          f"pLDDT-guided={cached_count}/{len(population)}")

    for gen in range(1, n_generations + 1):
        offspring: list[Individual] = []

        while len(offspring) < population_size:
            parent_a = tournament_select(population)
            parent_b = tournament_select(population)

            if random.random() < crossover_rate:
                child_a, child_b = crossover(parent_a, parent_b)
            else:
                child_a, child_b = parent_a, parent_b

            offspring.append(mutate(child_a, mutation_rate))
            offspring.append(mutate(child_b, mutation_rate))

        offspring = [evaluate(ind, fp_name, plddt_cache) for ind in offspring]

        combined = population + offspring
        combined.sort(key=lambda x: x.fitness, reverse=True)
        population = combined[:population_size]

        if gen % 10 == 0:
            mean_fit = sum(p.fitness for p in population) / len(population)
            best = population[0]
            print(f"[GA round {round_num}] Gen {gen} | best={best.fitness:.4f} | mean={mean_fit:.4f} | "
                  f"pos={best.insert_pos} ln={best.linker_n} lc={best.linker_c}")

    population.sort(key=lambda x: x.fitness, reverse=True)
    return population[:top_k]
