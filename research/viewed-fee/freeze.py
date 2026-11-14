"""Declare the bounded first-view fee experiment before reading any treatment outcome."""

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "analysis"))
from frontier_validation import load_world

target = root / "experiments/viewed-fee-protocol.json"
assert not target.exists(), "This experiment is already frozen"
settings = json.loads((root / "experiments/final-config.json").read_text())
selection = json.loads((root / "experiments/current-selection.json").read_text())
baselines = []
for world in ["w2464fa0a1a5ce6878d47", "w657d3e2075cdc8dcb443"]:
    meta = json.loads((root / f"runs/{world}.meta.json").read_text())
    expected = {"revision": selection["sourceReference"], "settings": settings}
    result = load_world(root, world, meta["seed"], expected)
    baselines.append({"worldId": world, "seed": meta["seed"], **expected, "marginCents": result["marginCents"]})
bundle = "research/viewed-fee/bundle"
digest = hashlib.sha256()
for file in sorted((root / bundle / "src").glob("*.ts")):
    digest.update(file.name.encode())
    digest.update(file.read_bytes())
plan = [{"label": "viewed-fee-control", "seed": baselines[0]["seed"], "settings": {**settings, "viewedFee": False}}]
plan += [{"label": "viewed-fee-pulse", "seed": row["seed"], "settings": {**settings, "viewedFee": True}} for row in baselines]
protocol = {
    "declaredAt": datetime.now(timezone.utc).isoformat(),
    "bundle": bundle, "revision": digest.hexdigest(), "baselines": baselines,
    "plan": "experiments/plans/viewed-fee.json", "attempts": "experiments/viewed-fee-attempts.jsonl",
    "scope": "Two whole-week mechanism/development trials on old seeds14 and15 plus exact control replication. No fresh validation, ranking or final.",
    "mechanism": "During day0, eligible first posts with at least360minutes pickup slack initially show1.5times their normal opening fee. After5minutes restore their exact original schedule if unbooked. Reserve the entire possible extra opening payment per exposure, with a600euro total reservation cap. Never repeat an order's premium. Existing admission, customer pricing, routing and subsequent fees remain the validated control's policy.",
    "largeGainSource": "A bounded early investment may teach enough active drivers that fees do not reliably rise, reducing later waiting, rescue fees and lateness. Drivers who book during exposure really receive the premium; its cost counts against the result.",
    "priorEvidence": "The zero-time creation-price test had identical event streams because no driver viewed the temporary price. This experiment advances the clock while the higher price is visible. It tests actual first-view exposure, not an unobserved creation anchor.",
    "falsification": "Reject if there is no material eligible exposure or if the complete-week savings do not cover the early investment. A changed booking stream alone is not profitable mechanism evidence. Public records do not expose hidden beliefs or whether every viewer could perform the job.",
    "screeningGate": {"meanGainEurosAtLeast": 1500, "minimumGainEurosAtLeast": 0, "qualified": 2, "undelivered": 0, "failedVisits": 0},
    "nextGate": "Only a passing two-week result proceeds, unchanged, to old seeds09 and10. Require positive gain on both confirmation weeks and all qualification/reliability gates before a fresh independent panel. Do not tune the pulse magnitude, duration or budget after failure.",
    "control": "The disabled wrapper must exactly reproduce archived seed14 events and score. A mismatch blocks causal interpretation until resolved with new matched controls.",
    "measurement": ["net profit", "qualification", "throughput", "driver fees", "late refunds", "on-time orders", "undelivered orders", "failed visits", "fines", "exposures and views", "early premium bookings", "restored schedules", "action errors"],
    "maximumConcurrentPlays": 4, "maximumJobs": 2,
    "interruption": "Retain every attempt and stop new trials on an error. A transport error stops experimental mode rather than rebuilding without exposure state. No silent replacement.",
    "limits": ["The600euro cap bounds reserved initial premiums relative to normal opening fees, not whole-policy loss after trajectories diverge.", "Old matched seeds are development evidence. No projected leaderboard rank or global-optimality claim.", "The first-day treatment changes immediate booking cost as well as possible later learning; it does not isolate a hidden belief variable."],
}
(root / protocol["plan"]).write_text(json.dumps(plan, indent=2) + "\n")
target.write_text(json.dumps(protocol, indent=2) + "\n")
(root / "experiments/viewed-fee-manifest.json").write_text(json.dumps({"protocol": str(target.relative_to(root)), "protocolSha256": hashlib.sha256(target.read_bytes()).hexdigest(), "worlds": [{"label": row["label"], "seed": row["seed"], "worldId": None} for row in plan]}, indent=2) + "\n")
print(json.dumps({"revision": protocol["revision"], "trials": len(plan), "gate": protocol["screeningGate"]}))
