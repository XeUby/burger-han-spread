"""Freeze the first bounded live portfolio study without starting a world."""

import hashlib
import io
import json
import shutil
import subprocess
import tarfile
from datetime import datetime,timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
NAME="portfolio-development-v1"
bundle=ROOT/f"runs/frozen/{NAME}"
path=ROOT/f"experiments/{NAME}.json"
if path.exists() or bundle.exists():
    raise RuntimeError("Do not overwrite a frozen study or its sources")
shutil.copytree(ROOT/"src",bundle/"src")
shutil.copytree(ROOT/"vendor",bundle/"vendor")
(bundle/"src/policy.ts").rename(bundle/"src/control.ts")
def translated(source):
    return (ROOT/source).read_text().replace('"../../src/','"./').replace('"../../vendor/','"../vendor/').replace('"../../experiments/booking-response-prior.json"','"./booking-prior.json"').replace('"../../experiments/portfolio-prior.json"','"./portfolio-prior.json"').replace('"../value/policy.ts"','"./mechanisms.ts"')
(bundle/"src/mechanisms.ts").write_text(translated("research/value/policy.ts").replace('"./policy.ts"','"./control.ts"'))
for name in ["policy.ts","models.ts","bridge.ts","solver.py"]:
    (bundle/f"src/{name}").write_text(translated(f"research/portfolio/{name}"))
shutil.copyfile(ROOT/"experiments/booking-response-prior.json",bundle/"src/booking-prior.json")
shutil.copyfile(ROOT/"experiments/portfolio-prior.json",bundle/"src/portfolio-prior.json")
shutil.copyfile(ROOT/"research/portfolio/requirements.lock.txt",bundle/"requirements.lock.txt")
config=json.loads((ROOT/"tsconfig.json").read_text())
config["compilerOptions"]["resolveJsonModule"]=True
config["include"]=["src/**/*.ts"]
(bundle/"tsconfig.json").write_text(json.dumps(config,indent=2)+"\n")
runner=(bundle/"src/run.ts").read_text()
runner=runner.replace('  try {\n    while (desk.now < snapshot.endsAt)', '''  const wallStarted=Date.now()
  let journaled=0
  const journal=async()=>{
    const rows=desk.telemetry.slice(journaled)
    if(rows.length) await appendFile(`runs/${world.id}.decisions.jsonl`,rows.map(row=>JSON.stringify(row)).join("\\n")+"\\n")
    journaled=desk.telemetry.length
  }
  try {
    while (desk.now < snapshot.endsAt)''')
runner=runner.replace('        await desk.tick()', '        if(Date.now()-wallStarted>600_000) throw new Error("Portfolio world exceeded its frozen ten-minute wall-time budget")\n        await desk.tick()\n        await journal()',1)
runner=runner.replace('        if (Math.floor(desk.now / 1440) > day) report','        await journal()\n        if (Math.floor(desk.now / 1440) > day) report',1)
runner=runner.replace('        if (!(error instanceof Unreachable)) throw error','        if (!(error instanceof Unreachable) || desk.settings.portfolio) throw error',1)
runner=runner.replace('  } finally {\n    await writeFile(`runs/${world.id}.events.json`','  } finally {\n    desk.closeSolver()\n    await writeFile(`runs/${world.id}.decisions.json`,JSON.stringify(desk.telemetry))\n    await writeFile(`runs/${world.id}.events.json`',1)
runner=runner.replace('desk.market = previous.market','desk.market = previous.market\n  desk.telemetry.unshift(...previous.telemetry)',1)
(bundle/"src/run.ts").write_text(runner)
files={str(p.relative_to(bundle)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(bundle.rglob("*")) if p.is_file()}
config=json.loads((ROOT/"experiments/final-config.json").read_text())
base={**config,"firstOptionOnly":True,"openingCostAdmission":True,"actionGuard":True}
arms={"benchmark":base,"planner":{**base,"portfolio":True},"future":{**base,"portfolio":True,"futureValue":True},"payments":{**base,"portfolio":True,"futureValue":True,"paymentChoice":True}}
seeds=[f"formal-unseen-20261113-{i:02d}" for i in [9,10,14,15]]
protocol="experiments/portfolio-v1-protocol.json"
python="runs/portfolio-venv/bin/python"
versions=json.loads(subprocess.check_output([str(ROOT/python),"-c","import importlib.metadata,json; print(json.dumps({d.metadata['Name'].lower():d.version for d in importlib.metadata.distributions()}))"],text=True))
plan={"frozenAt":datetime.now(timezone.utc).isoformat(),"role":"development only; four familiar seed blocks","bundle":str(bundle.relative_to(ROOT)),"files":files,"jobs":2,"maximumUnfinishedTeamWorlds":4,"trials":[{"label":f"portfolio-v1-{arm}","seed":seed,"level":8,"settings":settings} for seed in seeds for arm,settings in arms.items()],"attempts":f"experiments/{NAME}-attempts.jsonl","report":f"docs/{NAME}-runs.json","protocol":protocol,"protocolSha256":hashlib.sha256((ROOT/protocol).read_bytes()).hexdigest(),"launcherSha256":hashlib.sha256((ROOT/"research/value/run.ts").read_bytes()).hexdigest(),"portfolioLauncherSha256":hashlib.sha256((ROOT/"research/portfolio/run.ts").read_bytes()).hexdigest(),"pythonExecutable":python,"pythonVersions":versions}
path.write_text(json.dumps(plan,indent=2)+"\n")
with tarfile.open(ROOT/f"experiments/{NAME}-source.tar.gz","w:gz") as archive:
    for name in files:
        data=(bundle/name).read_bytes();member=tarfile.TarInfo(name);member.size=len(data);member.mtime=0
        archive.addfile(member,io.BytesIO(data))
print(json.dumps({"plan":str(path),"worlds":len(plan["trials"]),"files":len(files)}))
