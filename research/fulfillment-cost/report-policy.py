"""Report four matched development weeks without treating them as fresh validation."""

import hashlib
import json
import statistics
import sys
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "analysis"))
from frontier_validation import load_world

label = sys.argv[1] if len(sys.argv) > 1 else "cost-calibration"
assert label in ["cost-calibration", "cost-premium"]
path = root / f"experiments/{label}-manifest.json"
manifest = json.loads(path.read_text())
raw = (root / manifest["protocol"]).read_bytes()
assert hashlib.sha256(raw).hexdigest() == manifest["protocolSha256"]
protocol = json.loads(raw)
h = hashlib.sha256()
for file in sorted((root / protocol["bundle"] / "src").glob("*.ts")):
    h.update(file.name.encode()); h.update(file.read_bytes())
assert h.hexdigest() == protocol["revision"]
assert hashlib.sha256((root / "experiments/fulfillment-cost-model.json").read_bytes()).hexdigest() == protocol["modelSha256"]
attempts = [json.loads(line) for line in (root / protocol["attempts"]).read_text().splitlines()]
plan = json.loads((root / protocol["plan"]).read_text())
assert len(plan) == len(manifest["worlds"]) == len({row["seed"] for row in plan}) == 4
started = {}
for attempt in attempts:
    assert any(row["seed"] == attempt["seed"] and row["label"] == attempt["label"] for row in plan)
    if "startedAt" in attempt:
        assert attempt["seed"] not in started
        started[attempt["seed"]] = attempt
    if "completedAt" in attempt:
        assert started[attempt["seed"]]["worldId"] == attempt["worldId"]

def ledger(world):
    events = json.loads((root / f"runs/{world}.events.json").read_text())
    result = Counter()
    for event in events:
        if event["kind"] == "ledger": result[event["line"]["kind"]] += event["line"]["cents"]
    return dict(sorted(result.items())), events

records = []
for entry in manifest["worlds"]:
    if entry["seed"] in started:
        assert entry["worldId"] in [None, started[entry["seed"]]["worldId"]]
        entry["worldId"] = started[entry["seed"]]["worldId"]
    world = entry["worldId"]
    row = {**entry, "status": "pending"}
    errors = [item for item in attempts if item["seed"] == entry["seed"] and "error" in item]
    if errors: row.update(status="interrupted", runnerErrors=errors)
    if world and all((root / f"runs/{world}.{kind}.json").exists() for kind in ["score", "snapshot", "events", "reveal", "errors", "recoveries"]):
        result = load_world(root, world, entry["seed"], protocol)
        baseline = next(item for item in protocol["baselines"] if item["seed"] == entry["seed"])
        control = load_world(root, baseline["worldId"], entry["seed"], baseline)
        amounts, events = ledger(world)
        before, _ = ledger(baseline["worldId"])
        assert sum(amounts.values()) == result["marginCents"]
        row.update(status="complete", result=result, baseline=control, ledgerCents=amounts, baselineLedgerCents=before, gainCents=result["marginCents"]-control["marginCents"], failedVisits=[event for event in events if event["kind"] == "visit_failed"], actionErrors=json.loads((root / f"runs/{world}.errors.json").read_text()), recoveries=json.loads((root / f"runs/{world}.recoveries.json").read_text()))
        row["errorContexts"] = [{"error": error, "sameMinuteGigEvents": [event for event in events if error["action"].get("gigId") and event.get("gigId") == error["action"]["gigId"] and event["at"] == error["at"]]} for error in row["actionErrors"]]
    records.append(row)
manifest["attempts"] = attempts
path.write_text(json.dumps(manifest, indent=2)+"\n")
terminal = all(row["status"] == "complete" and any(attempt.get("completedAt") and attempt.get("worldId") == row["worldId"] for attempt in attempts) for row in records) and not any("error" in attempt for attempt in attempts)
summary = {"terminal": terminal, "completed": sum(row["status"] == "complete" for row in records), "decision": "pending full frozen development comparison", "promotionAllowed": False}
if terminal:
    summary.update(meanMarginCents=statistics.mean(row["result"]["marginCents"] for row in records), meanGainCents=statistics.mean(row["gainCents"] for row in records), minimumGainCents=min(row["gainCents"] for row in records), qualified=sum(row["result"]["ranked"] for row in records), meanOrders=statistics.mean(row["result"]["wonOrders"] for row in records), aggregateOnTimeShare=sum(row["result"]["onTimeOrders"] for row in records)/sum(row["result"]["wonOrders"] for row in records), minimumOnTimeShare=min(row["result"]["onTimeShare"] for row in records), undelivered=sum(row["result"]["undeliveredOrders"] for row in records), failedVisits=sum(len(row["failedVisits"]) for row in records), meanDriverFeesCents=-statistics.mean(row["ledgerCents"].get("driver_fee",0) for row in records), meanLateRefundsCents=-statistics.mean(row["ledgerCents"].get("late_refund",0) for row in records), actionErrors=sum(len(row["actionErrors"]) for row in records), recoveries=sum(len(row["recoveries"]) for row in records))
    summary["baseline"] = {"meanMarginCents": statistics.mean(row["baseline"]["marginCents"] for row in records), "meanOrders": statistics.mean(row["baseline"]["wonOrders"] for row in records), "aggregateOnTimeShare": sum(row["baseline"]["onTimeOrders"] for row in records)/sum(row["baseline"]["wonOrders"] for row in records), "qualified": sum(row["baseline"]["ranked"] for row in records), "meanDriverFeesCents": -statistics.mean(row["baselineLedgerCents"].get("driver_fee",0) for row in records), "meanLateRefundsCents": -statistics.mean(row["baselineLedgerCents"].get("late_refund",0) for row in records)}
    kinds = sorted({kind for row in records for field in ["ledgerCents", "baselineLedgerCents"] for kind in row[field]})
    summary["meanLedgerGainCents"] = {kind: statistics.mean(row["ledgerCents"].get(kind,0)-row["baselineLedgerCents"].get(kind,0) for row in records) for kind in kinds}
    assert abs(sum(summary["meanLedgerGainCents"].values())-summary["meanGainCents"]) < 1e-6
    gate = protocol["gate"]
    passed = summary["meanGainCents"] >= 100*gate["meanPairedGainEurosAtLeast"] and summary["minimumGainCents"] >= 100*gate["worstPairedGainEurosAtLeast"] and summary["qualified"] == 4 and summary["undelivered"] == summary["failedVisits"] == 0
    summary["eligibleForFreshValidation"] = passed
    summary["decision"] = "May reserve a wholly fresh validation panel under search-integrity rules; no promotion yet" if passed else "Reject this cost-ratio policy for promotion; retain every development outcome"
report = {"protocol": protocol, "summary": summary, "records": records, "attempts": attempts, "evidenceUnit": "Four unique development weeks, each with a matched control and candidate. Eight worlds do not constitute eight independent weeks. All four seeds were used to assess cost models and are unavailable for future untouched validation."}
(root / f"docs/{label}-results.json").write_text(json.dumps(report, indent=2)+"\n")
print(json.dumps(summary, indent=2))
