"""Audit the frozen note-hours development contrast, retaining every planned trial."""

import hashlib
import json
import statistics
import subprocess
import sys
from pathlib import Path

from frontier_validation import load_world

ROOT = Path(__file__).resolve().parents[1]
confirmation = "--confirmation" in sys.argv
name = "note-hours-confirmation" if confirmation else "note-hours"
study = "7a2ba42d56b09cfd2b52ef157c663831d05cd591fe87d74a707e4db6577f60c0" if confirmation else "fdea9891bc11b3a1669cdf10ca9472b9173c1341e049a244eb107bf963e45f80"
BUNDLE = ROOT / "runs/frozen/91cbeb051868111637bf4a872c630803895c5f7969a70d41212bc3fe04cb6056" / study
REVISION = "f34787f4f6a814a3d16254c970b95acf07382378c5c868a4e834d1bc2e7da642"
protocol = json.loads((ROOT / f"experiments/{name}-protocol.json").read_text())
baselines = {row["seed"]: load_world(ROOT, row["worldId"], row["seed"], row) for row in protocol.get("baselines", [])}
plan = json.loads((BUNDLE / "plan.json").read_text())
if plan != json.loads((ROOT / f"experiments/plans/{name}.json").read_text()):
    raise ValueError("Plan changed after source freeze")
digest = hashlib.sha256()
for path in sorted((BUNDLE / "src").glob("*.ts")):
    digest.update(path.name.encode())
    digest.update(path.read_bytes())
if digest.hexdigest() != REVISION:
    raise ValueError("Frozen source changed")

defaults = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", f'import {{defaults}} from {json.dumps((BUNDLE / "src/policy.ts").as_uri())}; console.log(JSON.stringify(defaults))'], text=True))
requested = {(trial["label"], trial["seed"]): trial for trial in plan}
matches = {}
for path in (ROOT / "runs").glob("*.meta.json"):
    meta = json.loads(path.read_text())
    key = (meta.get("label"), meta.get("seed"))
    if key not in requested:
        continue
    if key in matches:
        raise ValueError(f"Multiple attempts for {key}; retain and inspect them explicitly")
    if meta["revision"] != REVISION or meta["settings"] != {**defaults, **requested[key]["settings"]}:
        raise ValueError(f"Source/settings mismatch for {key}")
    matches[key] = meta

records = []
for key, trial in requested.items():
    meta = matches.get(key)
    row = {"label": key[0], "seed": key[1], "worldId": meta["worldId"] if meta else None, "status": "pending"}
    if meta and all((ROOT / "runs" / f"{meta['worldId']}.{kind}.json").exists() for kind in ["score", "snapshot", "events", "reveal"]):
        world = meta["worldId"]
        row.update(status="complete", result=load_world(ROOT, world, key[1], meta))
        script = f'import fs from "node:fs"; import {{readHours}} from {json.dumps((BUNDLE / "src/hours-note.ts").as_uri())}; const r=JSON.parse(fs.readFileSync({json.dumps(str(ROOT / "runs" / (world + ".reveal.json")))})); console.log(JSON.stringify(r.requests.filter(x=>x.outcome==="won"&&x.request.legs.length===1&&readHours(x.request.note,x.request.arrivedAt)).map(x=>x.request.id)))'
        ids = set(json.loads(subprocess.check_output(["node", "--input-type=module", "-e", script], text=True)))
        events = json.loads((ROOT / "runs" / f"{world}.events.json").read_text())
        orders = json.loads((ROOT / "runs" / f"{world}.snapshot.json").read_text())["orders"]
        row["hoursOrders"] = {
            "wonIncludingCancelled": len(ids),
            "noncancelled": sum(order["id"] in ids and order["status"] != "cancelled" for order in orders),
            "lateOrderIds": sorted(ids.intersection(row["result"]["lateOrderIds"])),
            "undeliveredOrderIds": sorted(ids.intersection(row["result"]["undeliveredOrderIds"])),
            "failedVisits": [event for event in events if event["kind"] == "visit_failed" and event["orderId"] in ids],
            "changedOrders": sorted({event["order"]["id"] for event in events if event["kind"] == "order_changed" and event["order"]["id"] in ids}),
        }
        row["actionErrors"] = json.loads((ROOT / "runs" / f"{world}.errors.json").read_text())
        if confirmation:
            row["baseline"] = baselines[key[1]]
            row["differenceCents"] = row["result"]["marginCents"] - row["baseline"]["marginCents"]
    records.append(row)

summary = None
if all(row["status"] == "complete" for row in records):
    differences = []
    for seed in dict.fromkeys(trial["seed"] for trial in plan):
        if confirmation:
            differences.append(next(row["differenceCents"] for row in records if row["seed"] == seed))
        else:
            control = next(row for row in records if row["seed"] == seed and row["label"] == "hours-control")
            treatment = next(row for row in records if row["seed"] == seed and row["label"] == "hours-treatment")
            differences.append(treatment["result"]["marginCents"] - control["result"]["marginCents"])
    treated = records if confirmation else [row for row in records if row["label"] == "hours-treatment"]
    summary = {"pairs": len(differences), "pairedGainsCents": differences, "meanGainCents": statistics.mean(differences), "positivePairs": sum(value > 0 for value in differences), "qualifiedTreatments": sum(row["result"]["ranked"] for row in treated), "hoursFailedVisits": sum(len(row["hoursOrders"]["failedVisits"]) for row in treated), "hoursUndelivered": sum(len(row["hoursOrders"]["undeliveredOrderIds"]) for row in treated)}
report = {"scope": "Previously inspected development weeks; not fresh validation. No partial-panel mean or per-order profit inference. Shared fees are included in reconciled whole-week scores.", "revision": REVISION, "protocol": protocol, "summary": summary, "records": records}
output = "note-hours-confirmation" if confirmation else "note-hours-results"
(ROOT / f"docs/{output}.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(summary if summary else [{key: row[key] for key in ["seed", "label", "worldId", "status"]} for row in records], indent=2))
