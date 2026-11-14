"""Compare the explicit frozen late-rescue trials and retain complete-week cost components."""

import hashlib
import json
import statistics
import sys
from collections import Counter
from pathlib import Path

from frontier_validation import load_world

ROOT = Path(__file__).resolve().parents[1]
confirmation = "--confirmation" in sys.argv
name = "late-rescue-confirmation" if confirmation else "late-rescue"
manifest = json.loads((ROOT / f"experiments/{name}-manifest.json").read_text())
protocol_path = ROOT / manifest["protocol"]
if hashlib.sha256(protocol_path.read_bytes()).hexdigest() != manifest["protocolSha256"]:
    raise ValueError("Protocol changed after worlds were assigned")
protocol = json.loads(protocol_path.read_text())
baselines = {row["seed"]: row for row in protocol.get("baselines", [])}
plan = json.loads((ROOT / protocol["plan"]).read_text())
trials = {(row["label"], row["seed"]): row for row in plan}
keys = [(row["label"], row["seed"]) for row in manifest["worlds"]]
if len(set(keys)) != len(keys) or set(keys) != set(trials) or len({row["worldId"] for row in manifest["worlds"]}) != len(keys):
    raise ValueError("Every planned trial requires one distinct explicit world")
source = hashlib.sha256()
for path in sorted((ROOT / "runs/sources" / protocol["revision"]).glob("*.ts")):
    source.update(path.name.encode())
    source.update(path.read_bytes())
if source.hexdigest() != protocol["revision"]:
    raise ValueError("Frozen source mismatch")

records = []
for entry in manifest["worlds"]:
    world = entry["worldId"]
    expected = {"revision": protocol["revision"], "settings": trials[(entry["label"], entry["seed"])]["settings"]}
    meta = json.loads((ROOT / "runs" / f"{world}.meta.json").read_text())
    if any(meta[key] != entry[key] for key in ["worldId", "label", "seed"]) or any(meta[key] != expected[key] for key in ["revision", "settings"]):
        raise ValueError(f"Metadata mismatch for {world}")
    row = {**entry, "status": "pending"}
    if all((ROOT / "runs" / f"{world}.{kind}.json").exists() for kind in ["score", "snapshot", "events", "reveal"]):
        row.update(status="complete", result=load_world(ROOT, world, entry["seed"], expected))
        events = json.loads((ROOT / "runs" / f"{world}.events.json").read_text())
        snapshot = json.loads((ROOT / "runs" / f"{world}.snapshot.json").read_text())
        reveal = json.loads((ROOT / "runs" / f"{world}.reveal.json").read_text())
        gigs = {gig["id"]: gig for gig in snapshot["gigs"]}
        ledger, orders, bookings = Counter(), {}, []
        for event in events:
            if event["kind"] == "ledger":
                ledger[event["line"]["kind"]] += event["line"]["cents"]
            if event["kind"] in ["order_won", "order_changed"]:
                orders[event["order"]["id"]] = event["order"]
            if event["kind"] != "gig_booked":
                continue
            gig = gigs.get(event["gigId"])
            if not gig or len(gig["stops"]) != 2:
                continue
            order = orders.get(gig["stops"][0]["orderId"])
            if order and event["at"] > order["lastPickupAt"]:
                bookings.append({**event, "orderId": order["id"], "lastPickupAt": order["lastPickupAt"], "deadline": order["deadline"], "views": [view for view in reveal["views"] if view["gigId"] == gig["id"]]})
        row["ledgerCents"] = dict(ledger)
        if sum(ledger.values()) != row["result"]["marginCents"]:
            raise ValueError("Ledger components do not reconcile")
        row["lateBookings"] = bookings
        row["actionErrors"] = json.loads((ROOT / "runs" / f"{world}.errors.json").read_text())
        if confirmation:
            baseline = baselines[entry["seed"]]
            row["baseline"] = load_world(ROOT, baseline["worldId"], entry["seed"], baseline)
            baseline_events = json.loads((ROOT / "runs" / f"{baseline['worldId']}.events.json").read_text())
            baseline_ledger = Counter()
            for event in baseline_events:
                if event["kind"] == "ledger":
                    baseline_ledger[event["line"]["kind"]] += event["line"]["cents"]
            row["baselineLedgerCents"] = dict(baseline_ledger)
    records.append(row)

summary, pairs = None, []
if all(row["status"] == "complete" for row in records):
    for seed in dict.fromkeys(row["seed"] for row in plan):
        if confirmation:
            treatment = next(row for row in records if row["seed"] == seed)
            control = {"result": treatment["baseline"], "ledgerCents": treatment["baselineLedgerCents"]}
        else:
            control = next(row for row in records if row["seed"] == seed and row["label"] == "late-rescue-control")
            treatment = next(row for row in records if row["seed"] == seed and row["label"] == "late-rescue-treatment")
        kinds = set(control["ledgerCents"]) | set(treatment["ledgerCents"])
        pairs.append({"seed": seed, "gainCents": treatment["result"]["marginCents"] - control["result"]["marginCents"], "componentDifferencesCents": {kind: treatment["ledgerCents"].get(kind, 0) - control["ledgerCents"].get(kind, 0) for kind in sorted(kinds)}})
    treated = records if confirmation else [row for row in records if row["label"] == "late-rescue-treatment"]
    summary = {"pairs": len(pairs), "meanGainCents": statistics.mean(pair["gainCents"] for pair in pairs), "positivePairs": sum(pair["gainCents"] > 0 for pair in pairs), "qualifiedTreatments": sum(row["result"]["ranked"] for row in treated), "undeliveredTreatments": sum(row["result"]["undeliveredOrders"] for row in treated), "minimumTreatmentOnTimeShare": min(row["result"]["onTimeShare"] for row in treated)}
report = {"scope": protocol["scope"], "protocol": protocol, "manifest": manifest, "summary": summary, "pairs": pairs, "records": records}
output = name if confirmation else "late-rescue-results"
(ROOT / f"docs/{output}.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(summary if summary else [{key: row[key] for key in ["worldId", "seed", "label", "status"]} for row in records], indent=2))
