"""Check corrected-note truth and operational errors in an explicit paired manifest."""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

from frontier_validation import load_world, validate_manifest

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--manifest", default="experiments/note-spelling-validation-manifest.json")
parser.add_argument("--output", default="docs/note-spelling-validation-audit.json")
args = parser.parse_args()
manifest = json.loads((ROOT / args.manifest).read_text())
validate_manifest(manifest)
candidate = manifest["candidate"]
source = ROOT / candidate["bundle"] / "src"
digest = hashlib.sha256()
for path in sorted(source.glob("*.ts")):
    digest.update(path.name.encode())
    digest.update(path.read_bytes())
if digest.hexdigest() != candidate["revision"]:
    raise ValueError("Candidate parser source does not match the frozen revision")


def hours_at(hours, day):
    if hours is None:
        return (0, 1440)
    if day == 5:
        saturday = hours.get("saturday")
        return (saturday["opens"], saturday["closes"]) if saturday else None
    return (hours["opens"], hours["closes"]) if day in hours["weekdays"] else None


records = []
for pair in manifest["pairs"]:
    row = {"seed": pair["seed"]}
    for side in ["baseline", "candidate"]:
        world = pair[f"{side}WorldId"]
        result = load_world(ROOT, world, pair["seed"], manifest[side])
        row[side] = {"worldId": world, "result": result, "actionErrors": json.loads((ROOT / f"runs/{world}.errors.json").read_text()), "recoveries": json.loads((ROOT / f"runs/{world}.recoveries.json").read_text())}
    world = pair["candidateWorldId"]
    events = json.loads((ROOT / f"runs/{world}.events.json").read_text())
    snapshot = json.loads((ROOT / f"runs/{world}.snapshot.json").read_text())
    reveal = json.loads((ROOT / f"runs/{world}.reveal.json").read_text())
    script = """import fs from 'node:fs'; import {pathToFileURL} from 'node:url';
const {readNote}=await import(pathToFileURL(process.argv[1]+'/notes.ts'));
const {normalizeNote}=await import(pathToFileURL(process.argv[1]+'/note-spelling.ts'));
console.log(JSON.stringify(JSON.parse(fs.readFileSync(0,'utf8')).flatMap(({request})=>{
const normalized=normalizeNote(request.note), parsed=readNote(normalized);
return !readNote(request.note).safe&&parsed.safe?[{request,normalized,parsed}]:[];
})));"""
    annotated = json.loads(subprocess.run(["node", "--input-type=module", "-e", script, str(source)], input=json.dumps(reveal["requests"]), text=True, capture_output=True, check=True).stdout)
    notes = {item["request"]["id"]: item for item in annotated}
    truth = {item["orderId"]: item for item in reveal["orders"]}
    changed = {event["order"]["id"] for event in events if event["kind"] == "order_changed"}
    cases = []
    for order in snapshot["orders"]:
        identity = order["id"]
        if identity not in notes or order["status"] == "cancelled":
            continue
        item = notes[identity]
        if len(item["request"]["legs"]) != 1 or len(truth[identity]["legs"]) != 1:
            raise ValueError("Corrected-note audit expects the evaluated single-car policy")
        public = item["request"]["legs"][0]
        actual = truth[identity]["legs"][0]
        parsed = item["parsed"]
        problems = []
        if actual["readyAt"] > public["pickup"]["window"]["from"]:
            problems.append("unmodeled readiness")
        if actual["releasedAt"] is not None and actual["releasedAt"] > public["pickup"]["window"]["from"]:
            problems.append("unmodeled payment release")
        if actual["manualGearbox"] and not parsed["manual"]:
            problems.append("unmodeled manual gearbox")
        if actual["needsPlates"] and not parsed["plates"]:
            problems.append("unmodeled plates")
        if actual["summerTyres"]:
            problems.append("unmodeled summer tyres")
        if actual["noteDeadline"] is not None:
            problems.append("unmodeled deadline")
        for stop in ["pickup", "delivery"]:
            for day in range(7):
                allowed = hours_at(public[stop]["hours"], day)
                real = hours_at(actual[f"{stop}Hours"], day)
                if allowed and (not real or allowed[0] < real[0] or allowed[1] > real[1]):
                    problems.append(f"unmodeled {stop} hours on day{day}")
        cases.append({"orderId": identity, "original": item["request"]["note"], "normalized": item["normalized"], "parsed": parsed, "publicLeg": public, "truth": actual, "changed": identity in changed, "problems": problems, "onTime": all(at is not None and at <= order["deadline"] for at in order["deliveredAt"])})
    row["correctedOrders"] = cases
    row["correctedOrderFailedVisits"] = [event for event in events if event["kind"] == "visit_failed" and event["orderId"] in notes]
    records.append(row)

cases = [case for row in records for case in row["correctedOrders"]]
summary = {"pairs": len(records), "correctedOrders": len(cases), "lateCorrectedOrders": sum(not case["onTime"] for case in cases), "changedCorrectedOrders": sum(case["changed"] for case in cases), "changedWithPublicRequestDifferences": sum(case["changed"] and bool(case["problems"]) for case in cases), "unchangedWithUnmodeledRestrictions": sum(bool(case["problems"]) and not case["changed"] for case in cases), "correctedOrderFailedVisits": sum(len(row["correctedOrderFailedVisits"]) for row in records), "candidateActionErrors": sum(len(row["candidate"]["actionErrors"]) for row in records), "baselineActionErrors": sum(len(row["baseline"]["actionErrors"]) for row in records)}
report = {"scope": manifest.get("unseenDeclaration"), "manifest": args.manifest, "method": "Use the exact frozen candidate parser to identify corrected-note wins. Compare revealed restrictions with the original public request and parsed equipment. Audit complete ledgers and scores in both arms. Keep changed-order cases visible but separate, since their revealed route may differ from the original request.", "summary": summary, "records": records}
(ROOT / args.output).write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(summary, indent=2))
