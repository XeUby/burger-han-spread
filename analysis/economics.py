import collections
import json
import math
import statistics
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / "runs"
seeds = [f"formal-unseen-20261113-{i:02}" for i in range(9, 17)]
rows = [json.loads(line) for line in (RUNS / "results.jsonl").read_text().splitlines() if line.strip()]
selected = []
for seed in seeds:
    found = [row for row in rows if row.get("seed") == seed and row.get("label") == "validation-final"]
    if len(found) != 1:
        raise ValueError(f"Expected one validation-final row for {seed}, found {len(found)}")
    selected.append(found[0])
road = {(row["from"], row["to"]): row for row in json.loads((ROOT / "docs/map.json").read_text())["roads"]}
jobs = []
worlds = []
for run in selected:
    world = run["worldId"]
    reveal = json.loads((RUNS / f"{world}.reveal.json").read_text())
    events = json.loads((RUNS / f"{world}.events.json").read_text())
    snapshot = json.loads((RUNS / f"{world}.snapshot.json").read_text())
    drivers = json.loads((RUNS / f"{world}.drivers.json").read_text())
    requests = {row["request"]["id"]: row["request"] for row in reveal["requests"]}
    truth = {row["orderId"]: row["legs"] for row in reveal["orders"]}
    won = {event["order"]["id"]: event for event in events if event["kind"] == "order_won"}
    fees = collections.Counter()
    all_fees = 0
    booked = {}
    changed = set()
    for event in events:
        if event["kind"] == "ledger" and event["line"]["kind"] == "driver_fee":
            line = event["line"]
            fees[line["orderId"]] -= line["cents"]
            all_fees -= line["cents"]
        if event["kind"] == "gig_booked":
            booked[event["gigId"]] = event
        if event["kind"] == "order_changed":
            changed.add(event["order"]["id"])
    start = len(jobs)
    for order in snapshot["orders"]:
        if order["status"] == "cancelled" or len(order["legs"]) != 1:
            continue
        request = requests[order["id"]]
        first = request["legs"][0]
        origin, destination = first["pickup"]["placeId"], first["delivery"]["placeId"]
        km = road[origin, destination]["km"]
        manual = truth[order["id"]][0]["manualGearbox"]
        qualified = [driver for driver in drivers if (not manual or driver["licence"] == "manual") and (not first["car"]["premium"] or driver["rating"] >= 4.8 and driver["completedGigs"] >= 50)]
        supply = sum(1 if road[d["homePlaceId"], origin]["km"] <= 35 else 0.35 if road[d["homePlaceId"], origin]["km"] <= 70 else 0 for d in qualified)
        extra = 0.18 if supply < 20 else 0.08 if supply < 50 else 0
        raw = math.floor(request["referenceFeeCents"] * (run["settings"]["fee"] + extra) + 0.5)
        clamped = raw < 2000
        opening = max(2000, raw)
        at = won[order["id"]]["at"]
        cutoff = won[order["id"]]["order"]["lastPickupAt"]
        extra_drivers = [driver for driver in qualified if road[driver["homePlaceId"], destination]["km"] <= 35 and road[driver["homePlaceId"], origin]["km"] > 100]
        optimistic = [driver for driver in extra_drivers if at + 10 + road[driver["homePlaceId"], origin]["minutes"] <= cutoff]
        cautious = [driver for driver in extra_drivers if at + 30 + 2 * road[driver["homePlaceId"], origin]["minutes"] <= cutoff]
        strict = [driver for driver in extra_drivers if at + 60 + 3 * road[driver["homePlaceId"], origin]["minutes"] <= cutoff]
        rescue = [driver for driver in extra_drivers if 30 + 2 * road[driver["homePlaceId"], origin]["minutes"] <= 240]
        same_place = origin == destination
        on_time = all(at is not None and at <= order["deadline"] for at in order["deliveredAt"])
        paid_opening = fees[order["id"]] == opening
        safe_subset = clamped and km <= 35 and supply >= 30 and on_time and paid_opening and order["id"] not in changed
        jobs.append({
            "seed": run["seed"], "worldId": world, "orderId": order["id"], "origin": origin, "destination": destination,
            "km": km, "referenceFeeCents": request["referenceFeeCents"], "supply": supply, "rawBaseFeeCents": raw,
            "floorBinds": clamped, "samePlace": same_place, "driverFeeCents": fees[order["id"]], "onTime": on_time,
            "routeOrPlanChanged": order["id"] in changed, "paidOpeningOnly": paid_opening, "conservativeFloorSubset": safe_subset,
            "floor1750SavingIfUnchangedCents": max(0, 2000 - max(1750, raw)) if safe_subset else 0,
            "floor1500SavingIfUnchangedCents": max(0, 2000 - max(1500, raw)) if clamped else 0,
            "wonAt": at, "lastPickupAt": cutoff, "leadMinutes": cutoff - at,
            "destinationHomeOutsideCurrentReach": len(extra_drivers), "destinationHomeRoadTimeFeasible": len(optimistic),
            "destinationHome2xRoadPlus30Feasible": len(cautious), "destinationHome3xRoadPlus60Feasible": len(strict),
            "destinationHome2xRoadPlus30AtRescue": len(rescue),
            "destinationHomeMedianOutboundRoadMinutes": statistics.median(road[d["homePlaceId"], origin]["minutes"] for d in extra_drivers) if extra_drivers else None,
        })
    worlds.append({"seed": run["seed"], "worldId": world, "allDriverFeesCents": all_fees, "jobs": len(jobs) - start})

bounded = [job for job in jobs if job["floorBinds"]]
safe = [job for job in jobs if job["conservativeFloorSubset"]]
reachable = [job for job in jobs if job["destinationHome2xRoadPlus30Feasible"]]
total_fees = sum(world["allDriverFeesCents"] for world in worlds)
all_bounded_fees = sum(job["driverFeeCents"] for job in bounded)
summary = {
    "worlds": len(worlds), "noncancelledSingleLegOrders": len(jobs), "totalDriverFeesCents": total_fees,
    "floor": {
        "boundOrders": len(bounded), "orderShare": len(bounded) / len(jobs),
        "samePlaceOrders": sum(job["samePlace"] for job in bounded), "within35KmOrders": sum(job["km"] <= 35 for job in bounded),
        "boundDriverFeesCents": all_bounded_fees, "driverFeeShare": all_bounded_fees / total_fees,
        "medianRawBaseFeeCents": statistics.median(job["rawBaseFeeCents"] for job in bounded),
        "meanActualFeeCents": statistics.mean(job["driverFeeCents"] for job in bounded),
        "onTimeShare": sum(job["onTime"] for job in bounded) / len(bounded),
        "paidOpeningOnlyOrders": sum(job["paidOpeningOnly"] for job in bounded),
        "conservativeSubsetOrders": len(safe),
        "conservativeFloor1750MechanicalSavingCents": sum(job["floor1750SavingIfUnchangedCents"] for job in safe),
        "allBoundFloor1500MechanicalSavingCents": sum(job["floor1500SavingIfUnchangedCents"] for job in bounded),
    },
    "destinationHomes": {
        "ordersWithNewEligibleProfiles": sum(job["destinationHomeOutsideCurrentReach"] > 0 for job in jobs),
        "ordersWithRoadTimeFeasibleNewProfiles": sum(job["destinationHomeRoadTimeFeasible"] > 0 for job in jobs),
        "ordersWith2xRoadPlus30FeasibleNewProfiles": len(reachable),
        "ordersWith3xRoadPlus60FeasibleNewProfiles": sum(job["destinationHome3xRoadPlus60Feasible"] > 0 for job in jobs),
        "ordersWith2xRoadPlus30AtRescue": sum(job["destinationHome2xRoadPlus30AtRescue"] > 0 for job in jobs),
        "medianNewProfilesWhenReachable": statistics.median(job["destinationHome2xRoadPlus30Feasible"] for job in reachable),
        "meanNewProfilesWhenReachable": statistics.mean(job["destinationHome2xRoadPlus30Feasible"] for job in reachable),
        "medianLeadMinutesWhenReachable": statistics.median(job["leadMinutes"] for job in reachable),
        "medianKmWhenReachable": statistics.median(job["km"] for job in reachable),
        "reachableCurrentDriverFeesCents": sum(job["driverFeeCents"] for job in reachable),
    },
}
report = {"method": {
    "selection": "Exactly the eight validation-final runs on formal-unseen-20261113-09 through -16",
    "floor": "Reconstruct original base fee from reference fee, supply weighting and configured fee. Money scenarios hold accepted orders and driver behavior fixed; they are not causal profit estimates.",
    "conservativeSubset": "Original floor binds, road distance <=35 km, weighted eligible home supply >=30, on time, total driver fees equal opening fee, and no order_changed event.",
    "destinationHome": "Profile-qualified home within35 roadkm of destination and >100 roadkm from pickup; thus excluded by the original pickup-only offer radius.",
    "timing": "Static potential reach from the order_won time to original public lastPickupAt. Scenarios use road time+10, twice road time+30, and three times road time+60 minutes; these are travel proxies, not public-transport schedules or driver availability.",
    "caveats": ["Daily willingness to work, remaining daily gig capacity, actual location and notification probability are unobserved.", "No counterfactual fee acceptance or cost saving is observable in these logs.", "Reducing base fees also reduces adaptive customer quotes unless fee and customer-cost experiments are separated.", "Manual requirements are read from reveal truth only for this retrospective analysis; deployment must use the note parser."]
}, "summary": summary, "worlds": worlds, "jobs": jobs}
(ROOT / "docs/economics-study.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(summary, indent=2))
