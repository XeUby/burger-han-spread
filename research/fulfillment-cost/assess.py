"""Assess the already-frozen cost model on four distinct development weeks."""

import hashlib
import json
from datetime import datetime, timezone

import numpy as np
from train import root, recipe, score

model_path = root / "experiments/fulfillment-cost-model.json"
model = json.loads(model_path.read_text())
assert model["recipe"] == recipe
data_path = root / "docs/fulfillment-cost-development-holdout.json"
data = json.loads(data_path.read_text())
expected = json.loads((root / "experiments/cost-development-protocol.json").read_text())["seeds"]
assert [week["seed"] for week in data["weeks"]] == expected
assert len(set(expected)) == 4
assert not set(expected) & {week["seed"] for week in model["trainingWeeks"]}
models = {"fixed": np.zeros(len(model["names"])), "calibrated": np.array(model["calibratedBeta"]), "features": np.array(model["beta"])}
folds = [{"seed": seed, **{name: score([row for row in data["groups"] if row["seed"] == seed], beta) for name, beta in models.items()}} for seed in expected]
summary = {name: {"meanWeeklyGroupRmseCents": float(np.mean([fold[name]["groupRmseCents"] for fold in folds])), "aggregateBiasShare": sum(fold[name]["predictedCostCents"]-fold[name]["actualCostCents"] for fold in folds)/sum(fold[name]["actualCostCents"] for fold in folds)} for name in models}
gate = recipe["heldoutPredictionGate"]
rmse = summary["features"]["meanWeeklyGroupRmseCents"]
improvements = {name: 1-rmse/summary[name]["meanWeeklyGroupRmseCents"] for name in ["fixed", "calibrated"]}
wins = sum(fold["features"]["groupRmseCents"] < min(fold[name]["groupRmseCents"] for name in ["fixed", "calibrated"]) for fold in folds)
passed = min(improvements.values()) >= gate["meanWeeklyRmseImprovementOverBothBaselines"] and wins >= gate["weeksBeatingBothBaselinesAtLeast"] and abs(summary["features"]["aggregateBiasShare"]) <= gate["absoluteAggregateBiasAtMost"]
report = {"assessedAt": datetime.now(timezone.utc).isoformat(), "frozenAt": model["frozenAt"], "modelSha256": hashlib.sha256(model_path.read_bytes()).hexdigest(), "dataSha256": hashlib.sha256(data_path.read_bytes()).hexdigest(), "uniqueWeeks": 4, "folds": folds, "summary": summary, "improvementOverBaselines": improvements, "weeksBeatingBothBaselines": wins, "gatePassed": passed, "decision": "Eligible for frozen whole-policy development testing; not promotion" if passed else "Reject this feature model as insufficient. Retire all four weeks into development; do not refit and call them held out.", "limitations": ["This tests prediction on admitted-order groups, not causal profit or safety.", "Only four new development weeks; the unit of evidence is the week, not1721training groups or repeated runs.", "Comparisons across models constitute development selection. A selected dispatcher still requires a wholly fresh, predeclared paired validation panel with multiplicity accounted for."]}
(root / "docs/fulfillment-cost-assessment.json").write_text(json.dumps(report, indent=2)+"\n")
print(json.dumps({key: report[key] for key in ["summary", "improvementOverBaselines", "weeksBeatingBothBaselines", "gatePassed", "decision"]}, indent=2))
