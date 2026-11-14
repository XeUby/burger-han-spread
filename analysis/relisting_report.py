"""Audit the fixed relisting probe and its unchanged base policy."""

import hashlib
import json
from pathlib import Path

from frontier_validation import load_world

ROOT = Path(__file__).resolve().parents[1]
raw = (ROOT / "runs/relisting-probe.json").read_bytes()
probe = json.loads(raw)
protocol = probe["protocol"]
assert hashlib.sha256((ROOT / "experiments/relisting-protocol.json").read_bytes()).hexdigest() == probe["protocolSha256"]
assert hashlib.sha256((ROOT / "research/relisting/probe.ts").read_bytes()).hexdigest() == protocol["probeSha256"]
if not probe["terminal"]:
    print(json.dumps({"terminal": False, "cases": len(probe["cases"]), "error": probe.get("error")}))
    raise SystemExit(0)
assert not probe.get("error")
assert len(probe["cases"]) <= protocol["maximumCases"]
assert len({case["order"]["id"] for case in probe["cases"]}) == len(probe["cases"])
worlds = [arm["worldId"] for case in probe["cases"] for arm in case["arms"]]
assert len(set(worlds)) == len(worlds)


def measure(case, arm, minutes):
    events = [event for event in arm["events"] if event.get("gigId") == arm["targetGigId"] and event["at"] <= case["at"] + minutes]
    views = [event for event in events if event["kind"] == "gig_viewed"]
    bookings = [event for event in events if event["kind"] == "gig_booked"]
    return {"views": len(views), "uniqueViewers": len({event["driverId"] for event in views}), "booked": bool(bookings), "bookings": bookings, "snapshot": arm.get(f"at{minutes}")}


cases = []
for case in probe["cases"]:
    assert [arm["kind"] for arm in case["arms"]] == protocol["arms"]
    hold, sham, relist = case["arms"]
    for arm in case["arms"]:
        assert arm["deleted"] and not arm.get("error")
        assert len({event["seq"] for event in arm["events"]}) == len(arm["events"])
        assert all(event["seq"] > case["afterSeq"] and case["at"] <= event["at"] <= case["at"] + 30 for event in arm["events"])
        for call in arm["actions"]:
            assert len(call["actions"]) == len(call["results"])
            assert all(result["ok"] for result in call["results"])
    assert not hold["actions"]
    assert len(sham["actions"]) == 1
    assert sham["actions"][0]["actions"] == [{"type": "reprice", "gigId": case["gig"]["id"], "schedule": case["gig"]["schedule"]}]
    assert len(relist["actions"]) == 2
    assert relist["actions"][0]["actions"] == [{"type": "withdraw", "gigId": case["gig"]["id"]}]
    assert relist["actions"][1]["actions"] == [{"type": "post", **{key: case["gig"][key] for key in ["stops", "audience", "schedule"]}}]
    assert relist["targetGigId"] == relist["actions"][1]["results"][0]["id"]
    cases.append({"orderId": case["order"]["id"], "at": case["at"], "gigId": case["gig"]["id"], "shamEventsIdentical": hold["events"] == sham["events"], "arms": {arm["kind"]: {str(minutes): measure(case, arm, minutes) for minutes in [10, 30]} for arm in case["arms"]}})

summary = {kind: {str(minutes): {"views": sum(case["arms"][kind][str(minutes)]["views"] for case in cases), "uniqueViewersSummedAcrossCases": sum(case["arms"][kind][str(minutes)]["uniqueViewers"] for case in cases), "bookedCases": sum(case["arms"][kind][str(minutes)]["booked"] for case in cases)} for minutes in [10, 30]} for kind in protocol["arms"]}
paired = {str(minutes): {"relistOnlyBookings": sum(case["arms"]["relist"][str(minutes)]["booked"] and not case["arms"]["hold"][str(minutes)]["booked"] for case in cases), "holdOnlyBookings": sum(case["arms"]["hold"][str(minutes)]["booked"] and not case["arms"]["relist"][str(minutes)]["booked"] for case in cases)} for minutes in [10, 30]}
base = load_world(ROOT, probe["baseWorldId"], protocol["seed"], protocol)
control = load_world(ROOT, protocol["archivedControl"], protocol["seed"], protocol)
histories = [json.loads((ROOT / f"runs/{world}.events.json").read_text()) for world in [probe["baseWorldId"], protocol["archivedControl"]]]
report = {"protocol": protocol, "rawSha256": hashlib.sha256(raw).hexdigest(), "baseWorldId": probe["baseWorldId"], "cases": cases, "summary": summary, "paired": paired, "allShamEventsIdentical": all(case["shamEventsIdentical"] for case in cases), "deletedForks": len(worlds), "base": base, "baseVersusArchive": {"eventsIdentical": histories[0] == histories[1], "baseEventCount": len(histories[0]), "controlEventCount": len(histories[1]), "marginDifferenceCents": base["marginCents"] - control["marginCents"]}}
(ROOT / "docs/relisting-results.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({key: report[key] for key in ["summary", "paired", "allShamEventsIdentical", "deletedForks", "baseVersusArchive"]}, indent=2))
