import collections
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy.optimize import minimize
from scipy.sparse import csr_matrix
from scipy.special import expit


ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / "runs"
OUT = ROOT / "analysis"
roads = {(road["from"], road["to"]): road["km"] for road in json.loads((ROOT / "docs/map.json").read_text())["roads"]}
selection = json.loads((OUT / "market-training-selection.json").read_text())
selected = selection["worlds"]
if len(selected) != 24 or len({row["worldId"] for row in selected}) != 24 or len({row["seed"] for row in selected}) != 24:
    raise ValueError("Expected the frozen 24-world, 24-seed training allowlist")
if any(row["seed"].startswith("frontier") for row in selected):
    raise ValueError("Frontier worlds cannot enter the frozen training set")


def extract(row):
    world = row["worldId"]
    revealed = json.loads((RUNS / f"{world}.reveal.json").read_text())
    quotes = {item["request"]["id"]: item for item in revealed["requests"]}
    events = json.loads((RUNS / f"{world}.events.json").read_text())
    trust = collections.Counter()
    orders = {}
    observations = []
    pending = {}
    for event in events:
        if event["kind"] == "price_request":
            request = event["request"]
            item = quotes[request["id"]]
            if not item["quote"] or min(item["quote"].values()) > 1000000:
                continue
            leg = request["legs"][0]
            ratio = min(item["quote"][option["kind"]] / option["listPriceCents"] for option in request["options"] if option["kind"] in item["quote"]) / (1 + 0.01 * trust[request["dealerId"]])
            observation = {
                "features": {"day": request["arrivedAt"] // 1440, "origin": leg["pickup"]["placeId"], "destination": leg["delivery"]["placeId"], "dealer": request["dealerId"], "km": roads[leg["pickup"]["placeId"], leg["delivery"]["placeId"]]},
                "ratio": ratio, "won": item["outcome"] == "won", "quoteSeq": event["seq"], "requestId": request["id"],
            }
            pending[request["id"]] = observation
        elif event["kind"] in ["order_won", "order_lost"]:
            identity = event["order"]["id"] if event["kind"] == "order_won" else event["requestId"]
            if event["kind"] == "order_won":
                orders[identity] = event["order"]
            if identity in pending:
                observation = pending.pop(identity)
                observation["outcomeSeq"] = event["seq"]
                observations.append(observation)
        elif event["kind"] == "delivered":
            order = orders.get(event["orderId"])
            if not order or len(order["legs"]) != 1:
                continue
            dealer = order["dealerId"]
            trust[dealer] = min(25, trust[dealer] + 1) if event["at"] <= order["deadline"] else trust[dealer] // 2
    return {"seed": row["seed"], "worldId": world, "fold": int(hashlib.sha256(row["seed"].encode()).hexdigest(), 16) % 5, "observations": observations}


data_file = OUT / "market-training-data.json"
worlds = json.loads(data_file.read_text()) if data_file.exists() else [extract(row) for row in selected]
if {(world["seed"], world["worldId"], world["fold"]) for world in worlds} != {(world["seed"], world["worldId"], world["fold"]) for world in selected}:
    raise ValueError("Cached training data does not match the explicit world allowlist")
data_file.write_text(json.dumps(worlds))


def fit(training, variant):
    keys = {}
    deviations = []
    counts = collections.Counter()
    records = []
    targets = []
    offsets = []
    for world in training:
        for item in world["observations"]:
            f = item["features"]
            terms = [("intercept", 1, 0.3), (f"origin:{f['origin']}", 1, 0.07), (f"destination:{f['destination']}", 1, 0.07), (f"world:{world['seed']}", 1, 0.18), (f"day:{world['seed']}:{f['day']}", 1, 0.2)]
            if variant in ["dealer", "lane"]:
                terms += [(f"dealer:{f['dealer']}", 1, 0.12), ("distance", min(2, max(-1, (f["km"] - 200) / 200)), 0.05)]
            if variant == "lane":
                terms += [(f"lane:{f['origin']}:{f['destination']}", 1, 0.06)]
            record = []
            for key, value, deviation in terms:
                if key not in keys:
                    keys[key] = len(keys)
                    deviations.append(deviation)
                record.append((keys[key], value * 14))
                counts[key] += 1
            records.append(record)
            targets.append(int(item["won"]))
            offsets.append(14 * (1.4 - item["ratio"]))
    ii, jj, vv = [], [], []
    for i, record in enumerate(records):
        for j, value in record:
            ii.append(i); jj.append(j); vv.append(value)
    design = csr_matrix((vv, (ii, jj)), shape=(len(records), len(keys)))
    y = np.array(targets)
    offset = np.array(offsets)
    precision = 1 / np.square(deviations)
    def objective(coef):
        eta = offset + design @ coef
        loss = np.logaddexp(0, eta).sum() - y @ eta + 0.5 * np.sum(precision * coef ** 2)
        gradient = design.T @ (expit(eta) - y) + precision * coef
        return loss, gradient
    result = minimize(objective, np.zeros(len(keys)), jac=True, method="L-BFGS-B", options={"maxiter": 500, "ftol": 1e-10})
    if not result.success:
        raise RuntimeError(result.message)
    coefficients = {key: float(result.x[index]) for key, index in keys.items() if not key.startswith(("world:", "day:"))}
    return {"variant": variant, "trainingSeeds": [world["seed"] for world in training], "n": len(records), "coefficients": coefficients, "counts": {key: counts[key] for key in coefficients}, "objective": float(result.fun)}


fits = []
for variant in ["places", "dealer", "lane"]:
    for fold in range(5):
        model = fit([world for world in worlds if world["fold"] != fold], variant)
        model["fold"] = fold
        fits.append(model)
        print(variant, fold, model["n"], round(model["coefficients"]["intercept"], 4))
(OUT / "market-prior-cross-validation.json").write_text(json.dumps(fits))
final = fit(worlds, "places")
(OUT / "market-prior-fit.json").write_text(json.dumps(final, indent=2) + "\n")
artifact = {"kind": "regularized origin/destination threshold prior", "slope": 14, "trainingWorlds": selected, "quoteCount": final["n"], "coefficients": final["coefficients"]}
(ROOT / "src/place-prior.ts").write_text("export const placePrior = " + json.dumps(artifact, indent=2) + " as const\n")
print("Worlds", len(worlds), "quotes", sum(len(world["observations"]) for world in worlds))
