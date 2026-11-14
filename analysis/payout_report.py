"""Evaluate the fixed payout-only variants against explicit archived controls."""

import hashlib
import json
import statistics
import sys
from collections import Counter
from pathlib import Path

from frontier_validation import load_world

ROOT = Path(__file__).resolve().parents[1]
confirmation = "--confirmation" in sys.argv
name = "payout-confirmation" if confirmation else "payout"
manifest = json.loads((ROOT / f"experiments/{name}-manifest.json").read_text())
path = ROOT / manifest["protocol"]
assert hashlib.sha256(path.read_bytes()).hexdigest() == manifest["protocolSha256"]
protocol = json.loads(path.read_text())
if confirmation:
    assert hashlib.sha256((ROOT / protocol["parentProtocol"]).read_bytes()).hexdigest() == protocol["parentProtocolSha256"]
plan = json.loads((ROOT / protocol["plan"]).read_text())
trials = {(trial["label"], trial["seed"]): trial for trial in plan}
assert len(trials) == len(plan) == len(manifest["worlds"])
assert {(row["label"], row["seed"]) for row in manifest["worlds"]} == set(trials)
worlds = [row["worldId"] for row in manifest["worlds"] if row["worldId"]]
assert len(set(worlds)) == len(worlds)
digest = hashlib.sha256()
for file in sorted((ROOT / protocol["bundle"] / "src").glob("*.ts")):
    digest.update(file.name.encode())
    digest.update(file.read_bytes())
assert digest.hexdigest() == protocol["revision"]


def ledger(world):
    events = json.loads((ROOT / f"runs/{world}.events.json").read_text())
    totals = Counter()
    for event in events:
        if event["kind"] == "ledger":
            totals[event["line"]["kind"]] += event["line"]["cents"]
    return dict(totals), events


records = []
for entry in manifest["worlds"]:
    world = entry["worldId"]
    row = {**entry, "status": "pending"}
    if world:
        expected = {"revision": protocol["revision"], "settings": trials[(entry["label"], entry["seed"])]["settings"]}
        meta = json.loads((ROOT / f"runs/{world}.meta.json").read_text())
        assert all(meta[key] == value for key, value in {**entry, **expected}.items())
        if all((ROOT / f"runs/{world}.{kind}.json").exists() for kind in ["score", "snapshot", "events", "reveal"]):
            baseline = next(item for item in protocol["baselines"] if item["seed"] == entry["seed"])
            row.update(status="complete", result=load_world(ROOT, world, entry["seed"], expected), baseline=load_world(ROOT, baseline["worldId"], entry["seed"], baseline))
            row["ledgerCents"], events = ledger(world)
            row["baselineLedgerCents"], _ = ledger(baseline["worldId"])
            assert sum(row["ledgerCents"].values()) == row["result"]["marginCents"]
            assert sum(row["baselineLedgerCents"].values()) == row["baseline"]["marginCents"]
            row["gainCents"] = row["result"]["marginCents"] - row["baseline"]["marginCents"]
            row["componentDifferencesCents"] = {key: row["ledgerCents"].get(key, 0) - row["baselineLedgerCents"].get(key, 0) for key in row["ledgerCents"].keys() | row["baselineLedgerCents"].keys()}
            row["failedVisits"] = [event for event in events if event["kind"] == "visit_failed"]
            row["eventCounts"] = dict(Counter(event["kind"] for event in events))
            row["actionErrors"] = json.loads((ROOT / f"runs/{world}.errors.json").read_text())
            row["recoveries"] = json.loads((ROOT / f"runs/{world}.recoveries.json").read_text())
            row["errorContexts"] = [
                {"error": error, "sameMinuteGigEvents": [event for event in events if error["action"].get("gigId") is not None and event["at"] == error["at"] and event.get("gigId") == error["action"].get("gigId") and event["kind"] != "gig_viewed"]}
                for error in row["actionErrors"]
            ]
    records.append(row)

terminal = all(row["status"] == "complete" for row in records)
summary = {}
selected = None
if terminal:
    gate = protocol["confirmationGate" if confirmation else "screeningGate"]
    for label in protocol["variants"]:
        rows = [row for row in records if row["label"] == label]
        result = {"weeks": len(rows), "meanGainCents": statistics.mean(row["gainCents"] for row in rows), "minimumGainCents": min(row["gainCents"] for row in rows), "qualified": sum(row["result"]["ranked"] for row in rows), "undelivered": sum(row["result"]["undeliveredOrders"] for row in rows), "failedVisits": sum(len(row["failedVisits"]) for row in rows)}
        result["gatePassed"] = result["meanGainCents"] > 100 * gate["meanPairedGainEurosGreaterThan"] and result["minimumGainCents"] >= 100 * gate["worstPairedGainEurosAtLeast"] and result["qualified"] == len(rows) and result["undelivered"] == result["failedVisits"] == 0
        summary[label] = result
    passing = [label for label in summary if summary[label]["gatePassed"]]
    if passing and not confirmation:
        selected = max(passing, key=lambda label: (summary[label]["meanGainCents"], label == "payout-opening"))
report = {"protocol": protocol, "manifest": manifest, "terminal": terminal, "summary": summary, "selectedForConfirmation": selected, "records": records, "limitation": "Old development streams. Payout changes can alter later admissions through capacity, trust and demand learning, even though the pricing formulas remain unchanged. This is not independent validation."}
if confirmation:
    report["eligibleForIndependentEvaluation"] = terminal and all(row["gatePassed"] for row in summary.values())
(ROOT / f"docs/{name}-results.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"terminal": terminal, "summary": summary, "selectedForConfirmation": selected, "trials": [{key: row[key] for key in ["label", "seed", "worldId", "status"]} for row in records]}, indent=2))
