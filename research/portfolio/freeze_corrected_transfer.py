"""Retest the earlier abundant-supply payment hypothesis with corrected options."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
name = "corrected-payment-transfer-v1"
path = ROOT / f"experiments/{name}.json"
if path.exists():
    raise RuntimeError("Frozen study already exists")
plan = json.loads((ROOT / "experiments/portfolio-lower-v1.json").read_text())
base = {**plan["trials"][0]["settings"], "portfolio": False}
seeds = list(dict.fromkeys(t["seed"] for t in plan["trials"]))
arms = {"payment": {**base, "fee": .72}, "joint": {**base, "fee": .72, "capacity": .525, "backlog": .12}}
protocol = {
    "frozenAt": datetime.now(timezone.utc).isoformat(),
    "role": "Adaptive development; no promotion, validation or independent-seed claim",
    "hypothesis": "Retest the earlier0.72base-fee policy with first-option feasibility and actual-opening-cost admission corrected. This interaction was absent from the earlier low-pay test. Compare original versus1.5x capacity/backlog and explicitly test level2driver learning and level3bundling instead of transferring a level1result by assumption. Retain all other safety, deadline and rescue rules.",
    "priorSearch": "This follows the moderate0.90fee level1study on the same familiar weeks. All results remain development and all variants count toward the search history.0.72comes from the earlier documented economics arm; no parameter is revised during this new panel.",
    "arms": arms, "seeds": seeds, "levels": [1, 2, 3],
    "control": "Reuse same-seed, same-level corrected-option benchmark completions from portfolio-lower-v1 after verifying the control archive replications.",
    "stopping": "Complete all twelve regardless of profit. Runtime failure/600-second world budget stops creation, preserves failures and lets other workers finish. No interim parameter changes.",
    "operations": {"workers": 4, "maximumUnfinishedTeamWorlds": 8, "capacityAuthorization": "remove 4 world limit, go 8", "ranked": False, "sharedCreationLock": True},
    "analysis": "Separate each level. Report paired net profit, qualification, throughput, driver payments, refunds, undelivered orders, failed visits, action/runtime errors and exact qualification lower bounds. Two shared seed blocks cannot satisfy the24-pair minimum. No pooled average may conceal a level failure.",
    "deploymentScreen": "A level-specific nominee must gain on both weeks, gain>=1500euros on average, qualify on both with>=92%on-time, have zero undelivered/failed visits/runtime failures. All on-time losses versus control remain explicit. This is only an urgency-driven deployment screen, not the prospective statistical promotion gate.",
    "ranking": "A concrete frozen policy and current user authorization are required separately; no test final or final.",
}
protocol_path = ROOT / f"experiments/{name}-protocol.json"
protocol_path.write_text(json.dumps(protocol, indent=2) + "\n")
plan.update(frozenAt=protocol["frozenAt"], role=protocol["role"], jobs=4, maximumUnfinishedTeamWorlds=8, capacityAuthorization="remove 4 world limit, go 8", trials=[{"level": level, "seed": seed, "label": f"corrected-transfer-v1-{arm}", "settings": settings} for seed in seeds for level in [1, 2, 3] for arm, settings in arms.items()], attempts=f"experiments/{name}-attempts.jsonl", report=f"docs/{name}-runs.json", protocol=str(protocol_path.relative_to(ROOT)), protocolSha256=hashlib.sha256(protocol_path.read_bytes()).hexdigest(), launcherSha256=hashlib.sha256((ROOT / "research/portfolio/run8.ts").read_bytes()).hexdigest())
path.write_text(json.dumps(plan, indent=2) + "\n")
print(json.dumps({"manifest": str(path), "worlds": len(plan["trials"]), "blocks": len(seeds), "workers": plan["jobs"], "maximumTeamWorlds": 8}))
