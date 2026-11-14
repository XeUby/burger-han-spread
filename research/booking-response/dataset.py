"""Build week-grouped prediction data from public events, never reveal fields."""

import hashlib
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def build():
    roads = {(r["from"], r["to"]): r for r in json.loads((ROOT / "docs/map.json").read_text())["roads"]}
    by_seed = defaultdict(list)
    for path in sorted((ROOT / "runs").glob("*.meta.json")):
        meta = json.loads(path.read_text())
        if meta.get("seed") and all((ROOT / f'runs/{meta["worldId"]}.{kind}.json').exists() for kind in ["events", "snapshot", "score", "drivers"]):
            by_seed[meta["seed"]].append(meta)
    rows, weeks = [], []
    names = ["level", "roadHours", "originSupply", "destinationSupply", "readyLeadDays", "slackDays", "hour", "weekday", "premium", "lowCharge", "referenceEuros", "openOrders", "payout", "fee"]
    for seed, worlds in sorted(by_seed.items()):
        # One complete run per underlying seed prevents repeated policies dominating the fit.
        meta = min(worlds, key=lambda m: (m["level"] != 8, m["worldId"]))
        world = meta["worldId"]
        events_path = ROOT / f"runs/{world}.events.json"
        events = json.loads(events_path.read_text())
        snapshot = json.loads((ROOT / f"runs/{world}.snapshot.json").read_text())
        if snapshot["now"] < snapshot["endsAt"]:
            continue
        drivers = json.loads((ROOT / f"runs/{world}.drivers.json").read_text())
        requests, orders, active, first_book, drops = {}, {}, set(), {}, set()
        members = {g["id"]: set(s["orderId"] for s in g["stops"]) for g in snapshot["gigs"]}
        won, samples = {}, {}
        for event in events:
            kind, at = event["kind"], event["at"]
            if kind == "price_request":
                requests[event["request"]["id"]] = event["request"]
            elif kind == "order_won":
                order = event["order"]
                oid = order["id"]
                req = requests.get(oid)
                orders[oid], won[oid] = order, at
                if req and len(order["legs"]) == 1:
                    leg = order["legs"][0]
                    a, b = leg["pickup"]["placeId"], leg["delivery"]["placeId"]
                    supply = lambda place: sum(1 if roads[d["homePlaceId"], place]["km"] <= 35 else .35 if roads[d["homePlaceId"], place]["km"] <= 70 else 0 for d in drivers if not leg["car"]["premium"] or (d["rating"] >= 4.8 and d["completedGigs"] >= 50))
                    samples[oid] = {"seed": seed, "worldId": world, "orderId": oid, "at": at, "x": [meta["level"], roads[a, b]["minutes"] / 60, supply(a), supply(b), (leg["pickup"]["window"]["from"]-at)/1440, (order["lastPickupAt"]-at)/1440, at % 1440 / 60, at // 1440 % 7, int(leg["car"]["premium"]), int(leg["car"]["electric"] and (leg["car"].get("chargePercent") or 0) < 30), req["referenceFeeCents"]/100, len(active), meta["settings"].get("payout", 1), meta["settings"].get("fee", 1.05)]}
                active.add(oid)
            elif kind == "gig_booked":
                for oid in members.get(event["gigId"], []):
                    first_book.setdefault(oid, at)
            elif kind in ["gig_dropped", "no_show"]:
                drops.update(members.get(event["gigId"], []))
            elif kind == "order_cancelled":
                active.discard(event["orderId"])
            elif kind == "delivered":
                active.discard(event["orderId"])
        cancelled = {e["orderId"]: e["at"] for e in events if e["kind"] == "order_cancelled"}
        terminal = {o["id"]: o for o in snapshot["orders"]}
        known_members = set().union(*members.values()) if members else set()
        for oid, row in samples.items():
            delay = first_book.get(oid)
            censor = min(cancelled.get(oid, snapshot["endsAt"]), snapshot["endsAt"]) - row["at"]
            mapped = oid in known_members
            row.update(bookingDelay=None if delay is None else delay-row["at"], observedMinutes=max(0, censor), booking120=None if not mapped or (delay is None and censor < 120) else int(delay is not None and delay-row["at"] <= 120), dropped=None if not mapped or oid in cancelled else int(oid in drops), late=None)
            order = terminal.get(oid)
            if order and order["status"] != "cancelled":
                row["late"] = int(any(at is None or at > order["deadline"] for at in order["deliveredAt"]))
            rows.append(row)
        weeks.append({"seed": seed, "worldId": world, "level": meta["level"], "eventsSha256": hashlib.sha256(events_path.read_bytes()).hexdigest(), "rows": len(samples)})
    output = {"features": names, "weeks": weeks, "rows": rows, "limitations": ["Accepted-order prediction, not causal payment or acceptance effects.", "Targets use final gig membership; cancelled/shortened routes can lose membership. Unmapped outcomes remain censored.", "Booking is measured from award, including posting delay; payments at posting are unavailable in old logs.", "Training and model comparison are development only. Seed and IDs are grouping keys, never features."]}
    path = ROOT / "runs/booking-response-data.json"
    path.write_text(json.dumps(output))
    print(json.dumps({"path": str(path), "weeks": len(weeks), "rows": len(rows)}))


if __name__ == "__main__":
    build()
