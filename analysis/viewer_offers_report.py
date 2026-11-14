"""Audit offers to recent viewers against matched no-offer forks."""

import hashlib
import json
import math
import sys
from collections import Counter
from pathlib import Path

from frontier_validation import load_world

ROOT = Path(__file__).resolve().parents[1]
raw = (ROOT / "runs/viewer-offers-probe.json").read_bytes()
probe = json.loads(raw)
protocol = probe["protocol"]
assert hashlib.sha256((ROOT / "experiments/viewer-offers-protocol.json").read_bytes()).hexdigest() == probe["protocolSha256"]
assert hashlib.sha256((ROOT / "research/viewer-offers/probe.ts").read_bytes()).hexdigest() == protocol["probeSha256"]
partial = "--partial" in sys.argv
if not probe["terminal"] and not partial:
    print(json.dumps({"terminal": False, "cases": len(probe["cases"]), "error": probe.get("error")}))
    raise SystemExit(0)
if partial:
    assert probe.get("error")
else:
    assert not probe.get("error")
assert len(probe["cases"]) <= protocol["maximumCases"]
assert len({case["order"]["id"] for case in probe["cases"]}) == len(probe["cases"])
worlds = [arm["worldId"] for case in probe["cases"] for arm in case["arms"]]
assert len(set(worlds)) == len(worlds)
base_events = json.loads((ROOT / f"runs/{probe['baseWorldId']}.{'interrupted-events' if partial else 'events'}.json").read_text())
roads = {(road["from"], road["to"]): road for road in json.loads((ROOT / "docs/map.json").read_text())["roads"]}


def measure(case, arm, minutes):
    events = [event for event in arm["events"] if event.get("gigId") == case["gig"]["id"] and event["at"] <= case["at"] + minutes]
    bookings = [event for event in events if event["kind"] == "gig_booked"]
    answers = [event for event in events if event["kind"] == "offer_answered" and event["driverId"] == case["driver"]["id"]]
    return {"views": sum(event["kind"] == "gig_viewed" for event in events), "booked": bool(bookings), "bookings": bookings, "answers": answers, "accepted": any(event["answer"] == "accepted" for event in answers), "snapshot": arm.get(f"at{minutes}")}


cases = []
incomplete = []
for case in probe["cases"]:
    if partial and (len(case["arms"]) != 3 or any(not arm.get("at30") for arm in case["arms"])):
        incomplete.append(case)
        continue
    gig, order, driver, now = case["gig"], case["order"], case["driver"], case["at"]
    assert now - 2 <= case["viewAt"] <= now and 480 <= now % 1440 <= 1080
    assert gig["status"] == "open" and len(gig["stops"]) == 2 and all(stop["orderId"] == order["id"] for stop in gig["stops"])
    assert order["status"] == "waiting" and len(order["legs"]) == 1 and order["lastPickupAt"] >= now + 300
    leg = order["legs"][0]
    assert not leg["pickup"]["privateAddress"] and not leg["delivery"]["privateAddress"] and leg["pickup"]["window"]["from"] <= now + 180
    assert roads[(driver["homePlaceId"], leg["pickup"]["placeId"])]["km"] <= 35
    assert not gig["audience"]["manualLicence"] or driver["licence"] == "manual"
    assert not gig["audience"]["experienced"] or (driver["rating"] >= 4.8 and driver["completedGigs"] >= 50)
    assert case["priorDriverOffers"] < 3
    assert any(event["kind"] == "gig_viewed" and event["at"] == case["viewAt"] and event["gigId"] == gig["id"] and event["driverId"] == driver["id"] and event["seq"] <= case["afterSeq"] for event in base_events)
    assert [arm["kind"] for arm in case["arms"]] == protocol["arms"]
    for arm in case["arms"]:
        assert arm["deleted"] and not arm.get("error") and arm["targetGigId"] == gig["id"]
        assert len({event["seq"] for event in arm["events"]}) == len(arm["events"])
        assert all(event["seq"] > case["afterSeq"] and now <= event["at"] <= now + 30 for event in arm["events"])
        if arm["kind"] == "hold":
            assert not arm["actions"]
        else:
            assert len(arm["actions"]) == 1
            call = arm["actions"][0]
            fee = math.floor(gig["feeCents"] * (.9 if arm["kind"] == "discount-offer" else 1) + .5)
            assert call["actions"] == [{"type": "offer", "gigId": gig["id"], "driverId": driver["id"], "feeCents": fee}]
            assert len(call["results"]) == 1 and call["results"][0]["ok"]
    cases.append({"orderId": order["id"], "at": now, "gigId": gig["id"], "driverId": driver["id"], "publicFeeCents": gig["feeCents"], "arms": {arm["kind"]: {str(minutes): measure(case, arm, minutes) for minutes in [10, 30]} for arm in case["arms"]}})

summary = {kind: {str(minutes): {"views": sum(case["arms"][kind][str(minutes)]["views"] for case in cases), "bookedCases": sum(case["arms"][kind][str(minutes)]["booked"] for case in cases), "acceptedOffers": sum(case["arms"][kind][str(minutes)]["accepted"] for case in cases), "answers": dict(Counter(event["answer"] for case in cases for event in case["arms"][kind][str(minutes)]["answers"]))} for minutes in [10, 30]} for kind in protocol["arms"]}
gain = summary["same-fee-offer"]["30"]["bookedCases"] - summary["hold"]["30"]["bookedCases"]
signal = summary["discount-offer"]["30"]["acceptedOffers"] >= 3 or gain >= 3
control_events = json.loads((ROOT / f"runs/{protocol['archivedControl']}.events.json").read_text())
if partial:
    snapshot = json.loads((ROOT / f"runs/{probe['baseWorldId']}.interrupted-snapshot.json").read_text())
    base = {"worldId": probe["baseWorldId"], "now": snapshot["now"], "endsAt": snapshot["endsAt"], "score": snapshot["score"]}
    control_events = [event for event in control_events if event["at"] <= snapshot["now"]]
    margin_difference = None
else:
    base = load_world(ROOT, probe["baseWorldId"], protocol["seed"], protocol)
    control = load_world(ROOT, protocol["archivedControl"], protocol["seed"], protocol)
    margin_difference = base["marginCents"] - control["marginCents"]
report = {"protocol": protocol, "terminal": probe["terminal"], "probeError": probe.get("error"), "rawSha256": hashlib.sha256(raw).hexdigest(), "baseWorldId": probe["baseWorldId"], "cases": cases, "incompleteCases": incomplete, "summary": summary, "sameFeeNetAddedBookings": gain, "gatePassed": signal and probe["terminal"] and base_events == control_events, "deletedForks": len(worlds), "base": base, "baseVersusArchive": {"scope": "prefix through interruption" if partial else "complete week", "eventsIdentical": base_events == control_events, "baseEventCount": len(base_events), "controlEventCount": len(control_events), "marginDifferenceCents": margin_difference}}
(ROOT / "docs/viewer-offers-results.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({key: report[key] for key in ["summary", "sameFeeNetAddedBookings", "gatePassed", "deletedForks", "baseVersusArchive"]}, indent=2))
