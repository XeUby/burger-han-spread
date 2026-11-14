"""Freeze a simple calibration selected during development, not independent validation."""

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "analysis"))
from frontier_validation import load_world

target = root / "experiments/cost-calibration-protocol.json"
assert not target.exists()
model_path = root / "experiments/fulfillment-cost-model.json"
model = json.loads(model_path.read_text())
assessment = json.loads((root / "docs/fulfillment-cost-assessment.json").read_text())
assert assessment["modelSha256"] == hashlib.sha256(model_path.read_bytes()).hexdigest()
development = json.loads((root / "experiments/cost-development-protocol.json").read_text())
attempts = [json.loads(line) for line in (root / development["attempts"]).read_text().splitlines()]
started = [row for row in attempts if row.get("startedAt")]
assert len(started) == len({row["seed"] for row in started}) == 4
baselines = []
for row in started:
    assert any(item.get("completedAt") and item.get("worldId") == row["worldId"] for item in attempts)
    expected = {"revision": development["revision"], "settings": development["settings"]}
    result = load_world(root, row["worldId"], row["seed"], expected)
    baselines.append({"worldId": row["worldId"], "seed": row["seed"], **expected, "marginCents": result["marginCents"], "wonOrders": result["wonOrders"], "onTimeShare": result["onTimeShare"]})
settings = {**development["settings"], "costRatio": model["recipe"]["priorRatio"] + model["calibratedBeta"][0]}
plan = [{"label": "cost-calibration", "seed": row["seed"], "settings": settings} for row in baselines]
protocol = {
    "declaredAt": datetime.now(timezone.utc).isoformat(), "bundle": development["bundle"], "revision": development["revision"], "baselines": baselines,
    "settings": settings, "modelSha256": assessment["modelSha256"], "scope": "Four matched development weeks. The four seeds were used for cost-model assessment and are permanently retired from future validation. Four repeated treatment runs provide four paired weeks, not eight independent weeks.",
    "selectionHistory": "The16feature model failed its held-out development gate. The simpler scalar calibration was fitted earlier on six old weeks and inspected alongside the feature model on four new weeks. Selecting it for this experiment uses those outcomes; this is development selection across models, not an untouched test.",
    "hypothesis": "The incumbent1.15quote-cost multiplier overestimates actual fulfillment expense. A calibrated expected cost may win additional profitable work and improve price-demand decisions while preserving driver pay, route composition and capacity protection.",
    "falsification": "Reject if lower quotes reduce contribution or create enough congestion and late refunds to erase additional revenue. Prediction accuracy alone does not imply profitable policy improvement.",
    "plan": "experiments/plans/cost-calibration.json", "attempts": "experiments/cost-calibration-attempts.jsonl", "maximumJobs": 4, "maximumConcurrentPlays": 4,
    "gate": {"meanPairedGainEurosAtLeast": 1500, "worstPairedGainEurosAtLeast": -1000, "qualified": 4, "undelivered": 0, "failedVisits": 0},
    "next": "Only a passing frozen policy can be selected for an entirely fresh paired validation panel. Declare candidate hashes, complete panel size, profit/reliability criteria and sequential multiplicity allocation before any validation play. Do not promote from these four development weeks.",
    "retention": "Retain every attempt, action error and failed week. Stop new trials on runner failure; no silent replacement. No ranking or final.",
}
h = hashlib.sha256()
for file in sorted((root / protocol["bundle"] / "src").glob("*.ts")):
    h.update(file.name.encode()); h.update(file.read_bytes())
assert h.hexdigest() == protocol["revision"]
target.write_text(json.dumps(protocol, indent=2)+"\n")
(root / protocol["plan"]).write_text(json.dumps(plan, indent=2)+"\n")
(root / "experiments/cost-calibration-manifest.json").write_text(json.dumps({"protocol": str(target.relative_to(root)), "protocolSha256": hashlib.sha256(target.read_bytes()).hexdigest(), "worlds": [{"label": row["label"], "seed": row["seed"], "worldId": None} for row in plan]}, indent=2)+"\n")
print(json.dumps({"costRatio": settings["costRatio"], "pairedDevelopmentWeeks": len(plan), "maximumJobs": 4}))
