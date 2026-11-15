"""One row per won single-car order: what the dispatcher knew when the request came, and what the car then cost."""
import json, collections, sys
sys.stdout.reconfigure(encoding="utf-8")
R = "C:/Users/boris/bh-y3/runs/"
rows = [json.loads(l) for l in open(R + "results.jsonl", encoding="utf-8")]
labels = {"pairopen180", "rescuecap", "rescuecap2", "v3head", "due135cap", "cand1", "final1", "cap045", "backlog012", "cost105", "v3-open", "v3-soft05", "v3-soft10", "v3-soft20", "md3", "md5", "far1000", "pq060", "pq080", "v3-trade", "v3-fresh", "bl010", "cap040", "gate-l13", "gate-s05-l15", "sdb8"}
mp = json.load(open("C:/Users/boris/bh-data/harvest/map.json", encoding="utf-8"))
km = {(r["from"], r["to"]): r["km"] for r in mp["roads"]}
dist = lambda a, b: 0 if a == b else km[(a, b)]
out = open("C:/Users/boris/bh-data/cost.jsonl", "w"); n = 0
for r in [r for r in rows if r.get("label") in labels]:
    w = r["worldId"]
    try:
        ev = json.load(open(R + w + ".events.json", encoding="utf-8")); snap = json.load(open(R + w + ".snapshot.json", encoding="utf-8")); drivers = json.load(open(R + w + ".drivers.json", encoding="utf-8"))
    except Exception: continue
    homes = collections.Counter(d["homePlaceId"] for d in drivers)
    sup = lambda p: sum(c * (1 if dist(h, p) <= 35 else 0.35 if dist(h, p) <= 70 else 0) for h, c in homes.items())
    supc = {}
    req = {e["request"]["id"]: e["request"] for e in ev if e["kind"] == "price_request"}
    go = collections.defaultdict(set); gig_of = collections.defaultdict(list)
    for g in snap["gigs"]:
        for s in g["stops"]:
            go[g["id"]].add(s["orderId"])
            if s["kind"] == "pickup": gig_of[s["orderId"]].append(g["id"])
    booked = {}
    for e in ev:
        if e["kind"] == "gig_booked": booked.setdefault(e["gigId"], e["at"])
    firstbook = {o: min((booked[g] for g in gs if g in booked), default=10**9) for o, gs in gig_of.items()}
    money = collections.defaultdict(lambda: collections.Counter())
    for e in ev:
        if e["kind"] != "ledger": continue
        l = e["line"]; ids = [l["orderId"]] if l.get("orderId") else list(go.get(l.get("gigId"), []))
        for i in ids: money[i][l["kind"]] += l["cents"] / len(ids) / 100
    final = {o["id"]: o for o in snap["orders"]}
    won = [e for e in ev if e["kind"] == "order_won"]
    live = []  # (order, won at) of earlier wins
    for e in won:
        o = e["order"]; t = e["at"]; q = req.get(o["id"])
        if not q or len(o["legs"]) != 1:
            live.append((o, t)); continue
        l = o["legs"][0]
        if l["pickup"]["privateAddress"] or l["delivery"]["privateAddress"]:
            live.append((o, t)); continue
        p, d = l["pickup"]["placeId"], l["delivery"]["placeId"]
        day = l["pickup"]["window"]["from"] // 1440
        load = unb = 0.0
        for (x, tx) in live:
            fo = final.get(x["id"])
            if fo and fo["status"] == "cancelled": continue
            xl = x["legs"][0]
            if xl["pickup"]["window"]["from"] // 1440 != day: continue
            dd = dist(p, xl["pickup"]["placeId"])
            if dd > 70: continue
            wgt = 1 if dd <= 30 else 0.5
            done = fo and fo["deliveredAt"][0] is not None and fo["deliveredAt"][0] <= t
            if done: continue
            load += wgt
            if firstbook.get(x["id"], 10**9) > t: unb += wgt
        live.append((o, t))
        fo = final.get(o["id"])
        if not fo or fo["status"] == "cancelled": continue
        if p not in supc: supc[p] = sup(p)
        if d not in supc: supc[d] = sup(d)
        m = money[o["id"]]
        dl = fo["deadline"]; dv = fo["deliveredAt"][0]
        late = dv is None or dv > dl
        out.write(json.dumps(dict(w=w, label=r["label"], km=dist(p, d), ref=q["referenceFeeCents"] / 100, price=o["priceCents"] / 100, option=o["option"],
            slack=(o["lastPickupAt"] - max(t, l["pickup"]["window"]["from"])) / 60, sup=supc[p], supd=supc[d], hour=(t % 1440) // 60, weekday=(t // 1440) % 7,
            load=load, unbooked=unb, premium=l["car"]["premium"], fee=-m["driver_fee"], refund=-m["late_refund"], other=-(m["fine"] + m["failed_visit"] + m["release_fee"] + m.get("waiting", 0)), late=late)) + "\n"); n += 1
print("rows", n)
