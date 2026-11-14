"""Audit the creation-fee probe, including every post restoration and the first event difference."""

import hashlib
import json
import math
from collections import Counter
from pathlib import Path

from frontier_validation import load_world

ROOT = Path(__file__).resolve().parents[1]
probe = json.loads((ROOT / "runs/fee-anchor-probe.json").read_text())
protocol = probe["protocol"]
if hashlib.sha256((ROOT / "experiments/fee-anchor-protocol.json").read_bytes()).hexdigest() != probe["protocolSha256"]:
    raise ValueError("Probe protocol changed")
for name, expected in protocol["files"].items():
    if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != expected:
        raise ValueError(f"Probe implementation changed: {name}")
if not probe["terminal"]:
    print(json.dumps({"terminal": False, "arms": probe["arms"], "setupError": probe.get("setupError")}, indent=2))
    raise SystemExit(0)
if sorted(arm["factor"] for arm in probe["arms"]) != protocol["factors"] or len({arm["worldId"] for arm in probe["arms"]}) != len(probe["arms"]):
    raise ValueError("Missing, repeated or extra probe arms")


def audit_journal(world, factor):
    path = ROOT / f"runs/{world}.anchor.jsonl"
    rows = [json.loads(line) for line in path.read_text().splitlines()]
    cursor, restored, failed, previous = 0, 0, 0, -1
    while cursor < len(rows):
        post, ack = rows[cursor:cursor + 2]
        assert post["stage"] == "post" and ack["stage"] == "posted"
        assert post["at"] == ack["at"] and post["at"] >= previous
        previous = post["at"]
        assert len(post["actions"]) == len(ack["results"])
        successful = [(action, result) for action, result in zip(post["actions"], ack["results"]) if action["type"] == "post" and result["ok"]]
        failed += sum(action["type"] == "post" and not result["ok"] for action, result in zip(post["actions"], ack["results"]))
        cursor += 2
        if not successful:
            continue
        restore, done = rows[cursor:cursor + 2]
        assert restore["stage"] == "restore" and done["stage"] == "restored"
        assert restore["at"] == done["at"] == post["at"]
        assert len(restore["actions"]) == len(done["results"]) == len(successful)
        assert all(result["ok"] for result in done["results"])
        for (action, result), original in zip(successful, restore["actions"]):
            assert original["type"] == "reprice" and original["gigId"] == result["id"]
            expected = [{**step, "feeCents": max(1, math.floor(step["feeCents"] * factor + .5))} for step in original["schedule"]]
            assert action["schedule"] == expected
        restored += len(successful)
        cursor += 2
    return {"restoredPosts": restored, "failedPosts": failed, "journalSha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def compare_events(reference, treatment):
    common = 0
    while common < min(len(reference), len(treatment)) and reference[common] == treatment[common]:
        common += 1
    return {"identical": common == len(reference) == len(treatment), "commonPrefixEvents": common, "referenceEvents": len(reference), "treatmentEvents": len(treatment), "bookingsBeforeDifference": sum(event["kind"] == "gig_booked" for event in reference[:common]), "referenceFirstDifference": reference[common] if common < len(reference) else None, "treatmentFirstDifference": treatment[common] if common < len(treatment) else None}


records, histories = [], {}
for arm in probe["arms"]:
    if arm["status"] != "complete":
        raise ValueError("A terminal probe must retain three completed arms")
    world = arm["worldId"]
    result = load_world(ROOT, world, protocol["seed"], protocol)
    events = json.loads((ROOT / f"runs/{world}.events.json").read_text())
    histories[arm["factor"]] = events
    ledger = Counter()
    for event in events:
        if event["kind"] == "ledger":
            ledger[event["line"]["kind"]] += event["line"]["cents"]
    records.append({**arm, "result": result, "journal": audit_journal(world, arm["factor"]), "ledgerCents": dict(ledger), "drops": sum(event["kind"] == "gig_dropped" for event in events), "actionErrors": json.loads((ROOT / f"runs/{world}.errors.json").read_text()), "recoveries": json.loads((ROOT / f"runs/{world}.recoveries.json").read_text())})
reference = next(row for row in records if row["factor"] == 1)
for row in records:
    row["gainCents"] = row["result"]["marginCents"] - reference["result"]["marginCents"]
    row["eventsComparedWithFactor1"] = compare_events(histories[1], histories[row["factor"]])
archived = load_world(ROOT, protocol["archivedControl"], protocol["seed"], protocol)
archive_events = json.loads((ROOT / f"runs/{protocol['archivedControl']}.events.json").read_text())
report = {"scope": protocol["scope"], "protocol": protocol, "probe": probe, "records": records, "factor1VersusArchivedControl": {"marginDifferenceCents": reference["result"]["marginCents"] - archived["marginCents"], "events": compare_events(archive_events, histories[1])}, "allFactorsIdenticalEvents": all(row["eventsComparedWithFactor1"]["identical"] for row in records)}
(ROOT / "docs/fee-anchor-results.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"allFactorsIdenticalEvents": report["allFactorsIdenticalEvents"], "factor1VersusArchivedControl": report["factor1VersusArchivedControl"], "arms": [{"factor": row["factor"], "worldId": row["worldId"], "marginCents": row["result"]["marginCents"], "gainCents": row["gainCents"], "qualified": row["result"]["ranked"], "journal": row["journal"]} for row in records]}, indent=2))
