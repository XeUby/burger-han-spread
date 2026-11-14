#!/usr/bin/env python3
"""Compare only the explicit frozen baseline/candidate worlds in a validation manifest."""

import argparse
import hashlib
import json
import math
import random
import statistics
from datetime import datetime, timezone
from pathlib import Path

from compare import percentile, summarize, validate_row

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BOOTSTRAP_SEED = 20261114


def validate_manifest(manifest):
    if not manifest.get("selectionFrozenAt"):
        raise ValueError("The manifest must record selectionFrozenAt before validation outcomes are read")
    datetime.fromisoformat(manifest["selectionFrozenAt"].replace("Z", "+00:00"))
    pairs = manifest.get("pairs", [])
    if not isinstance(pairs, list) or len(pairs) < 2:
        raise ValueError("At least two explicit paired weeks are required")
    seeds = [pair.get("seed") for pair in pairs]
    if any(not isinstance(seed, str) or not seed for seed in seeds) or len(seeds) != len(set(seeds)):
        raise ValueError("Pairs must have distinct nonempty seeds")
    worlds = [pair.get(f"{side}WorldId") for pair in pairs for side in ["baseline", "candidate"]]
    if any(not isinstance(world, str) or not world.startswith("w") or not world.isalnum() for world in worlds) or len(worlds) != len(set(worlds)):
        raise ValueError("World identifiers must be explicit and unique")
    for side in ["baseline", "candidate"]:
        policy = manifest.get(side, {})
        if not isinstance(policy.get("revision"), str) or len(policy["revision"]) != 64 or any(c not in "0123456789abcdef" for c in policy["revision"]):
            raise ValueError(f"{side} requires an exact SHA-256 source revision")
        if not isinstance(policy.get("settings"), dict) or not policy["settings"]:
            raise ValueError(f"{side} requires exact settings")
    bootstrap = manifest.get("bootstrap", {})
    samples, seed = bootstrap.get("samples", 10000), bootstrap.get("seed", DEFAULT_BOOTSTRAP_SEED)
    if type(samples) is not int or not 1000 <= samples <= 1000000 or type(seed) is not int:
        raise ValueError("Bootstrap requires 1,000–1,000,000 samples and an integer random seed")
    return samples, seed


def order_counts(orders):
    active = [order for order in orders if order["status"] != "cancelled"]
    late = []
    undelivered = []
    for order in active:
        if len(order["deliveredAt"]) != len(order["legs"]):
            raise ValueError(f"Mismatched delivery legs for {order['id']}")
        deadlines = [min(order["deadline"], leg["delivery"]["window"]["to"] + 30) if leg["delivery"]["privateAddress"] else order["deadline"] for leg in order["legs"]]
        if any(at is None for at in order["deliveredAt"]):
            undelivered.append(order["id"])
        if any(at is None or at > deadline for at, deadline in zip(order["deliveredAt"], deadlines)):
            late.append(order["id"])
    return {"wonOrders": len(active), "onTimeOrders": len(active) - len(late), "undeliveredOrders": len(undelivered), "lateOrderIds": late, "undeliveredOrderIds": undelivered}


def load_world(root, world_id, seed, expected):
    provenance = {}
    def read(kind):
        path = root / "runs" / f"{world_id}.{kind}.json"
        data = path.read_bytes()
        provenance[kind] = {"path": str(path.resolve()), "sha256": hashlib.sha256(data).hexdigest()}
        return json.loads(data)
    meta = read("meta")
    if meta["worldId"] != world_id or meta["seed"] != seed or meta["revision"] != expected["revision"] or meta["settings"] != expected["settings"]:
        raise ValueError(f"Seed, revision or settings mismatch in explicit world {world_id}")
    snapshot = read("snapshot")
    if snapshot["now"] < snapshot["endsAt"]:
        raise ValueError(f"World {world_id} has not reached its terminal minute")
    score = read("score")
    row = validate_row({**meta, **score})
    counts = order_counts(snapshot["orders"])
    for key in ["wonOrders", "onTimeOrders", "undeliveredOrders"]:
        if counts[key] != row[key]:
            raise ValueError(f"Snapshot {key} does not reconcile to score in {world_id}: {counts[key]} != {row[key]}")
    events = read("events")
    ledger = [event["line"] for event in events if event["kind"] == "ledger"]
    if sum(line["cents"] for line in ledger) != row["marginCents"]:
        raise ValueError(f"Ledger does not reconcile to margin in {world_id}")
    return {**row, **counts, "label": meta.get("label"), "files": provenance}


def calculate(pairs, manifest):
    samples, seed = validate_manifest(manifest)
    differences = [pair["candidate"]["marginCents"] - pair["baseline"]["marginCents"] for pair in pairs]
    if len(pairs) != len(manifest["pairs"]) or [pair["seed"] for pair in pairs] != [pair["seed"] for pair in manifest["pairs"]]:
        raise ValueError("Loaded pairs do not match the entire explicit manifest")
    rng = random.Random(seed)
    means = sorted(statistics.mean(rng.choices(differences, k=len(differences))) for _ in range(samples))
    wins, losses = sum(d > 0 for d in differences), sum(d < 0 for d in differences)
    signs = wins + losses
    sign_p = min(1, 2 * sum(math.comb(signs, k) for k in range(min(wins, losses) + 1)) / 2 ** signs) if signs else 1
    baseline, candidate = (summarize([pair[side] for pair in pairs]) for side in ["baseline", "candidate"])
    return {
        "method": {
            "unit": "complete simulated week, paired by the exact predeclared seed",
            "selectionFrozenAt": manifest["selectionFrozenAt"],
            "baseline": manifest["baseline"], "candidate": manifest["candidate"],
            "unseenDeclaration": manifest.get("unseenDeclaration", "No unseen claim supplied; manifest alone cannot prove historical noninspection."),
            "bootstrap": {"samples": samples, "seed": seed, "confidence": .95, "method": "percentile interval for mean profit difference; resample whole paired weeks"},
            "signTest": "two-sided exact binomial sign test, excluding ties",
            "qualificationBound": "one-sided 95% exact binomial lower bound; requires independent identically distributed weeks",
            "onTimeDefinition": "Every noncancelled order leg must arrive by its deadline; private delivery uses min(order deadline, booked slot end + 30 minutes). Snapshot counts and ledger totals must reconcile to official scores.",
            "limitations": ["A small panel cannot establish a very low disqualification probability.", "Bootstrap intervals are descriptive small-sample estimates, not guarantees.", "All declared weeks remain in mean profit, including unqualified weeks.", "No outcomes are discovered by label or selected by performance; only exact manifest world IDs are opened.", "Do not tune against these outcomes and continue calling the same panel unseen."],
        },
        "baseline": baseline, "candidate": candidate,
        "paired": {"meanDifferenceCents": statistics.mean(differences), "medianDifferenceCents": statistics.median(differences), "minimumDifferenceCents": min(differences), "maximumDifferenceCents": max(differences), "totalDifferenceCents": sum(differences), "relativeMeanImprovement": candidate["meanMarginCents"] / baseline["meanMarginCents"] - 1 if baseline["meanMarginCents"] else None, "meanDifferenceBootstrap95Cents": [percentile(means, .025), percentile(means, .975)], "wins": wins, "ties": len(differences) - signs, "losses": losses, "twoSidedExactSignTestP": sign_p},
        "weeks": [{**pair, "differenceCents": difference} for pair, difference in zip(pairs, differences)],
    }


def markdown(report):
    money = lambda n: f"€{n / 100:,.2f}"
    share = lambda n: f"{n:.2%}" if n is not None else "n/a"
    b, c, p, method = report["baseline"], report["candidate"], report["paired"], report["method"]
    lines = ["# Frozen paired frontier validation", "", f"Candidate mean profit: {money(c['meanMarginCents'])}; baseline: {money(b['meanMarginCents'])}. Paired gain: {money(p['meanDifferenceCents'])} ({share(p['relativeMeanImprovement'])}). Qualified weeks: candidate {c['qualifiedWeeks']}/{c['weeks']}, baseline {b['qualifiedWeeks']}/{b['weeks']}.", "", "| Seed | Baseline profit | Candidate profit | Gain | On-time orders, baseline / candidate | Qualified, baseline / candidate |", "|---|---:|---:|---:|---:|---:|"]
    for pair in report["weeks"]:
        a, z = pair["baseline"], pair["candidate"]
        lines.append(f"| {pair['seed']} | {money(a['marginCents'])} | {money(z['marginCents'])} | {money(pair['differenceCents'])} | {a['onTimeOrders']}/{a['wonOrders']} / {z['onTimeOrders']}/{z['wonOrders']} | {a['ranked']} / {z['ranked']} |")
    low, high = p["meanDifferenceBootstrap95Cents"]
    lines += ["", f"Profit improved on {p['wins']} weeks, tied on {p['ties']} and declined on {p['losses']}. Exact two-sided sign-test p = {p['twoSidedExactSignTestP']:.6f}. The 95% paired bootstrap interval for mean gain is [{money(low)}, {money(high)}], using {method['bootstrap']['samples']:,} resamples and seed {method['bootstrap']['seed']}.", "", f"Candidate minimum on-time share: {share(c['minOnTimeShare'])}; aggregate on-time orders: {c['onTimeOrders']}/{c['wonOrders']}; undelivered: {c['undeliveredOrders']}. The one-sided 95% lower bound on weekly qualification is {share(c['qualificationOneSided95Lower'])}, conditional on independent identically distributed weeks.", "", method["onTimeDefinition"], "", f"Baseline source: `{method['baseline']['revision']}`. Candidate source: `{method['candidate']['revision']}`. Selection frozen: `{method['selectionFrozenAt']}`.", "", "| Seed | Baseline world | Candidate world |", "|---|---|---|"]
    for pair in report["weeks"]:
        lines.append(f"| {pair['seed']} | `{pair['baseline']['worldId']}` | `{pair['candidate']['worldId']}` |")
    lines += ["", "Exact settings, file hashes and counts are in the accompanying JSON report. " + " ".join(method["limitations"]), ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path, default=ROOT / "docs/frontier-validation")
    args = parser.parse_args()
    try:
        data = args.manifest.read_bytes()
        manifest = json.loads(data)
        validate_manifest(manifest)
        pairs = [{"seed": pair["seed"], **{side: load_world(args.root, pair[f"{side}WorldId"], pair["seed"], manifest[side]) for side in ["baseline", "candidate"]}} for pair in manifest["pairs"]]
        report = calculate(pairs, manifest)
        report["provenance"] = {"generatedAt": datetime.now(timezone.utc).isoformat(), "manifest": str(args.manifest.resolve()), "manifestSha256": hashlib.sha256(data).hexdigest()}
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
        args.output.with_suffix(".md").write_text(markdown(report))
        print(json.dumps({key: report[key] for key in ["baseline", "candidate", "paired"]}, indent=2))
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(2, f"Validation report refused: {error}\n")


if __name__ == "__main__":
    main()
