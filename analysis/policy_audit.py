"""Audit operational outcomes for every attempt in an explicit paired evaluation."""

import argparse
import json
from collections import Counter
from pathlib import Path

from frontier_validation import load_world, validate_manifest

parser = argparse.ArgumentParser()
parser.add_argument("--manifest", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / args.manifest).read_text())
validate_manifest({**manifest, "pairs": [pair for pair in manifest["pairs"] if pair["baselineWorldId"] and pair["candidateWorldId"]]})
assigned = [pair[f"{side}WorldId"] for pair in manifest["pairs"] for side in ["baseline", "candidate"] if pair[f"{side}WorldId"]]
assert len(assigned) == len(set(assigned))
assert sorted(assigned) == sorted(attempt["worldId"] for attempt in manifest["attempts"])
records = []
for pair in manifest["pairs"]:
    for side in ["baseline", "candidate"]:
        world = pair[f"{side}WorldId"]
        row = {"seed": pair["seed"], "side": side, "worldId": world, "status": "pending"}
        if world and all((root / f"runs/{world}.{kind}.json").exists() for kind in ["score", "snapshot", "events", "reveal"]):
            result = load_world(root, world, pair["seed"], manifest[side])
            events = json.loads((root / f"runs/{world}.events.json").read_text())
            errors = json.loads((root / f"runs/{world}.errors.json").read_text())
            counts = dict(Counter(event["kind"] for event in events))
            row.update(status="complete", marginCents=result["marginCents"], qualified=result["ranked"], onTimeShare=result["onTimeShare"], undeliveredOrders=result["undeliveredOrders"], eventCounts=counts, failedVisits=[event for event in events if event["kind"] == "visit_failed"], actionErrors=errors, recoveries=json.loads((root / f"runs/{world}.recoveries.json").read_text()))
            row["actionErrorContexts"] = [
                {"error": error, "sameMinuteGigEvents": [
                    event for event in events
                    if error["action"].get("gigId") is not None
                    and event.get("gigId") == error["action"]["gigId"]
                    and event["at"] == error["at"]
                ]}
                for error in errors
            ]
        records.append(row)
terminal = all(row["status"] == "complete" for row in records)
summary = {side: {"completed": sum(row["status"] == "complete" for row in records if row["side"] == side), "failedVisits": sum(len(row.get("failedVisits", [])) for row in records if row["side"] == side), "actionErrors": sum(len(row.get("actionErrors", [])) for row in records if row["side"] == side), "recoveries": sum(len(row.get("recoveries", [])) for row in records if row["side"] == side)} for side in ["baseline", "candidate"]}
report = {"manifest": args.manifest, "terminal": terminal, "attempts": manifest["attempts"], "runnerErrors": manifest.get("runnerErrors", []), "summary": summary, "records": records}
(root / args.output).write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"terminal": terminal, "summary": summary}, indent=2))
