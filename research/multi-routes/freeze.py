"""Freeze route-based fulfillment and its interaction with broader admission."""

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "analysis"))
from frontier_validation import load_world

target = root / "experiments/multi-routes-protocol.json"
assert not target.exists(), "The multi-route study is already frozen"
settings = json.loads((root / "experiments/final-config.json").read_text())
selection = json.loads((root / "experiments/current-selection.json").read_text())
baselines = []
for world in ["wccca731d04dbfacbaba0", "w7b412da927edcef0081e", "w2464fa0a1a5ce6878d47", "w657d3e2075cdc8dcb443"]:
    meta = json.loads((root / f"runs/{world}.meta.json").read_text())
    expected = {"revision": selection["sourceReference"], "settings": settings}
    result = load_world(root, world, meta["seed"], expected)
    baselines.append({"worldId": world, "seed": meta["seed"], **expected, "marginCents": result["marginCents"], "wonOrders": result["wonOrders"], "onTimeShare": result["onTimeShare"]})
bundle = "research/multi-routes/bundle"
digest = hashlib.sha256()
for file in sorted((root / bundle / "src").glob("*.ts")):
    digest.update(file.name.encode())
    digest.update(file.read_bytes())
variants = {
    "multi-routes": {**settings, "multiRoutes": True, "bundleWait": 30},
    "multi-routes-volume": {**settings, "multiRoutes": True, "bundleWait": 30, "capacity": 0.55, "backlog": 0.12, "sameDayBacklog": 6},
}
plan = [{"label": label, "seed": row["seed"], "settings": config} for row in baselines for label, config in variants.items()]
canary = [{"label": "multi-routes-control", "seed": baselines[2]["seed"], "settings": {**settings, "multiRoutes": False}}]
protocol = {
    "declaredAt": datetime.now(timezone.utc).isoformat(), "revision": digest.hexdigest(), "bundle": bundle,
    "scope": "Two frozen route policies on four old matched development seeds09,10,14,15, plus exact control replication. No fresh validation, ranking or final.",
    "maximumJobs": 2, "maximumConcurrentPlays": 4, "baselineSelection": selection, "baselines": baselines,
    "controlReplication": {"plan": "experiments/plans/multi-routes-control.json", "referenceWorldId": baselines[2]["worldId"], "requirement": "The disabled wrapper must reproduce the complete archived seed14 event history and score. Otherwise rerun matched controls before interpreting differences."},
    "plan": "experiments/plans/multi-routes.json", "attempts": "experiments/multi-routes-attempts.jsonl", "variants": variants,
    "routing": "At30minute holding flushes, enumerate sequential routes of2to4cars with connectors at most90km, at most720road minutes, stated site hours, every stop window,90minutes booking allowance and30minutes delivery buffer. Route pay takes80%of modeled saved work as a discount, capped45%. Compare route opening pay with each single's actual0.85payout. Choose disjoint positive-saving routes by exact set packing for queues up to20cars; larger queues use greedy packing. Enumeration stops at30000extensions per batch and records truncation. Deadline escalation remains active.",
    "hypotheses": {
        "multi-routes": {"mechanism": "Replace pairs with up-to-four-car routes and route-work-based pay, preserving admission and customer-price rules. Hold30minutes to collect compatible cars.", "largeGainSource": "Less repeated mobilization and return travel, fewer driver commitments, and less rescue escalation could exceed the small opening-fee difference.", "falsification": "Reject if larger routes cannot book reliably or whole-week driver costs and refunds erase the work saving. More cars per gig is not itself a gain."},
        "multi-routes-volume": {"mechanism": "Use the same route-based fulfillment while broadening daily regional admission from0.35to0.55per weighted driver, backlog from0.08to0.12and same-day unbooked cap from4to6. Keep700km maximum routes, at least8weighted drivers, customer pricing costs and cheap single opening fees.", "largeGainSource": "Longer efficient routes may support more revenue without the expensive early payments that defeated the earlier high-volume architecture.", "falsification": "Reject if greater volume again raises driver spend and lateness faster than revenue, or if enlarged queues do not yield usable longer routes."},
    },
    "priorEvidence": "A four-week fixed-wins screen found57routes with3or4cars and504.14euros/week modeled opening saving for the wide route-cost policy. The same narrow payment model with only a larger route limit added4.86euros/week beyond economic pairs. These are not causal gains or global bounds. The volume arm explicitly changes the accepted work and route pool. The earlier12architecture trials and failed premium exposure remain rejected and retained.",
    "screeningGate": {"meanPairedGainEurosAtLeast": 1500, "worstPairedGainEurosAtLeast": -1000, "allWeeksQualified": True, "undeliveredOrders": 0, "failedVisits": 0},
    "selection": "Complete all8treatment weeks unchanged. Choose the passing policy with highest mean paired gain, then higher minimum on-time share. No passing policy means no promotion or parameter rescue within this study.",
    "confirmation": "A passing selection proceeds unchanged to old seeds12and16. Require positive mean gain, worst loss no worse than500euros, both qualified and zero undelivered orders or failed visits. Only then reserve fresh independent validation.",
    "interruption": "Stop new trials on runner failure and retain every attempt. Experimental mode stops on transport failure rather than rebuilding without its counters. No silent replacement.",
    "measurement": ["net margin", "qualification", "orders", "driver fees", "late refunds", "on-time share", "undelivered orders", "failed visits", "fines", "route sizes and modeled work savings", "truncated searches", "action errors and recoveries"],
    "limitations": ["Saved work and its payment conversion are hypotheses about driver costs, not observed reservation prices.", "The current booked-order change handler can miss a newly required charging stop after a destination change; any fine remains in the results. The validated control is not modified.", "Exact route packing is only exact for its generated finite candidate set and modeled objective. No global dispatcher optimality claim or unmatched leaderboard rank inference."],
}
(root / protocol["plan"]).write_text(json.dumps(plan, indent=2) + "\n")
(root / protocol["controlReplication"]["plan"]).write_text(json.dumps(canary, indent=2) + "\n")
(root / "experiments/plans/multi-routes-all.json").write_text(json.dumps(canary + plan, indent=2) + "\n")
target.write_text(json.dumps(protocol, indent=2) + "\n")
(root / "experiments/multi-routes-manifest.json").write_text(json.dumps({"protocol": str(target.relative_to(root)), "protocolSha256": hashlib.sha256(target.read_bytes()).hexdigest(), "worlds": [{"label": row["label"], "seed": row["seed"], "worldId": None} for row in canary + plan]}, indent=2) + "\n")
print(json.dumps({"revision": protocol["revision"], "trials": len(canary + plan), "gate": protocol["screeningGate"]}))
