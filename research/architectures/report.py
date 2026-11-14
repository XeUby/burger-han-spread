"""Report every predeclared architecture trial, including failed and pending attempts."""

import hashlib
import json
import statistics
import sys
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "analysis"))
from frontier_validation import load_world

manifest_path = root / "experiments/architectures-manifest.json"
manifest = json.loads(manifest_path.read_text())
protocol_path = root / manifest["protocol"]
assert hashlib.sha256(protocol_path.read_bytes()).hexdigest() == manifest["protocolSha256"]
protocol = json.loads(protocol_path.read_text())
digest = hashlib.sha256()
for file in sorted((root / protocol["bundle"] / "src").glob("*.ts")):
    digest.update(file.name.encode())
    digest.update(file.read_bytes())
assert digest.hexdigest() == protocol["revision"]
plan = json.loads((root / protocol["plan"]).read_text()) + json.loads((root / protocol["controlReplication"]["plan"]).read_text())
trials = {(trial["label"], trial["seed"]): trial for trial in plan}
assert len(trials) == len(manifest["worlds"]) == 13
attempt_path = root / protocol["attempts"]
attempts = [json.loads(line) for line in attempt_path.read_text().splitlines() if line.strip()] if attempt_path.exists() else []
started = {}
for attempt in attempts:
    key = (attempt["label"], attempt["seed"])
    assert key in trials
    if "startedAt" in attempt:
        assert key not in started, "Do not silently replace an attempt"
        started[key] = attempt
    if "completedAt" in attempt:
        assert started[key]["worldId"] == attempt["worldId"]
assert len({item["worldId"] for item in started.values()}) == len(started)

def totals(world):
    events = json.loads((root / f"runs/{world}.events.json").read_text())
    amounts = Counter()
    for event in events:
        if event["kind"] == "ledger":
            amounts[event["line"]["kind"]] += event["line"]["cents"]
    return dict(sorted(amounts.items())), events

records = []
for entry in manifest["worlds"]:
    key = (entry["label"], entry["seed"])
    attempt = started.get(key)
    if attempt:
        assert entry["worldId"] in [None, attempt["worldId"]]
        entry["worldId"] = attempt["worldId"]
    world = entry["worldId"]
    row = {**entry, "status": "pending"}
    errors = [item for item in attempts if (item["label"], item["seed"]) == key and "error" in item]
    if errors:
        row.update(status="interrupted", runnerErrors=errors)
    expected = {"revision": protocol["revision"], "settings": trials[key]["settings"]}
    if world and all((root / f"runs/{world}.{kind}.json").exists() for kind in ["score", "snapshot", "events", "reveal", "errors", "recoveries", "architecture"]):
        assert json.loads((root / f"runs/{world}.meta.json").read_text())["label"] == entry["label"]
        result = load_world(root, world, entry["seed"], expected)
        amounts, events = totals(world)
        assert sum(amounts.values()) == result["marginCents"]
        row.update(status="complete", result=result, ledgerCents=amounts, failedVisits=[event for event in events if event["kind"] == "visit_failed"], actionErrors=json.loads((root / f"runs/{world}.errors.json").read_text()), recoveries=json.loads((root / f"runs/{world}.recoveries.json").read_text()), mechanism=json.loads((root / f"runs/{world}.architecture.json").read_text()))
        row["errorContexts"] = [{"error": error, "sameMinuteGigEvents": [event for event in events if error["action"].get("gigId") and event.get("gigId") == error["action"]["gigId"] and event["at"] == error["at"]]} for error in row["actionErrors"]]
        if entry["label"] != "architecture-control":
            baseline = next(item for item in protocol["baselines"] if item["seed"] == entry["seed"])
            row["baseline"] = load_world(root, baseline["worldId"], entry["seed"], baseline)
            row["baselineLedgerCents"], _ = totals(baseline["worldId"])
            row["gainCents"] = result["marginCents"] - row["baseline"]["marginCents"]
    records.append(row)
manifest["attempts"] = attempts
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
control = next(row for row in records if row["label"] == "architecture-control")
control_match = None
if control["status"] == "complete":
    original = protocol["controlReplication"]["referenceWorldId"]
    a = json.loads((root / f"runs/{original}.events.json").read_text())
    b = json.loads((root / f"runs/{control['worldId']}.events.json").read_text())
    baseline = next(item for item in protocol["baselines"] if item["worldId"] == original)
    control_match = a == b and all(control["result"][key] == baseline[key] for key in ["marginCents", "wonOrders", "onTimeShare"])
terminal = all(row["status"] == "complete" and any(item.get("completedAt") and item.get("worldId") == row["worldId"] for item in attempts) for row in records) and not any("error" in item for item in attempts)
summary = {}
gate = protocol["screeningGate"]
for label in protocol["variants"]:
    rows = [row for row in records if row["label"] == label and row["status"] == "complete"]
    value = {"completed": len(rows), "decision": "pending full four-week comparison"}
    if len(rows) == 4:
        gain = statistics.mean(row["gainCents"] for row in rows)
        throughput = sum(row["result"]["wonOrders"] for row in rows) / sum(row["baseline"]["wonOrders"] for row in rows) - 1
        value.update(meanMarginCents=statistics.mean(row["result"]["marginCents"] for row in rows), meanGainCents=gain, minimumGainCents=min(row["gainCents"] for row in rows), qualified=sum(row["result"]["ranked"] for row in rows), undelivered=sum(row["result"]["undeliveredOrders"] for row in rows), failedVisits=sum(len(row["failedVisits"]) for row in rows), meanOrders=statistics.mean(row["result"]["wonOrders"] for row in rows), relativeThroughputChange=throughput, aggregateOnTimeShare=sum(row["result"]["onTimeOrders"] for row in rows)/sum(row["result"]["wonOrders"] for row in rows), minimumOnTimeShare=min(row["result"]["onTimeShare"] for row in rows), meanDriverFeesCents=-statistics.mean(row["ledgerCents"].get("driver_fee", 0) for row in rows), meanLateRefundsCents=-statistics.mean(row["ledgerCents"].get("late_refund", 0) for row in rows), actionErrors=sum(len(row["actionErrors"]) for row in rows))
        value["gatePassed"] = control_match is True and value["qualified"] == 4 and value["undelivered"] == value["failedVisits"] == 0 and gain >= 100*gate["meanPairedGainEurosAtLeast"] and value["minimumGainCents"] >= 100*gate["worstPairedGainEurosAtLeast"]
        value["decision"] = "eligible for confirmation if selected after all trials" if value["gatePassed"] else "bounded redesign may be justified by throughput, not eligible for validation" if gain >= 0 and throughput >= .25 else "reject this implementation as insufficient; no general rejection of the architecture"
    summary[label] = value
passing = [label for label, value in summary.items() if value.get("gatePassed")]
selected = max(passing, key=lambda label: (summary[label]["meanGainCents"], summary[label]["minimumOnTimeShare"], label)) if terminal and passing else None
report = {"protocol": protocol, "terminal": terminal, "controlMatchesArchivedWeek": control_match, "summary": summary, "selectedForConfirmation": selected, "records": records, "attempts": attempts}
(root / "docs/architectures-results.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"terminal": terminal, "controlMatchesArchivedWeek": control_match, "summary": summary, "selectedForConfirmation": selected}, indent=2))
