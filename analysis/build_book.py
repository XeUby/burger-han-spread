"""Single-car gigs from every recorded week: opening fee, features, and whether a driver took the gig at its opening fee in time."""
import json, glob, os, collections, sys
sys.stdout.reconfigure(encoding="utf-8")
roads = {(r["from"], r["to"]): r for r in json.load(open("C:/Users/boris/bh-data/harvest/map.json"))["roads"]}
km = lambda a, b: 0 if a == b else roads[(a, b)]["km"]
out = open("C:/Users/boris/bh-data/book.jsonl", "w"); n = 0; seen = set()
dirs = ["C:/Users/boris/bh-data/harvest", "C:/Users/boris/bh-y3/runs", "C:/Users/boris/bh-y2/runs", "C:/Users/boris/bh-champion/runs", "C:/Users/boris/burger-han-spread/runs"]
for d in dirs:
    for f in sorted(glob.glob(d + "/*.events.json")):
        wid = os.path.basename(f).split(".")[0]
        if wid in seen or not os.path.exists(f.replace(".events", ".snapshot")) or not os.path.exists(f.replace(".events", ".drivers")): continue
        seen.add(wid)
        try:
            ev = json.load(open(f, encoding="utf-8")); snap = json.load(open(f.replace(".events", ".snapshot"), encoding="utf-8")); drivers = json.load(open(f.replace(".events", ".drivers"), encoding="utf-8"))
        except Exception: continue
        homes = collections.Counter(x["homePlaceId"] for x in drivers)
        won = {e["order"]["id"]: e["order"] for e in ev if e["kind"] == "order_won"}
        refs = {e["request"]["id"]: e["request"]["referenceFeeCents"] for e in ev if e["kind"] == "price_request"}
        if not won or len(won) < 30: continue
        booked = {}
        for e in ev:
            if e["kind"] == "gig_booked": booked.setdefault(e["gigId"], (e["at"], e.get("feeCents")))
        firstgig = set()
        for g in sorted(snap["gigs"], key=lambda g: g["postedAt"]):
            ids = {s["orderId"] for s in g["stops"]}
            if len(ids) != 1: continue
            oid = next(iter(ids)); o = won.get(oid)
            if not o or len(o["legs"]) != 1 or oid in firstgig: continue
            firstgig.add(oid)
            leg = o["legs"][0]
            if leg["pickup"]["privateAddress"] or leg["delivery"]["privateAddress"]: continue
            p, q = leg["pickup"]["placeId"], leg["delivery"]["placeId"]
            sup = sum(c * (1 if km(h, p) <= 35 else 0.35 if km(h, p) <= 70 else 0) for h, c in homes.items())
            supd = sum(c * (1 if km(h, q) <= 35 else 0.35 if km(h, q) <= 70 else 0) for h, c in homes.items())
            req_ref = None
            open0 = g["schedule"][0]["feeCents"]
            b = booked.get(g["id"])
            posted = g["postedAt"]; ready = leg["pickup"]["window"]["from"]; lp = o["lastPickupAt"]
            ok = bool(b) and b[0] <= lp - 180 and (b[1] is None or b[1] <= open0 * 1.001)
            if oid not in refs: continue
            row = dict(w=wid, ref=refs[oid], m=open0 / refs[oid], km=km(p, q), sup=round(sup, 1), supd=round(supd, 1), open=open0, posted=posted, ready=ready, lp=lp, slack=(lp - max(posted, ready)) / 60,
                       day=(max(posted, ready) // 1440) % 7, hour=(max(posted, ready) % 1440) // 60, premium=leg["car"]["premium"], ok=ok, any_time=bool(b) and b[0] <= lp - 180, oid=oid)
            out.write(json.dumps(row) + "\n"); n += 1
print("worlds", len(seen), "gigs", n)
