"""Compare explicit full-week relisting trials, including all fees and refunds."""

import hashlib
import json
import statistics
import sys
from collections import Counter
from pathlib import Path

from frontier_validation import load_world

ROOT = Path(__file__).resolve().parents[1]
confirmation = "--confirmation" in sys.argv
name = "relisting-confirmation" if confirmation else "relisting-policy"
manifest = json.loads((ROOT / f"experiments/{name}-manifest.json").read_text())
protocol_path = ROOT / manifest["protocol"]
assert hashlib.sha256(protocol_path.read_bytes()).hexdigest() == manifest["protocolSha256"]
protocol = json.loads(protocol_path.read_text())
if confirmation:
    assert hashlib.sha256((ROOT / protocol["parentProtocol"]).read_bytes()).hexdigest() == protocol["parentProtocolSha256"]
plan = json.loads((ROOT / protocol["plan" if confirmation else "screeningPlan"]).read_text())
trials = {(trial["label"], trial["seed"]): trial for trial in plan}
assert len(trials) == len(plan) == len(manifest["worlds"])
assert {(row["label"], row["seed"]) for row in manifest["worlds"]} == set(trials)
assert len({row["worldId"] for row in manifest["worlds"]}) == len(trials)
digest = hashlib.sha256()
for file in sorted((ROOT / protocol["bundle"] / "src").glob("*.ts")):
    digest.update(file.name.encode())
    digest.update(file.read_bytes())
assert digest.hexdigest() == protocol["revision"]

records = []
for entry in manifest["worlds"]:
    world = entry["worldId"]
    trial = trials[(entry["label"], entry["seed"])]
    expected = {"revision": protocol["revision"], "settings": trial["settings"]}
    meta = json.loads((ROOT / f"runs/{world}.meta.json").read_text())
    assert all(meta[key] == value for key, value in {**entry, **expected}.items())
    row = {**entry, "status": "pending"}
    if all((ROOT / f"runs/{world}.{kind}.json").exists() for kind in ["score", "snapshot", "events", "reveal"]):
        row.update(status="complete", result=load_world(ROOT, world, entry["seed"], expected))
        events = json.loads((ROOT / f"runs/{world}.events.json").read_text())
        snapshot = json.loads((ROOT / f"runs/{world}.snapshot.json").read_text())
        ledger = Counter()
        for event in events:
            if event["kind"] == "ledger":
                ledger[event["line"]["kind"]] += event["line"]["cents"]
        assert sum(ledger.values()) == row["result"]["marginCents"]
        row["ledgerCents"] = dict(ledger)
        row["gigCounts"] = dict(Counter(gig["status"] for gig in snapshot["gigs"]))
        row["eventCounts"] = dict(Counter(event["kind"] for event in events))
        row["actionErrors"] = json.loads((ROOT / f"runs/{world}.errors.json").read_text())
        row["recoveries"] = json.loads((ROOT / f"runs/{world}.recoveries.json").read_text())
        if confirmation:
            baseline = next(item for item in protocol["baselines"] if item["seed"] == entry["seed"])
            row["baseline"] = load_world(ROOT, baseline["worldId"], entry["seed"], baseline)
            ledger = Counter()
            for event in json.loads((ROOT / f"runs/{baseline['worldId']}.events.json").read_text()):
                if event["kind"] == "ledger":
                    ledger[event["line"]["kind"]] += event["line"]["cents"]
            row["baselineLedgerCents"] = dict(ledger)
    records.append(row)

pairs, summary = [], None
if all(row["status"] == "complete" for row in records):
    for seed in protocol["confirmationSeeds" if confirmation else "screeningSeeds"]:
        if confirmation:
            b = next(row for row in records if row["seed"] == seed)
            a = {"result": b["baseline"], "ledgerCents": b["baselineLedgerCents"]}
        else:
            a = next(row for row in records if row["seed"] == seed and row["label"] == "relisting-control")
            b = next(row for row in records if row["seed"] == seed and row["label"] == "relisting-treatment")
        pairs.append({"seed": seed, "gainCents": b["result"]["marginCents"] - a["result"]["marginCents"], "componentDifferencesCents": {key: b["ledgerCents"].get(key, 0) - a["ledgerCents"].get(key, 0) for key in sorted(a["ledgerCents"].keys() | b["ledgerCents"].keys())}})
    treated = records if confirmation else [row for row in records if row["label"] == "relisting-treatment"]
    summary = {"pairs": len(pairs), "meanGainCents": statistics.mean(pair["gainCents"] for pair in pairs), "minimumGainCents": min(pair["gainCents"] for pair in pairs), "qualifiedTreatments": sum(row["result"]["ranked"] for row in treated), "undeliveredTreatments": sum(row["result"]["undeliveredOrders"] for row in treated), "treatmentActionErrors": sum(len(row["actionErrors"]) for row in treated), "treatmentRecoveries": sum(len(row["recoveries"]) for row in treated)}
    gate = protocol["confirmationGate" if confirmation else "screeningGate"]
    summary["gatePassed"] = summary["meanGainCents"] > 100 * gate["meanPairedGainEurosGreaterThan"] and summary["minimumGainCents"] >= 100 * gate["worstPairedGainEurosAtLeast"] and summary["qualifiedTreatments"] == len(treated) and summary["undeliveredTreatments"] == 0
report = {"scope": protocol["scope"], "limitation": "Selected old development streams, not independent validation. Withdrawn gig counts include expiry and changes as well as deliberate reposting; they are not exact repost-attempt counts.", "protocol": protocol, "manifest": manifest, "summary": summary, "pairs": pairs, "records": records}
(ROOT / f"docs/{name}-results.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(summary if summary else [{key: row[key] for key in ["worldId", "label", "seed", "status"]} for row in records], indent=2))
