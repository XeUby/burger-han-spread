"""Select a common route/quote/payment portfolio across declared scenarios."""

import argparse
import json
import sys
from collections import Counter
from ortools.sat.python import cp_model
import ortools

MONEY = ("revenueCents", "fulfillmentCents", "refundCents", "penaltyCents", "futureCents")


def solve(problem, seconds=0.2):
    validate(problem)
    if not 0 <= seconds <= 10:
        raise ValueError("Solver budget must be between zero and ten seconds")
    candidates = problem["alternatives"]
    baseline = set(problem["baseline"])
    check_selection(problem, baseline)
    model = cp_model.CpModel()
    variables = [model.new_bool_var(c["id"]) for c in candidates]
    claims = set().union(*(set(c["claims"]) for c in candidates))
    for claim in sorted(claims):
        used = sum(v for v, c in zip(variables, candidates) if claim in c["claims"])
        model.add(used == 1 if claim in problem["mandatory"] else used <= 1)
    for s, limits in enumerate(problem["capacity"]):
        for resource, limit in sorted(limits.items()):
            model.add(sum(v * c["outcomes"][s]["capacity"].get(resource, 0) for v, c in zip(variables, candidates)) <= limit)
        model.add(sum(v * c["outcomes"][s]["late"] for v, c in zip(variables, candidates)) <= problem["lateBudget"][s])
    coefficients = [value(problem, c) for c in candidates]
    objective = sum(v * coefficient for v, coefficient in zip(variables, coefficients))
    baseline_value = sum(coefficient for c, coefficient in zip(candidates, coefficients) if c["id"] in baseline)
    model.add(objective >= baseline_value)
    model.maximize(objective)
    for v, c in zip(variables, candidates):
        model.add_hint(v, int(c["id"] in baseline))
    error = model.validate()
    if error:
        raise ValueError(error)
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 170114
    solver.parameters.max_time_in_seconds = seconds
    status = solver.solve(model)
    feasible = status in (cp_model.FEASIBLE, cp_model.OPTIMAL)
    selected = {c["id"] for c, v in zip(candidates, variables) if solver.value(v)} if feasible else baseline
    check_selection(problem, selected)
    selected_value = sum(coefficient for c, coefficient in zip(candidates, coefficients) if c["id"] in selected)
    if selected_value < baseline_value:
        raise RuntimeError("Solver returned a portfolio below its verified baseline")
    total_weight = sum(problem["weights"])
    return {
        "solver": "OR-Tools CP-SAT", "version": ortools.__version__,
        "status": solver.status_name(status), "provenOptimal": status == cp_model.OPTIMAL,
        "usedBaselineFallback": not feasible, "selected": sorted(selected),
        "weightedObjectiveCents": selected_value, "totalWeight": total_weight,
        "expectedCents": selected_value / total_weight,
        "baselineExpectedCents": baseline_value / total_weight,
        "solverUpperBoundCents": solver.best_objective_bound / total_weight if feasible else None,
        "wallSeconds": solver.wall_time,
        "scenarioNetCents": [sum(net(c["outcomes"][s]) for c in candidates if c["id"] in selected) for s in range(len(problem["weights"]))],
        "limits": "Optimality, feasibility and risk refer only to the supplied candidates and modeled scenarios, not to simulator outcomes.",
    }


def net(outcome):
    return outcome["revenueCents"] - outcome["fulfillmentCents"] - outcome["refundCents"] - outcome["penaltyCents"] + outcome["futureCents"]


def value(problem, candidate):
    return sum(w * net(o) for w, o in zip(problem["weights"], candidate["outcomes"]))


def integer(value, minimum=0, maximum=10**9):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError("Expected a bounded integer")


def validate(problem):
    integer(problem["now"])
    weights = problem["weights"]
    if not 1 <= len(weights) <= 64 or not 1 <= len(problem["alternatives"]) <= 500:
        raise ValueError("Portfolio exceeds the prototype's candidate/scenario bounds")
    for w in weights:
        integer(w, 1, 1000)
    if len(problem["capacity"]) != len(weights) or len(problem["lateBudget"]) != len(weights):
        raise ValueError("Every scenario needs capacity and lateness limits")
    for limits, late in zip(problem["capacity"], problem["lateBudget"]):
        integer(late)
        for limit in limits.values():
            integer(limit)
    ids = [c["id"] for c in problem["alternatives"]]
    if len(set(ids)) != len(ids) or any(not isinstance(i, str) or not i for i in ids):
        raise ValueError("Candidate IDs must be unique strings")
    if len(problem["baseline"]) != len(set(problem["baseline"])) or not set(problem["baseline"]) <= set(ids):
        raise ValueError("Invalid baseline")
    claims = set()
    for c in problem["alternatives"]:
        integer(c["observedAt"], 0, problem["now"])
        if not c["claims"] or len(c["claims"]) != len(set(c["claims"])) or any(not isinstance(i, str) or not i for i in c["claims"]):
            raise ValueError("Each plan needs distinct job or decision claims")
        claims.update(c["claims"])
        if len(c["outcomes"]) != len(weights):
            raise ValueError("Every candidate needs the same scenarios")
        for s, o in enumerate(c["outcomes"]):
            for field in MONEY:
                integer(o[field], -10**9 if field == "futureCents" else 0)
            integer(o["late"])
            if not set(o["capacity"]) <= set(problem["capacity"][s]):
                raise ValueError("Resource use without a declared capacity limit")
            for amount in o["capacity"].values():
                integer(amount)
    if len(problem["mandatory"]) != len(set(problem["mandatory"])) or not set(problem["mandatory"]) <= claims:
        raise ValueError("Every existing commitment needs a feasible candidate")


def check_selection(problem, selected):
    candidates = [c for c in problem["alternatives"] if c["id"] in selected]
    if len(candidates) != len(selected):
        raise ValueError("Unknown selected candidate")
    claims = Counter(claim for c in candidates for claim in c["claims"])
    if any(count > 1 for count in claims.values()) or any(claims[k] != 1 for k in problem["mandatory"]):
        raise ValueError("Selection duplicates work or abandons a commitment")
    for s, limits in enumerate(problem["capacity"]):
        if any(sum(c["outcomes"][s]["capacity"].get(k, 0) for c in candidates) > limit for k, limit in limits.items()):
            raise ValueError("Selection exceeds a scenario's capacity")
        if sum(c["outcomes"][s]["late"] for c in candidates) > problem["lateBudget"][s]:
            raise ValueError("Selection exceeds a scenario's lateness budget")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--stream", action="store_true")
    parser.add_argument("--seconds", type=float, default=0.2)
    args = parser.parse_args()
    if args.stream:
        for line in sys.stdin:
            try:
                print(json.dumps(solve(json.loads(line), args.seconds)), flush=True)
            except (KeyError, TypeError, ValueError) as error:
                print(json.dumps({"error": str(error)}), flush=True)
    else:
        print(json.dumps(solve(json.load(sys.stdin), args.seconds), indent=2))
