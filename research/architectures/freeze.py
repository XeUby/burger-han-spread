"""Freeze three architecture departures and their matched development comparison."""

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "analysis"))
from frontier_validation import load_world

target = root / "experiments/architectures-protocol.json"
assert not target.exists(), "Architecture study is already frozen"
settings = json.loads((root / "experiments/final-config.json").read_text())
selection = json.loads((root / "experiments/current-selection.json").read_text())
assert settings["payout"] == 0.85 and settings["openingOnly"]
worlds = ["wccca731d04dbfacbaba0", "w7b412da927edcef0081e", "w2464fa0a1a5ce6878d47", "w657d3e2075cdc8dcb443"]
baselines = []
for world in worlds:
    meta = json.loads((root / f"runs/{world}.meta.json").read_text())
    expected = {"revision": selection["sourceReference"], "settings": settings}
    result = load_world(root, world, meta["seed"], expected)
    baselines.append({"worldId": world, "seed": meta["seed"], **expected, "marginCents": result["marginCents"], "wonOrders": result["wonOrders"], "onTimeShare": result["onTimeShare"]})
bundle = "research/architectures/bundle"
digest = hashlib.sha256()
for file in sorted((root / bundle / "src").glob("*.ts")):
    digest.update(file.name.encode())
    digest.update(file.read_bytes())
variants = {
    "architecture-joint": {**settings, "architecture": 1, "bundleWait": 30},
    "architecture-calendar": {**settings, "architecture": 2},
    "architecture-volume": {**settings, "architecture": 3, "bundleWait": 5},
}
plan = [{"label": label, "seed": baseline["seed"], "settings": config} for baseline in baselines for label, config in variants.items()]
canary = [{"label": "architecture-control", "seed": baselines[2]["seed"], "settings": {**settings, "architecture": 0}}]
protocol = {
    "declaredAt": datetime.now(timezone.utc).isoformat(), "revision": digest.hexdigest(), "bundle": bundle,
    "scope": "Three frozen architecture policies on four old development seeds (09,10,14,15), spanning low-margin, high-margin and stressed weeks. Twelve treatment weeks plus one control replication. No fresh payout validation seed is used for this screen.",
    "maximumJobs": 2, "maximumConcurrentPlays": 4,
    "baselineSelection": selection, "baselines": baselines,
    "controlReplication": {"plan": "experiments/plans/architectures-control.json", "referenceWorldId": worlds[2], "requirement": "The architecture0 control must exactly reproduce terminal score and event history. If it differs, retain it and rerun all four matched controls before interpreting treatment differences."},
    "plan": "experiments/plans/architectures.json", "attempts": "experiments/architectures-attempts.jsonl", "variants": variants,
    "hypotheses": {
        "architecture-joint": {
            "mechanism": "Collect known requests until two minutes before the oldest response deadline. Jointly optimize paired customer prices against a feasible sequential route, allowing a leg below standalone cost. Broaden connectors to90km and maximum route discount to40%; hold won jobs for30minutes to assemble routes. Unmatched requests use incumbent admission.",
            "largeGainSource": "Acquire complementary legs that independent profitable-job admission rejects, and remove repeated mobilization/return travel costs. Route savings affect acquisition before either order is won.",
            "falsification": "If joint quotes do not produce substantially more composed routes, or extra revenue and route savings do not exceed solo fallback losses, fees and refunds, this implementation fails. Qualification failures also reject promotion.",
            "priorEvidence": "Earlier eight-week model predicted about299euros/week under30km connectors,20% discount and the incumbent demand/routing assumptions. That was a narrow model deferral, not a whole-policy rejection of joint acquisition. This trial changes those constraints and observes actual outcomes.",
        },
        "architecture-calendar": {
            "mechanism": "Replace ready-day order-count and backlog gates with an online service-day work ledger. Pending quotes reserve expected work; wins reserve full work. Compare feasible option/day choices with convex capacity-dependent quote costs, then enforce the selected service day in posted stop windows. Budget180work-minutes per weighted local driver per day; allow at most120% modeled load.",
            "largeGainSource": "Sell idle future-day service time while charging for scarce days, rather than rejecting every job once its original ready-day quota is full. Reuse completed capacity on later days.",
            "falsification": "If extra planned work cannot be booked, future-day assignments lose too much customer demand, or price premiums fail to cover lateness and driver costs, reject this implementation. The calendar is a capacity heuristic, not a driver-level feasibility proof.",
            "priorEvidence": "The previous84euros/week screen over-reserved booked jobs on every feasible day and retained incumbent quotas. It cannot settle an architecture using work units, expected reservations, changed prices and enforced service days.",
        },
        "architecture-volume": {
            "mechanism": "Remove the cumulative ready-day admission gate. Allow900km routes and four weighted eligible drivers, with a broader live regional backlog cap. Pay1.10times canonical fee initially,1.30after45minutes,1.50after120minutes, then deadline rescue. Hold new jobs5minutes and rematch compatible open gigs every15minutes using90km connectors and up to35% bundle discount.",
            "largeGainSource": "Buy driver commitment early to sustain much greater throughput and dealer trust, while using repeated route composition to reduce the extra fulfillment cost. The payment policy deliberately reverses the cheap-opening strategy.",
            "falsification": "If throughput does not rise materially, or the extra driver spend and congestion consume the added revenue, reject this implementation. A throughput increase with disqualification is not a win.",
            "priorEvidence": "The old aggressive lowfee policy coupled lower quote prices with lower driver payments. The early-rescue and rolling-bundle exposure screens used incumbent demand and dispatch. Neither adequately tested higher volume with early generous payment and rolling route composition.",
        },
    },
    "screeningGate": {"meanPairedGainEurosAtLeast": 1500, "worstPairedGainEurosAtLeast": -1000, "allWeeksQualified": True, "undeliveredOrders": 0, "failedVisits": 0},
    "selection": "After all twelve treatment weeks finish, choose the passing policy with greatest mean paired gain; tie by greater minimum weekly on-time share then label. Do not tune mid-panel. No passing policy means no promotion. A throughput increase of at least25% with nonnegative mean gain may justify one bounded redesign, but is not a passing profit result.",
    "confirmation": "A selected substantial improvement must next beat the incumbent on old seeds12and16, with positive mean gain, worst loss no worse than500euros, all weeks qualified and zero undelivered orders or failed visits. Only then reserve a fresh independent paired validation panel before promotion.",
    "measurement": ["terminal net ledger margin", "qualified weeks", "won and on-time orders", "driver fees", "late refunds", "undelivered orders", "failed visits", "action errors and recoveries", "joint quoted requests, calendar assignments and composed/rematched bundles"],
    "interruption": "Preserve every attempt. Stop new trials on transport/coordinator failure. Experimental modes do not silently rebuild without their architecture state after a network interruption. Do not substitute a new attempt without explicitly documenting the interruption.",
    "limitations": ["Four selected old weeks are development evidence, not generalization proof.", "No unmatched leaderboard rank estimate or global-optimality claim.", "Joint logistic wins and calendar workload predictions are hypotheses; whole-week outcomes can falsify them.", "Physical legality, equipment, opening-hour checks and uncertain-note rejection are retained. Admission, pricing, payments and route composition are experimentally changed."],
}
(root / protocol["plan"]).write_text(json.dumps(plan, indent=2) + "\n")
(root / protocol["controlReplication"]["plan"]).write_text(json.dumps(canary, indent=2) + "\n")
target.write_text(json.dumps(protocol, indent=2) + "\n")
(root / "experiments/architectures-manifest.json").write_text(json.dumps({"protocol": str(target.relative_to(root)), "protocolSha256": hashlib.sha256(target.read_bytes()).hexdigest(), "worlds": [{"label": trial["label"], "seed": trial["seed"], "worldId": None} for trial in canary + plan]}, indent=2) + "\n")
print(json.dumps({"revision": protocol["revision"], "treatmentWeeks": len(plan), "baselines": baselines, "gate": protocol["screeningGate"]}, indent=2))
