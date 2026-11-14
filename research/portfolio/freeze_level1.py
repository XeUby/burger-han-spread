"""Test corrected-option economics before extrapolating an abundant-supply policy."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
name = "level1-corrected-economics-v1"
path = ROOT / f"experiments/{name}.json"
if path.exists():
    raise RuntimeError("Frozen study already exists")
plan = json.loads((ROOT / "experiments/portfolio-lower-v1.json").read_text())
base = {**plan["trials"][0]["settings"], "portfolio": False}
seeds = list(dict.fromkeys(t["seed"] for t in plan["trials"]))
arms = {"capacity": {**base, "capacity": .525, "backlog": .12}, "payment": {**base, "fee": .9}, "joint": {**base, "capacity": .525, "backlog": .12, "fee": .9}}
protocol = {
    "frozenAt": datetime.now(timezone.utc).isoformat(),
    "role": "Six-world level-1 development interaction test; no validation or promotion",
    "newMechanism": "Earlier cheap-pay/expanded-admission factorial tests used incorrect awarded-option feasibility and the old admission economics. Retain the first-option and opening-cost corrections and existing route/deadline/eligibility safety checks. Test 1.5x regional capacity/backlog, a moderate base-fee reduction from1.05to0.90, and their interaction. Opening payout stays0.85, giving0.765reference before local supply extras; rescue pricing stays inherited.",
    "arms": arms,
    "seeds": seeds,
    "control": "The exact corrected-option control from portfolio-lower-v1 on the same two seeds. Reuse verified whole-week outcomes rather than spending duplicate worlds; repetitions are not additional evidence.",
    "comparisons": ["capacity minus control", "payment minus control", "joint minus control", "joint minus capacity minus payment plus control"],
    "stopping": "Finish all six regardless of profit. Inherited runtime failures and ten-minute per-world budget stop new creation. Preserve every partial and failure. No within-panel parameter revision.",
    "operations": {"workers": 2, "maximumUnfinishedTeamWorlds": 4, "sharedCreationLock": True, "ranked": False},
    "decision": "Report each whole-week result, qualification, costs, refunds, failures and paired differences. A deployment nominee requires gains on both weeks, at least1500euros mean gain, both weeks>=92%on-time, no undelivered or failed visits, and no runtime failure. Lower on-time versus control remains explicit. These two familiar blocks cannot satisfy24-pair validation or establish safety. Do not transfer to levels2–4 without testing their mechanisms.",
    "authorization": "Unranked research only. Ranked entry requires separate explicit user authorization of a concrete frozen policy.",
}
protocol_path = ROOT / f"experiments/{name}-protocol.json"
protocol_path.write_text(json.dumps(protocol, indent=2) + "\n")
plan.update(frozenAt=protocol["frozenAt"], role=protocol["role"], trials=[{"level": 1, "seed": seed, "label": f"corrected-v1-{arm}", "settings": settings} for seed in seeds for arm, settings in arms.items()], attempts=f"experiments/{name}-attempts.jsonl", report=f"docs/{name}-runs.json", protocol=str(protocol_path.relative_to(ROOT)), protocolSha256=hashlib.sha256(protocol_path.read_bytes()).hexdigest())
path.write_text(json.dumps(plan, indent=2) + "\n")
print(json.dumps({"manifest": str(path), "worlds": len(plan["trials"]), "seedBlocks": len(seeds)}))
