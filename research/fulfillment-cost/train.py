"""Fit one predeclared additive group-cost model; never allocate shared fees per car."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

root = Path(__file__).resolve().parents[2]
recipe = json.loads((root / "experiments/fulfillment-cost-recipe.json").read_text())
source = root / "research/fulfillment-cost/features.ts"
assert hashlib.sha256(source.read_bytes()).hexdigest() == recipe["featuresSha256"]
data_path = root / "docs/fulfillment-cost-training.json"
data = json.loads(data_path.read_text())
assert [week["worldId"] for week in data["weeks"]] == recipe["trainingWorlds"]
groups = data["groups"]
width = len(data["names"])
alpha = recipe["ridgePenalty"]
prior = recipe["priorRatio"]

def fit(rows, full):
    x = np.array([np.sum([np.array(order["x"])*order["base"]/10000 for order in row["orders"]], axis=0) for row in rows])
    y = np.array([(row["costCents"] - prior*sum(order["base"] for order in row["orders"]))/10000 for row in rows])
    if not full:
        x = x[:, :1]
    beta = np.linalg.solve(x.T@x + alpha*np.eye(x.shape[1]), x.T@y)
    return np.pad(beta, (0, width-len(beta)))

def predict(row, beta):
    return sum(order["base"]*np.clip(prior + np.dot(order["x"], beta), *recipe["ratioBounds"]) for order in row["orders"])

def score(rows, beta):
    actual = np.array([row["costCents"] for row in rows])
    prediction = np.array([predict(row, beta) for row in rows])
    errors = prediction-actual
    return {"groups": len(rows), "orders": sum(len(row["orders"]) for row in rows), "groupRmseCents": float(np.sqrt(np.mean(errors**2))), "absoluteGroupErrorPerOrderCents": float(np.sum(np.abs(errors))/sum(len(row["orders"]) for row in rows)), "actualCostCents": float(actual.sum()), "predictedCostCents": float(prediction.sum()), "biasShare": float(errors.sum()/actual.sum())}

if __name__ == "__main__":
    path = root / "experiments/fulfillment-cost-model.json"
    assert not path.exists(), "Do not refit after examining the held-out development outcomes"
    folds = []
    for week in data["weeks"]:
        train = [row for row in groups if row["seed"] != week["seed"]]
        test = [row for row in groups if row["seed"] == week["seed"]]
        folds.append({"seed": week["seed"], "fixed": score(test, np.zeros(width)), "calibrated": score(test, fit(train, False)), "features": score(test, fit(train, True))})
    summary = {name: {"meanWeeklyGroupRmseCents": float(np.mean([fold[name]["groupRmseCents"] for fold in folds])), "meanWeeklyAbsoluteGroupErrorPerOrderCents": float(np.mean([fold[name]["absoluteGroupErrorPerOrderCents"] for fold in folds]))} for name in ["fixed", "calibrated", "features"]}
    model = {"frozenAt": datetime.now(timezone.utc).isoformat(), "recipe": recipe, "names": data["names"], "beta": fit(groups, True).tolist(), "calibratedBeta": fit(groups, False).tolist(), "trainingDataSha256": hashlib.sha256(data_path.read_bytes()).hexdigest(), "trainingWeeks": data["weeks"], "developmentCrossValidation": {"unit": "unique week", "folds": folds, "summary": summary}, "interpretation": "Leave-one-week-out development evidence only. The four new development weeks have not been read by this script. Full-policy profit and reliability remain untested."}
    path.write_text(json.dumps(model, indent=2)+"\n")
    print(json.dumps({"modelFrozen": str(path), "summary": summary}, indent=2))
