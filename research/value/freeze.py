"""Freeze executable sources, priors, settings and a bounded development panel."""

import hashlib
import json
import shutil
import sys
import argparse
import tarfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def freeze():
    parser=argparse.ArgumentParser()
    parser.add_argument("--name",default="value-development-v1")
    parser.add_argument("--rebuild",action="store_true")
    args=parser.parse_args()
    name = args.name
    if name not in ["value-development-v1","value-development-v2"]:
        raise ValueError("Unknown study")
    prefix="value-"+name.rsplit("-",1)[-1]
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
    archive=ROOT/f"experiments/{name}-source.tar.gz"
    if saved and archive.exists():
        with tarfile.open(archive,"r:gz") as source:
            files={}
            for member in source.getmembers():
                if member.isdir():
                    continue
                if not member.isfile() or member.name not in saved["files"] or member.name in files:
                    raise RuntimeError("Unexpected archive member")
                target=bundle/member.name
                if not target.resolve().is_relative_to(bundle.resolve()):
                    raise RuntimeError("Archive path escapes bundle")
                files[member.name]=source.extractfile(member).read()
        actual={name:hashlib.sha256(data).hexdigest() for name,data in files.items()}
        if actual!=saved["files"]:
            raise RuntimeError("Archived source does not match frozen manifest")
        for name,data in files.items():
            target=bundle/name
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(data)
        print("Restored archived source; every file matches the frozen manifest")
        return
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
    if name.endswith("v2"):
        runner=runner.replace('  try {\n    while (desk.now < snapshot.endsAt)', '''  const wallStarted=Date.now()
  let journaled=0
  const journal=async()=>{
    const rows=desk.telemetry.slice(journaled)
    if(rows.length) await appendFile(`runs/${world.id}.decisions.jsonl`,rows.map(row=>JSON.stringify(row)).join("\\n")+"\\n")
    journaled=desk.telemetry.length
  }
  try {
    while (desk.now < snapshot.endsAt)''')
        runner=runner.replace('        await desk.tick()', '        if(Date.now()-wallStarted>600_000) throw new Error("Research world exceeded its frozen ten-minute wall-time budget")\n        await desk.tick()\n        await journal()',1)
        runner=runner.replace('        if (Math.floor(desk.now / 1440) > day) report', '        await journal()\n        if (Math.floor(desk.now / 1440) > day) report',1)
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
    trials = [{"label": f"{prefix}-{arm}", "seed": seed, "level": 8, "settings": settings} for seed in seeds for arm, settings in arms.items()]
    lower = json.loads((ROOT / "experiments/plans/levels-first-option.json").read_text())["seeds"][:2]
    for seed in lower:
        for level in [1, 4]:
            for arm in ["mechanisms", "capacity"]:
                trials.append({"label": f"{prefix}-{arm}", "seed": seed, "level": level, "settings": arms[arm]})
    for index, seed in enumerate(seeds[:2]):
        trials.append({"label": f"{prefix}-payment-probe", "seed": seed, "level": 8, "settings": {**safe, "paymentProbe": True, "randomSeed": 74117+index*101}})
    stem="value-development" if name.endswith("v1") else name
    protocol="experiments/value-protocol.json" if name.endswith("v1") else "experiments/value-v2-protocol.json"
    plan = {"frozenAt": datetime.now(timezone.utc).isoformat(), "bundle": str(bundle.relative_to(ROOT)), "files": files, "role": "development only; all seeds already retired", "jobs": 2, "maximumUnfinishedTeamWorlds": 4, "trials": trials, "attempts": f"experiments/{stem}-attempts.jsonl", "report": f"docs/{stem}-runs.json", "protocol": protocol,"protocolSha256":hashlib.sha256((ROOT/protocol).read_bytes()).hexdigest(),"launcherSha256":hashlib.sha256((ROOT/"research/value/run.ts").read_bytes()).hexdigest()}
    plan_path.write_text(json.dumps(plan, indent=2)+"\n")
    print(json.dumps({"plan": str(plan_path), "worlds": len(trials), "uniqueSeedBlocks": len(set(t["seed"] for t in trials)), "files": len(files)}))


if __name__ == "__main__":
    freeze()
