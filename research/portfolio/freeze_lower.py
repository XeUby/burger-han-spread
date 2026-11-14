"""Reuse the frozen runtime for a time-bounded lower-level development comparison."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
name = "portfolio-lower-v1"
path = ROOT / f"experiments/{name}.json"
if path.exists():
    raise RuntimeError("Do not overwrite a frozen comparison")
plan = json.loads((ROOT / "experiments/portfolio-development-v1.json").read_text())
base = plan["trials"][0]["settings"]
seeds = json.loads((ROOT / "experiments/plans/levels-first-option.json").read_text())["seeds"][:2]
protocol = {
    "role": "Urgent level 1–4 development screen requested before the 12:00 Helsinki round change; no statistical promotion",
    "frozenAt": datetime.now(timezone.utc).isoformat(),
    "hypothesis": "The joint portfolio's pre-quote cost/booking models and route choices improve whole-week economics over the first-option/opening-cost candidate at levels 1–3 and the preserved control at level 4.",
    "source": "Identical runtime, dependencies and solver assumptions to portfolio-development-v1; no new policy tuning.",
    "comparison": "Two familiar seed blocks crossed with levels 1–4 and benchmark/planner. Analyze each level separately. Related level trials share seed blocks.",
    "operations": {"workers": 2, "maximumUnfinishedTeamWorlds": 4, "ranked": False, "sharedCreationLock": "runs/team-world-creation.lock"},
    "stopping": "Complete all 16 worlds regardless of profit. Inherited runtime failure and 600-second world limit stop new creation and retain failures. No interim tuning or favorable stopping.",
    "analysis": "Paired profit, qualification, orders, driver payments, refunds, undelivered work, visits, action/runtime failures, source hashes and control replications. Two blocks cannot establish reliability or satisfy the 24-pair validation floor.",
    "decision": "This screen may reject an implementation or inform a separately authorized deployment decision. It cannot promote a new policy or replace fresh validation. No ranking, test final or final is authorized by this manifest.",
    "deadlineContext": "User says the current round closes at 12:00 Helsinki. The API reports current season 5 but exposes no closing timestamp. Preserve time for a concrete, separately authorized frozen ranking plan.",
}
protocol_path = ROOT / "experiments/portfolio-lower-v1-protocol.json"
protocol_path.write_text(json.dumps(protocol, indent=2) + "\n")
plan.update(frozenAt=protocol["frozenAt"], role=protocol["role"], trials=[{"level": level, "seed": seed, "label": f"lower-v1-{arm}", "settings": {**base, "portfolio": arm == "planner"}} for seed in seeds for level in [1, 2, 3, 4] for arm in ["benchmark", "planner"]], attempts=f"experiments/{name}-attempts.jsonl", report=f"docs/{name}-runs.json", protocol=str(protocol_path.relative_to(ROOT)), protocolSha256=hashlib.sha256(protocol_path.read_bytes()).hexdigest())
path.write_text(json.dumps(plan, indent=2) + "\n")
print(json.dumps({"manifest": str(path), "worlds": len(plan["trials"]), "uniqueSeedBlocks": len(seeds)}))
