"""Freeze executable sources, priors, settings and a bounded development panel."""

import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def freeze():
    name = "value-development-v1"
    plan_path = ROOT / f"experiments/{name}.json"
    rebuild = "--rebuild" in sys.argv
    if plan_path.exists() and not rebuild:
        raise RuntimeError("A frozen plan must never be overwritten")
    saved = json.loads(plan_path.read_text()) if rebuild else None
    bundle = ROOT / f"runs/frozen/{name}"
    if bundle.exists():
        if saved and all(hashlib.sha256((bundle / p).read_bytes()).hexdigest() == h for p,h in saved["files"].items()):
            print("Existing bundle matches every frozen file")
            return
        raise RuntimeError("Bundle exists; inspect it instead of overwriting")
    shutil.copytree(ROOT / "src", bundle / "src")
    shutil.copytree(ROOT / "vendor", bundle / "vendor")
    (bundle / "src/policy.ts").rename(bundle / "src/control.ts")
    policy = (ROOT / "research/value/policy.ts").read_text().replace('"../../src/policy.ts"', '"./control.ts"').replace('"../../src/', '"./').replace('"../../vendor/', '"../vendor/').replace('"../../experiments/booking-response-prior.json"', '"./booking-prior.json"')
    (bundle / "src/policy.ts").write_text(policy)
    shutil.copyfile(ROOT / "experiments/booking-response-prior.json", bundle / "src/booking-prior.json")
    runner = (bundle / "src/run.ts").read_text()
    runner = runner.replace('await writeFile(`runs/${world.id}.errors.json`', 'await writeFile(`runs/${world.id}.decisions.json`, JSON.stringify(desk.telemetry))\n    await writeFile(`runs/${world.id}.errors.json`')
    runner = runner.replace('desk.market = previous.market', '''desk.market = previous.market
  desk.telemetry.unshift(...previous.telemetry)
  desk.randomState = previous.randomState
  desk.probeCount = previous.probeCount
  desk.links = new Map(previous.links)
  desk.driverAttempts = new Set(previous.driverAttempts)''')
    (bundle / "src/run.ts").write_text(runner)
    files = {str(p.relative_to(bundle)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(bundle.rglob("*")) if p.is_file()}
    if saved:
        if files != saved["files"]:
            raise RuntimeError("Rebuilt files differ from the frozen manifest; do not run")
        print("Rebuilt bundle matches every frozen file")
        return
    base = json.loads((ROOT / "experiments/final-config.json").read_text())
    safe = {**base, "firstOptionOnly": True, "openingCostAdmission": True, "actionGuard": True}
    arms = {"benchmark": base, "mechanisms": safe, "capacity": {**safe, "capacityValue": True}, "routes": {**safe, "routeValue": True}, "capacity-routes": {**safe, "capacityValue": True, "routeValue": True}, "combined": {**safe, "capacityValue": True, "routeValue": True, "driverValue": True}}
    seeds = [f"formal-unseen-20261113-{i:02d}" for i in [9, 10, 14, 15]]
    trials = [{"label": f"value-v1-{arm}", "seed": seed, "level": 8, "settings": settings} for seed in seeds for arm, settings in arms.items()]
    lower = json.loads((ROOT / "experiments/plans/levels-first-option.json").read_text())["seeds"][:2]
    for seed in lower:
        for level in [1, 4]:
            for arm in ["mechanisms", "capacity"]:
                trials.append({"label": f"value-v1-{arm}", "seed": seed, "level": level, "settings": arms[arm]})
    for index, seed in enumerate(seeds[:2]):
        trials.append({"label": "value-v1-payment-probe", "seed": seed, "level": 8, "settings": {**safe, "paymentProbe": True, "randomSeed": 74117+index*101}})
    plan = {"frozenAt": datetime.now(timezone.utc).isoformat(), "bundle": str(bundle.relative_to(ROOT)), "files": files, "role": "development only; all seeds already retired", "jobs": 2, "maximumUnfinishedTeamWorlds": 4, "trials": trials, "attempts": "experiments/value-development-attempts.jsonl", "report": "docs/value-development-runs.json", "protocol": "experiments/value-protocol.json"}
    plan_path.write_text(json.dumps(plan, indent=2)+"\n")
    print(json.dumps({"plan": str(plan_path), "worlds": len(trials), "uniqueSeedBlocks": len(set(t["seed"] for t in trials)), "files": len(files)}))


if __name__ == "__main__":
    freeze()
