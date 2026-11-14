"""Retain every viewed-fee trial and test the frozen continuation rule."""

import hashlib
import json
import statistics
import sys
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "analysis"))
from frontier_validation import load_world

manifest_path = root / "experiments/viewed-fee-manifest.json"
manifest = json.loads(manifest_path.read_text())
raw = (root / manifest["protocol"]).read_bytes()
assert hashlib.sha256(raw).hexdigest() == manifest["protocolSha256"]
protocol = json.loads(raw)
digest = hashlib.sha256()
for file in sorted((root / protocol["bundle"] / "src").glob("*.ts")):
    digest.update(file.name.encode())
    digest.update(file.read_bytes())
assert digest.hexdigest() == protocol["revision"]
plan = {(row["label"], row["seed"]): row for row in json.loads((root / protocol["plan"]).read_text())}
attempts = [json.loads(line) for line in (root / protocol["attempts"]).read_text().splitlines() if line.strip()]
started = {}
for attempt in attempts:
    key = (attempt["label"], attempt["seed"])
    assert key in plan
    if "startedAt" in attempt:
        assert key not in started, "No silent replacement of attempts"
        started[key] = attempt
    if "completedAt" in attempt:
        assert started[key]["worldId"] == attempt["worldId"]

def events(world):
    return json.loads((root / f"runs/{world}.events.json").read_text())

def ledger(history):
    total = Counter()
    for event in history:
        if event["kind"] == "ledger":
            total[event["line"]["kind"]] += event["line"]["cents"]
    return dict(sorted(total.items()))

records = []
for entry in manifest["worlds"]:
    key = (entry["label"], entry["seed"])
    if key in started:
        assert entry["worldId"] in [None, started[key]["worldId"]]
        entry["worldId"] = started[key]["worldId"]
    world = entry["worldId"]
    row = {**entry, "status": "pending"}
    errors = [item for item in attempts if (item["label"], item["seed"]) == key and "error" in item]
    if errors:
        row.update(status="interrupted", runnerErrors=errors)
    if world and all((root / f"runs/{world}.{kind}.json").exists() for kind in ["score", "snapshot", "events", "reveal", "errors", "recoveries", "viewed-fee"]):
        result = load_world(root, world, entry["seed"], {"settings": plan[key]["settings"], "revision": protocol["revision"]})
        history = events(world)
        amounts = ledger(history)
        assert sum(amounts.values()) == result["marginCents"]
        exposure = json.loads((root / f"runs/{world}.viewed-fee.json").read_text())
        assert exposure["reservedCents"] <= 60_000
        early = [item for item in exposure["exposures"] if item.get("bookedAt", float("inf")) <= item["until"] and "restoredAt" not in item]
        metrics = {"exposures": len(exposure["exposures"]), "reservedCents": exposure["reservedCents"], "viewsDuringExposure": sum(item["views"] for item in exposure["exposures"]), "earlyPremiumBookings": len(early), "earlyPremiumCents": sum(item["extraCents"] for item in early), "restored": sum("restoredAt" in item for item in exposure["exposures"]), "firstBookingsBelowExposedFee": sum(item.get("bookedFeeCents", float("inf")) < item["feeCents"] for item in exposure["exposures"])}
        assert metrics["earlyPremiumCents"] <= exposure["reservedCents"]
        row.update(status="complete", result=result, ledgerCents=amounts, exposure=exposure, metrics=metrics, failedVisits=[event for event in history if event["kind"] == "visit_failed"], actionErrors=json.loads((root / f"runs/{world}.errors.json").read_text()), recoveries=json.loads((root / f"runs/{world}.recoveries.json").read_text()))
        row["errorContexts"] = [{"error": error, "sameMinuteGigEvents": [event for event in history if error["action"].get("gigId") and event.get("gigId") == error["action"]["gigId"] and event["at"] == error["at"]]} for error in row["actionErrors"]]
        baseline = next(item for item in protocol["baselines"] if item["seed"] == entry["seed"])
        row["baseline"] = load_world(root, baseline["worldId"], entry["seed"], baseline)
        row["baselineLedgerCents"] = ledger(events(baseline["worldId"]))
        row["gainCents"] = result["marginCents"] - row["baseline"]["marginCents"]
        if entry["label"] == "viewed-fee-control":
            row["exactControlEventMatch"] = history == events(baseline["worldId"])
    records.append(row)
manifest["attempts"] = attempts
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
terminal = all(row["status"] == "complete" and any(item.get("completedAt") and item.get("worldId") == row["worldId"] for item in attempts) for row in records) and not any("error" in item for item in attempts)
control = next(row for row in records if row["label"] == "viewed-fee-control")
summary = {"terminal": terminal, "controlExactMatch": control.get("exactControlEventMatch"), "decision": "pending complete frozen panel"}
rows = [row for row in records if row["label"] == "viewed-fee-pulse" and row["status"] == "complete"]
if terminal:
    assert len(rows) == 2
    kinds = sorted({kind for row in rows for field in ["ledgerCents", "baselineLedgerCents"] for kind in row[field]})
    summary.update(meanMarginCents=statistics.mean(row["result"]["marginCents"] for row in rows), meanGainCents=statistics.mean(row["gainCents"] for row in rows), minimumGainCents=min(row["gainCents"] for row in rows), qualified=sum(row["result"]["ranked"] for row in rows), orders=sum(row["result"]["wonOrders"] for row in rows), aggregateOnTimeShare=sum(row["result"]["onTimeOrders"] for row in rows)/sum(row["result"]["wonOrders"] for row in rows), undelivered=sum(row["result"]["undeliveredOrders"] for row in rows), failedVisits=sum(len(row["failedVisits"]) for row in rows), meanLedgerGainCents={kind: statistics.mean(row["ledgerCents"].get(kind, 0) - row["baselineLedgerCents"].get(kind, 0) for row in rows) for kind in kinds})
    assert abs(sum(summary["meanLedgerGainCents"].values()) - summary["meanGainCents"]) < 1e-6
    gate = protocol["screeningGate"]
    passed = summary["controlExactMatch"] is True and summary["meanGainCents"] >= 100*gate["meanGainEurosAtLeast"] and summary["minimumGainCents"] >= 100*gate["minimumGainEurosAtLeast"] and summary["qualified"] == gate["qualified"] and summary["undelivered"] == summary["failedVisits"] == 0
    summary["gatePassed"] = passed
    summary["decision"] = "Proceed unchanged to old-seed confirmation" if passed else "Reject this pulse implementation; no parameter rescue or fresh validation"
report = {"protocol": protocol, "summary": summary, "records": records, "attempts": attempts, "interpretation": "Exposure counts and lower subsequent fees do not reveal hidden beliefs or establish that every viewer was eligible. Early premiums compare actual initial bookings with that same gig's intended opening fee, not a counterfactual world. Whole-week matched net profit is the economic test."}
(root / "docs/viewed-fee-results.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"summary": summary, "completed": [{"label": row["label"], "seed": row["seed"], "gainCents": row["gainCents"], "metrics": row["metrics"]} for row in records if row["status"] == "complete"]}, indent=2))
