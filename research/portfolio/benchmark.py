"""Measure synthetic solver problems; these are not counterfactual playtests."""

import hashlib
import json
import random
import time
from pathlib import Path
from solver import solve, check_selection

ROOT = Path(__file__).resolve().parents[2]
rng = random.Random(191202946)
rows = []
for count, scenarios in [(40, 8), (128, 16), (500, 64)]:
    candidates = []
    for i in range(count):
        candidates.append({"id": str(i), "observedAt": 0, "claims": [str(k) for k in rng.sample(range(count//2), 2)], "outcomes": [
            {"revenueCents": rng.randint(1000, 10000), "fulfillmentCents": rng.randint(1000, 6000), "refundCents": rng.randint(0, 1000), "penaltyCents": 0, "futureCents": rng.randint(-500, 500), "capacity": {"area": rng.randint(10, 50)}, "late": int(rng.random()<.02)} for _ in range(scenarios)]})
    problem = {"now": 0, "weights": [1]*scenarios, "capacity": [{"area": 300} for _ in range(scenarios)], "lateBudget": [1]*scenarios, "mandatory": [], "baseline": [], "alternatives": candidates}
    began = time.perf_counter()
    answer = solve(problem)
    elapsed = time.perf_counter()-began
    check_selection(problem, set(answer["selected"]))
    rows.append({"candidates": count, "scenarios": scenarios, "problemSha256": hashlib.sha256(json.dumps(problem, sort_keys=True).encode()).hexdigest(), "totalSeconds": elapsed, "answer": answer})
report = {"role": "synthetic model and runtime check only; no simulator worlds or policy-profit evidence", "seed": 191202946, "sourceSha256": hashlib.sha256((ROOT/"research/portfolio/solver.py").read_bytes()).hexdigest(), "rows": rows}
(ROOT/"docs/portfolio-solver-check.json").write_text(json.dumps(report, indent=2)+"\n")
print(json.dumps([{"candidates": r["candidates"], "scenarios": r["scenarios"], "status": r["answer"]["status"], "totalSeconds": r["totalSeconds"], "expectedCents": r["answer"]["expectedCents"], "bound": r["answer"]["solverUpperBoundCents"]} for r in rows]))
