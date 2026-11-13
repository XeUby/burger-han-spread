#!/usr/bin/env python3
"""Compare the frozen baseline and candidate on every reserved validation week."""

import argparse
import hashlib
import json
import math
import random
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path


BASELINE_REVISION = "c440065717076cc4d14d2aae3b395f15a98efbc35cb3dfcc3d47f18813f39be6"
BASELINE_SETTINGS = {
    "price": 1.42, "fee": 1.05, "margin": 0.28, "capacity": 0.18,
    "maxKm": 400, "minDrivers": 12, "notes": True,
}
CANDIDATE_LABEL = "validation-candidate"
BOOTSTRAP_SAMPLES = 10000
BOOTSTRAP_SEED = 20261113
ROOT = Path(__file__).resolve().parent.parent


def compare(rows, manifest):
    seeds = manifest.get("seeds")
    candidate_label = manifest.get("candidateLabel", CANDIDATE_LABEL)
    if not isinstance(seeds, list) or len(seeds) != 8 or len(set(seeds)) != 8:
        raise ValueError("Expected exactly eight distinct reserved validation seeds")
    if not all(isinstance(seed, str) and seed for seed in seeds):
        raise ValueError("Every validation seed must be a nonempty string")
    outside = [row.get("seed") for row in rows if row.get("label") == candidate_label and row.get("seed") not in seeds]
    if outside:
        raise ValueError(f"Candidate validation rows use unreserved seeds: {outside}")

    pairs = []
    issues = []
    for seed in seeds:
        baseline = [row for row in rows if row.get("seed") == seed and row.get("revision") == BASELINE_REVISION and row.get("settings") == BASELINE_SETTINGS]
        candidate = [row for row in rows if row.get("seed") == seed and row.get("label") == candidate_label]
        for label, matches in [("baseline", baseline), ("candidate", candidate)]:
            if len(matches) != 1:
                issues.append(f"{seed}: expected one {label}, found {len(matches)}")
        if len(baseline) == len(candidate) == 1:
            pairs.append({"seed": seed, "baseline": validate_row(baseline[0]), "candidate": validate_row(candidate[0])})
    if issues:
        raise ValueError("Incomplete or duplicate paired validation:\n" + "\n".join(issues))

    revisions = {pair["candidate"]["revision"] for pair in pairs}
    settings = {json.dumps(pair["candidate"]["settings"], sort_keys=True) for pair in pairs}
    if len(revisions) != 1 or len(settings) != 1:
        raise ValueError("Validation candidate changed source revision or settings between weeks")
    world_ids = [pair[side]["worldId"] for pair in pairs for side in ["baseline", "candidate"]]
    if len(set(world_ids)) != len(world_ids):
        raise ValueError("A validation world appears more than once")

    differences = []
    for pair in pairs:
        difference = pair["candidate"]["marginCents"] - pair["baseline"]["marginCents"]
        pair["differenceCents"] = difference
        pair["bothQualified"] = pair["baseline"]["ranked"] and pair["candidate"]["ranked"]
        differences.append(difference)

    baseline = summarize([pair["baseline"] for pair in pairs])
    candidate = summarize([pair["candidate"] for pair in pairs])
    rng = random.Random(BOOTSTRAP_SEED)
    means = sorted(statistics.mean(rng.choices(differences, k=len(differences))) for _ in range(BOOTSTRAP_SAMPLES))
    wins = sum(value > 0 for value in differences)
    losses = sum(value < 0 for value in differences)
    signs = wins + losses
    sign_p = min(1, 2 * sum(math.comb(signs, k) for k in range(min(wins, losses) + 1)) / 2 ** signs) if signs else 1
    return {
        "method": {
            "unit": "complete simulated week",
            "pairedSeeds": seeds,
            "baselineRevision": BASELINE_REVISION,
            "baselineSettings": BASELINE_SETTINGS,
            "candidateLabel": candidate_label,
            "candidateRevision": next(iter(revisions)),
            "candidateSettings": pairs[0]["candidate"]["settings"],
            "bootstrap": {"samples": BOOTSTRAP_SAMPLES, "seed": BOOTSTRAP_SEED, "confidence": 0.95, "method": "paired percentile bootstrap of mean margin difference; resample complete week pairs"},
            "qualificationInterval": "one-sided 95% exact binomial lower bound, assuming independent identically distributed weeks",
            "caveats": [
                "Eight weeks give limited information about rare failures and market conditions.",
                "Bootstrap intervals are descriptive small-sample estimates, not guarantees.",
                "All margins include unqualified weeks; qualification is reported separately.",
                "No runs were selected by performance; exactly one fixed candidate and baseline are required for every reserved seed.",
            ],
        },
        "baseline": baseline,
        "candidate": candidate,
        "paired": {
            "meanDifferenceCents": statistics.mean(differences),
            "medianDifferenceCents": statistics.median(differences),
            "minDifferenceCents": min(differences),
            "maxDifferenceCents": max(differences),
            "totalDifferenceCents": sum(differences),
            "relativeMeanImprovement": (candidate["meanMarginCents"] / baseline["meanMarginCents"] - 1) if baseline["meanMarginCents"] else None,
            "meanDifferenceBootstrap95Cents": [percentile(means, 0.025), percentile(means, 0.975)],
            "wins": wins,
            "ties": len(differences) - wins - losses,
            "losses": losses,
            "twoSidedExactSignTestP": sign_p,
        },
        "weeks": pairs,
    }


def validate_row(row):
    for key in ["worldId", "revision"]:
        if not isinstance(row.get(key), str) or not row[key]:
            raise ValueError(f"Missing {key} in {row.get('seed')}")
    if not isinstance(row.get("settings"), dict):
        raise ValueError(f"Missing settings in {row['worldId']}")
    for key in ["marginCents", "revenueCents", "wonOrders"]:
        if isinstance(row.get(key), bool) or not isinstance(row.get(key), int):
            raise ValueError(f"Invalid integer {key} in {row['worldId']}")
    if row["wonOrders"] < 0 or row["revenueCents"] < 0:
        raise ValueError(f"Negative order count or revenue in {row['worldId']}")
    for key in ["onTimeShare", "undeliveredShare"]:
        if not isinstance(row.get(key), (int, float)) or isinstance(row[key], bool) or not math.isfinite(row[key]) or not 0 <= row[key] <= 1:
            raise ValueError(f"Invalid {key} in {row['worldId']}")
    if not isinstance(row.get("ranked"), bool):
        raise ValueError(f"Invalid qualification flag in {row['worldId']}")
    expected = row["wonOrders"] > 0 and row["onTimeShare"] >= 0.90
    if row["ranked"] != expected:
        raise ValueError(f"Qualification flag disagrees with delivery result in {row['worldId']}")
    result = {key: row[key] for key in ["worldId", "revision", "settings", "marginCents", "revenueCents", "wonOrders", "onTimeShare", "undeliveredShare", "ranked"]}
    for share, count in [("onTimeShare", "onTimeOrders"), ("undeliveredShare", "undeliveredOrders")]:
        value = row[share] * row["wonOrders"]
        if abs(value - round(value)) > 1e-6:
            raise ValueError(f"{share} does not imply a whole order count in {row['worldId']}")
        result[count] = round(value)
    return result


def summarize(rows):
    margins = [row["marginCents"] for row in rows]
    orders = sum(row["wonOrders"] for row in rows)
    on_time = sum(row["onTimeOrders"] for row in rows)
    undelivered = sum(row["undeliveredOrders"] for row in rows)
    qualified = sum(row["ranked"] for row in rows)
    return {
        "weeks": len(rows), "qualifiedWeeks": qualified,
        "qualificationOneSided95Lower": binomial_lower(qualified, len(rows)),
        "meanMarginCents": statistics.mean(margins), "medianMarginCents": statistics.median(margins),
        "minMarginCents": min(margins), "maxMarginCents": max(margins), "totalMarginCents": sum(margins),
        "totalRevenueCents": sum(row["revenueCents"] for row in rows),
        "wonOrders": orders, "onTimeOrders": on_time, "undeliveredOrders": undelivered,
        "aggregateOnTimeShare": on_time / orders if orders else None,
        "aggregateUndeliveredShare": undelivered / orders if orders else None,
        "minOnTimeShare": min(row["onTimeShare"] for row in rows),
    }


def binomial_lower(successes, trials, alpha=0.05):
    if successes == 0:
        return 0
    low, high = 0.0, 1.0
    for _ in range(80):
        p = (low + high) / 2
        tail = sum(math.comb(trials, k) * p ** k * (1 - p) ** (trials - k) for k in range(successes, trials + 1))
        if tail < alpha:
            low = p
        else:
            high = p
    return (low + high) / 2


def percentile(values, quantile):
    position = (len(values) - 1) * quantile
    lower = math.floor(position)
    upper = math.ceil(position)
    return values[lower] + (values[upper] - values[lower]) * (position - lower)


def markdown(report):
    money = lambda cents: f"€{cents / 100:,.2f}"
    share = lambda value: f"{value:.2%}" if value is not None else "n/a"
    b, c, p = report["baseline"], report["candidate"], report["paired"]
    low, high = p["meanDifferenceBootstrap95Cents"]
    lines = [
        "# Paired validation on eight unseen weeks", "",
        f"Candidate mean margin was {money(c['meanMarginCents'])}, compared with {money(b['meanMarginCents'])} for the frozen baseline. The paired mean difference was {money(p['meanDifferenceCents'])} ({share(p['relativeMeanImprovement'])}). Candidate qualification: {c['qualifiedWeeks']}/{c['weeks']}; baseline: {b['qualifiedWeeks']}/{b['weeks']}.", "",
        "| Seed | Baseline margin | Candidate margin | Difference | On time, baseline / candidate | Qualified, baseline / candidate |",
        "| --- | ---: | ---: | ---: | ---: | --- |",
    ]
    for pair in report["weeks"]:
        baseline, candidate = pair["baseline"], pair["candidate"]
        status = lambda row: "yes" if row["ranked"] else "no"
        lines.append(f"| {pair['seed']} | {money(baseline['marginCents'])} | {money(candidate['marginCents'])} | {money(pair['differenceCents'])} | {share(baseline['onTimeShare'])} / {share(candidate['onTimeShare'])} | {status(baseline)} / {status(candidate)} |")
    lines += ["", "| Metric | Baseline | Candidate |", "| --- | ---: | ---: |"]
    for label, key, formatter in [
        ("Mean margin", "meanMarginCents", money), ("Median margin", "medianMarginCents", money),
        ("Minimum margin", "minMarginCents", money), ("Total margin", "totalMarginCents", money),
        ("Minimum on-time share", "minOnTimeShare", share), ("Aggregate on-time share", "aggregateOnTimeShare", share),
        ("Won orders", "wonOrders", str), ("On-time orders", "onTimeOrders", str),
        ("Undelivered orders", "undeliveredOrders", str),
    ]:
        lines.append(f"| {label} | {formatter(b[key])} | {formatter(c[key])} |")
    lines += [
        "", f"The candidate gained margin on {p['wins']} weeks, tied on {p['ties']} and lost on {p['losses']}. Median paired difference: {money(p['medianDifferenceCents'])}; worst difference: {money(p['minDifferenceCents'])}. The exact two-sided sign-test p-value is {p['twoSidedExactSignTestP']:.4f}.", "",
        f"The paired 95% percentile bootstrap interval for mean margin difference is [{money(low)}, {money(high)}], using 10,000 resamples and random seed {BOOTSTRAP_SEED}. Each resample draws whole paired weeks; individual orders are not treated as independent.", "",
        f"Candidate qualification has a one-sided 95% exact binomial lower bound of {share(c['qualificationOneSided95Lower'])}, assuming independent identically distributed weeks. Eight weeks cannot establish a very low disqualification rate. The bootstrap interval is a small-sample estimate, not a guarantee. Margins include all weeks, including any unqualified week.", "",
        f"Baseline revision: `{report['method']['baselineRevision']}`. Candidate revision: `{report['method']['candidateRevision']}`. Settings, world identifiers and full counts are in [optimization-validation.json](optimization-validation.json).", "",
        "Every reserved seed must contain exactly one baseline with the original revision and settings, and exactly one candidate under the same candidate revision and settings. Missing or duplicate runs abort report generation. Validation outcomes must not be used to retune the candidate while retaining an unseen-validation claim.", "",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", type=Path, default=ROOT / "runs/results.jsonl")
    parser.add_argument("--seeds", type=Path, default=ROOT / "experiments/holdout-seeds.json")
    parser.add_argument("--out-dir", type=Path, default=ROOT / "docs")
    args = parser.parse_args()
    try:
        data = args.results.read_bytes()
        manifest_data = args.seeds.read_bytes()
        rows = []
        for number, line in enumerate(data.decode().splitlines(), 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid results JSON on line {number}: {error}") from error
            if not isinstance(row, dict):
                raise ValueError(f"Results line {number} is not an object")
            rows.append(row)
        report = compare(rows, json.loads(manifest_data))
        report["provenance"] = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "resultsFile": str(args.results.resolve()), "resultsSha256": hashlib.sha256(data).hexdigest(),
            "seedManifestFile": str(args.seeds.resolve()), "seedManifestSha256": hashlib.sha256(manifest_data).hexdigest(),
        }
        args.out_dir.mkdir(parents=True, exist_ok=True)
        (args.out_dir / "optimization-validation.json").write_text(json.dumps(report, indent=2) + "\n")
        (args.out_dir / "optimization-validation.md").write_text(markdown(report))
        print(json.dumps({"baseline": report["baseline"], "candidate": report["candidate"], "paired": report["paired"]}, indent=2))
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(2, f"Validation comparison failed: {error}\n")


if __name__ == "__main__":
    main()
