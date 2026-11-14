import hashlib
import json
import secrets
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = "level8-estimate-v1"
path = ROOT / f"experiments/{NAME}.json"
if path.exists():
    raise RuntimeError("Estimate already frozen; do not replace its seeds or outcomes")
plan = json.loads((ROOT / "experiments/portfolio-development-v1.json").read_text())
for name, expected in plan["files"].items():
    assert hashlib.sha256((ROOT / plan["bundle"] / name).read_bytes()).hexdigest() == expected, name
arms = {arm: next(t["settings"] for t in plan["trials"] if t["label"].endswith("-" + arm)) for arm in ["benchmark", "payments"]}
registry_path = ROOT / "experiments/seed-registry.json"
registry = json.loads(registry_path.read_text())
existing = "\n".join(p.read_text() for p in (ROOT / "experiments").glob("*.json"))
seeds = ["level8-estimate-" + secrets.token_hex(12) for _ in range(8)]
assert len(set(seeds)) == 8 and all(seed not in existing for seed in seeds)
now = datetime.now(timezone.utc).isoformat()
protocol = {
    "frozenAt": now,
    "role": "Fixed eight-pair performance estimation on new development weeks; not promotion validation",
    "request": "Estimate current best level8 performance on unranked before further development",
    "candidate": "Unchanged portfolio payments arm, highest historical four-block mean; not validated as superior",
    "control": "Preserved level8 control in the same frozen bundle",
    "seeds": seeds,
    "settings": arms,
    "analysis": "Complete all eight pairs before analysis. Report weekly net profit, descriptive paired-t and bootstrap intervals, qualification exact lower95 bound, throughput, payments, refunds, undelivered, failed visits, fines, action and runtime errors. No interim selection or seed replacement.",
    "leaderboard": "Compare means descriptively to the current level8 leader. Different seeds and selection of the leader prevent a matched gap or rank claim. Refresh snapshot after completion.",
    "stopping": "Sixteen worlds total, no outcome-dependent stopping. On operational failure stop creation, retain all outcomes and pending cases, inspect server state; do not silently retry or replace worlds. Inherited600-second policy runtime budget per world.",
    "operations": {"workers": 2, "maximumUnfinishedTeamWorlds": 4, "sharedLock": "runs/team-world-creation.lock", "ranked": False},
    "inference": "Eight underlying seeds, not sixteen independent observations. This estimation panel is development and permanently unavailable for untouched validation. Existing24-pair floor and multiplicity rules remain unchanged.",
}
protocol_path = ROOT / f"experiments/{NAME}-protocol.json"
protocol_path.write_text(json.dumps(protocol, indent=2) + "\n")
plan.update(frozenAt=now, role=protocol["role"], trials=[{"level": 8, "seed": seed, "label": f"{NAME}-{arm}", "settings": settings} for seed in seeds for arm, settings in arms.items()], attempts=f"experiments/{NAME}-attempts.jsonl", report=f"docs/{NAME}-runs.json", protocol=str(protocol_path.relative_to(ROOT)), protocolSha256=hashlib.sha256(protocol_path.read_bytes()).hexdigest())
path.write_text(json.dumps(plan, indent=2) + "\n")
registry["seeds"].extend({"seed": seed, "retiredAt": now, "role": "reserved-development-estimation", "eligibleForFreshValidation": False, "worlds": [], "reason": f"Reserved by experiments/{NAME}.json before play"} for seed in seeds)
registry["uniqueNamedWeeks"] = len(registry["seeds"])
registry["updatedAt"] = now
registry_path.write_text(json.dumps(registry, indent=2) + "\n")
print(json.dumps({"manifest": str(path), "worlds": 16, "uniqueSeeds": 8}))
