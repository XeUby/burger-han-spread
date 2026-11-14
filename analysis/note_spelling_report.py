"""Audit the four explicit spelling trials against their frozen protocol and complete ledgers."""

import hashlib
import json
import statistics
import subprocess
from collections import Counter
from pathlib import Path

from frontier_validation import load_world

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "experiments/note-spelling-manifest.json").read_text())
protocol_path = ROOT / manifest["protocol"]
if hashlib.sha256(protocol_path.read_bytes()).hexdigest() != manifest["protocolSha256"]:
    raise ValueError("Protocol changed after trial assignment")
protocol = json.loads(protocol_path.read_text())
plan = json.loads((ROOT / protocol["plan"]).read_text())
trials = {(row["label"], row["seed"]): row for row in plan}
keys = [(row["label"], row["seed"]) for row in manifest["worlds"]]
if len(set(keys)) != len(keys) or set(keys) != set(trials) or len({row["worldId"] for row in manifest["worlds"]}) != len(keys):
    raise ValueError("Each planned trial requires one explicit distinct world")
source = ROOT / "runs/sources" / protocol["revision"]
digest = hashlib.sha256()
for path in sorted(source.glob("*.ts")):
    digest.update(path.name.encode())
    digest.update(path.read_bytes())
if digest.hexdigest() != protocol["revision"]:
    raise ValueError("Frozen source hash mismatch")

records = []
for entry in manifest["worlds"]:
    world = entry["worldId"]
    expected = {"revision": protocol["revision"], "settings": trials[(entry["label"], entry["seed"])]["settings"]}
    meta = json.loads((ROOT / f"runs/{world}.meta.json").read_text())
    if any(meta[key] != entry[key] for key in ["worldId", "seed", "label"]) or any(meta[key] != expected[key] for key in expected):
        raise ValueError(f"Metadata mismatch for {world}")
    row = {**entry, "status": "pending"}
    if all((ROOT / f"runs/{world}.{kind}.json").exists() for kind in ["score", "snapshot", "events", "reveal"]):
        row.update(status="complete", result=load_world(ROOT, world, entry["seed"], expected))
        events = json.loads((ROOT / f"runs/{world}.events.json").read_text())
        snapshot = json.loads((ROOT / f"runs/{world}.snapshot.json").read_text())
        reveal = json.loads((ROOT / f"runs/{world}.reveal.json").read_text())
        ledger = Counter()
        for event in events:
            if event["kind"] == "ledger":
                ledger[event["line"]["kind"]] += event["line"]["cents"]
        row["ledgerCents"] = dict(ledger)
        assert sum(ledger.values()) == row["result"]["marginCents"]
        script = """import fs from 'node:fs'; import {pathToFileURL} from 'node:url';
const {readNote}=await import(pathToFileURL(process.argv[1]+'/notes.ts'));
const {normalizeNote}=await import(pathToFileURL(process.argv[1]+'/note-spelling.ts'));
const rows=JSON.parse(fs.readFileSync(0,'utf8'));
console.log(JSON.stringify(rows.flatMap(({request})=>!readNote(request.note).safe&&readNote(normalizeNote(request.note)).safe?[request.id]:[])));"""
        corrected = set(json.loads(subprocess.run(["node", "--input-type=module", "-e", script, str(source)], input=json.dumps(reveal["requests"]), text=True, capture_output=True, check=True).stdout))
        won = [order for order in snapshot["orders"] if order["id"] in corrected and order["status"] != "cancelled"]
        row["correctedOrders"] = [{"orderId": order["id"], "onTime": all(at is not None and at <= order["deadline"] for at in order["deliveredAt"]), "deadline": order["deadline"], "deliveredAt": order["deliveredAt"]} for order in won]
        row["failedVisits"] = [event for event in events if event["kind"] == "visit_failed"]
        row["correctedOrderFailedVisits"] = [event for event in row["failedVisits"] if event["orderId"] in corrected]
        row["actionErrors"] = json.loads((ROOT / f"runs/{world}.errors.json").read_text())
        row["recoveries"] = json.loads((ROOT / f"runs/{world}.recoveries.json").read_text())
    records.append(row)

summary, pairs = None, []
if all(row["status"] == "complete" for row in records):
    for seed in protocol["screeningSeeds"]:
        a = next(row for row in records if row["seed"] == seed and row["label"] == "note-spelling-control")
        b = next(row for row in records if row["seed"] == seed and row["label"] == "note-spelling-treatment")
        pairs.append({"seed": seed, "gainCents": b["result"]["marginCents"] - a["result"]["marginCents"], "componentDifferencesCents": {key: b["ledgerCents"].get(key, 0) - a["ledgerCents"].get(key, 0) for key in sorted(a["ledgerCents"].keys() | b["ledgerCents"].keys())}})
    treated = [row for row in records if row["label"] == "note-spelling-treatment"]
    summary = {"pairs": len(pairs), "meanGainCents": statistics.mean(pair["gainCents"] for pair in pairs), "minimumGainCents": min(pair["gainCents"] for pair in pairs), "qualifiedTreatments": sum(row["result"]["ranked"] for row in treated), "undeliveredTreatments": sum(row["result"]["undeliveredOrders"] for row in treated), "correctedOrders": sum(len(row["correctedOrders"]) for row in treated), "lateCorrectedOrders": sum(not order["onTime"] for row in treated for order in row["correctedOrders"]), "correctedOrderFailedVisits": sum(len(row["correctedOrderFailedVisits"]) for row in treated)}
    gate = protocol["screeningGate"]
    summary["screeningGatePassed"] = summary["meanGainCents"] > 100 * gate["meanPairedGainEurosGreaterThan"] and summary["minimumGainCents"] >= 100 * gate["worstPairedGainEurosAtLeast"] and summary["qualifiedTreatments"] == len(treated) and summary["undeliveredTreatments"] == 0 and summary["correctedOrderFailedVisits"] == 0
report = {"scope": protocol["scope"], "limitation": "Old development screening, not independent generalization evidence. Includes every declared trial and all ledger costs, including shared gigs.", "protocol": protocol, "manifest": manifest, "summary": summary, "pairs": pairs, "records": records}
(ROOT / "docs/note-spelling-results.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(summary if summary else [{key: row[key] for key in ["worldId", "label", "seed", "status"]} for row in records], indent=2))
