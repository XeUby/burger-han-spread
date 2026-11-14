"""Audit the frozen portfolio panel, including every unstarted or failed trial."""

import hashlib
import json
import statistics
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from research.value.report import load_world, paired, summarize


def read(path):
    return json.loads(Path(path).read_text())


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def solver_audit(decisions):
    solves = [d for d in decisions if d["kind"] == "portfolio_solve"]
    actions = [d for d in decisions if d["kind"] == "portfolio_action"]
    executed = [d for d in actions if (d.get("result") or {}).get("ok")]
    changed_quotes = sum(d["plan"].get("changedQuote", False) for d in executed)
    bundles = sum(d["action"]["type"] == "post" and len({s["orderId"] for s in d["action"]["stops"]}) > 1 for d in executed)
    paid_posts = sum(d["action"]["type"] == "post" and (d["plan"].get("multiplier") or 1) > 1 for d in executed)
    return {
        "solves": len(solves),
        "statuses": dict(Counter(d["result"]["status"] for d in solves)),
        "fallbacks": sum(d["result"]["usedBaselineFallback"] for d in solves),
        "omittedCandidates": sum(d["omitted"] for d in solves),
        "largestCandidateSet": max((len(d["input"]["alternatives"]) for d in solves), default=0),
        "framesWithFutureValue": sum(any(o["futureCents"] != 0 for c in d["input"]["alternatives"] for o in c.get("outcomes", [])) for d in solves),
        "framesWithPaymentChoices": sum(any((p.get("multiplier") or 1) > 1 for p in d.get("plans", {}).values()) for d in solves),
        "actions": dict(Counter(d["action"]["type"] for d in actions)),
        "changedQuotes": changed_quotes,
        "anchoredQuotes": sum(d["plan"]["kind"] == "quote" and bool(d["plan"].get("anchor")) for d in executed),
        "bundledPosts": bundles,
        "higherPaidPosts": paid_posts,
        "meaningfulActions": changed_quotes + bundles + paid_posts,
        "withdrawals": [{"at": d["at"], "action": d["action"], "result": d.get("result")} for d in decisions if d["kind"] == "portfolio_withdraw"],
        "heldOverflow": sum(d["kind"] == "portfolio_overflow" for d in decisions),
        "neutralDeadlineExpirations": sum(d["kind"] == "portfolio_baseline_expired" for d in decisions),
    }


def main():
    plan_path = ROOT / (sys.argv[1] if len(sys.argv) > 1 else "experiments/portfolio-development-v1.json")
    plan = read(plan_path)
    for name, expected in plan["files"].items():
        assert sha(ROOT / plan["bundle"] / name) == expected, name
    assert sha(ROOT / plan["protocol"]) == plan["protocolSha256"]
    source = hashlib.sha256()
    for path in sorted((ROOT / plan["bundle"] / "src").glob("*.ts")):
        source.update(path.name.encode())
        source.update(path.read_bytes())
    revision = source.hexdigest()
    attempt_path = ROOT / plan["attempts"]
    attempts = [json.loads(line) for line in attempt_path.read_text().splitlines() if line] if attempt_path.exists() else []
    key = lambda row: (row["level"], row["seed"], row["label"])
    expected = {key(r): r for r in plan["trials"]}
    assert len(expected) == len(plan["trials"]), "Duplicate planned trial"
    created = {}
    for event in attempts:
        if event["event"] == "created":
            assert key(event) in expected and key(event) not in created, "Unknown or repeated trial"
            created[key(event)] = event
    extras = {"firstOptionOnly": False, "openingCostAdmission": False, "actionGuard": False, "capacityValue": False, "routeValue": False, "driverValue": False, "paymentProbe": False, "randomSeed": 1, "portfolio": False, "futureValue": False, "paymentChoice": False}
    base = read(ROOT / "experiments/final-config.json")
    records = []
    for k, trial in expected.items():
        row = {"level": trial["level"], "seed": trial["seed"], "label": trial["label"], "status": "pending"}
        start = created.get(k)
        if not start:
            records.append(row)
            continue
        world = start["worldId"]
        row["worldId"] = world
        row["runtimeFailures"] = [a for a in attempts if a["event"] == "failed" and a.get("worldId") == world]
        row["status"] = "failed" if row["runtimeFailures"] else "running"
        artifact = lambda kind: ROOT / f"runs/{world}.{kind}.json"
        row["artifactHashes"] = {kind: sha(artifact(kind)) for kind in ["meta", "events", "snapshot", "score", "errors", "recoveries", "decisions"] if artifact(kind).exists()}
        if artifact("decisions").exists():
            decisions = read(artifact("decisions"))
            row["mechanisms"] = dict(Counter(d["kind"] for d in decisions))
            row["planner"] = solver_audit(decisions)
            row["chargingRisks"] = [d for d in decisions if d["kind"] == "booked_charge_risk"]
        if not any(a["event"] == "completed" and a.get("worldId") == world for a in attempts):
            records.append(row)
            continue
        assert not row["runtimeFailures"], "A failed attempt cannot be a clean completion"
        result = load_world(ROOT, world, trial["seed"], {"revision": revision, "settings": {**base, **extras, **trial["settings"]}})
        events = read(artifact("events"))
        ledger = Counter()
        for e in events:
            if e["kind"] == "ledger":
                ledger[e["line"]["kind"]] += e["line"]["cents"]
        assert sum(ledger.values()) == result["marginCents"]
        score_keys = ["marginCents", "revenueCents", "wonOrders", "onTimeOrders", "onTimeShare", "undeliveredOrders", "ranked"]
        row.update(status="complete", score={k: result[k] for k in score_keys}, ledger=dict(ledger), failedVisits=sum(e["kind"] == "visit_failed" for e in events), actionErrors=read(artifact("errors")), recoveries=read(artifact("recoveries")))
        row["fines"] = [e for e in events if e["kind"] == "ledger" and e["line"]["kind"] == "fine"]
        records.append(row)
    terminal = all(r["status"] == "complete" for r in records) and not any(a["event"] == "failed" for a in attempts)
    report = {"generatedAt": datetime.now(timezone.utc).isoformat(), "role": "Adaptive development only; no confirmatory or multiplicity-adjusted claims", "planSha256": sha(plan_path), "policyRevision": revision, "terminal": terminal, "completed": sum(r["status"] == "complete" for r in records), "expected": len(records), "uniqueSeedBlocks": len({r["seed"] for r in records}), "records": records, "summary": {}, "contrasts": {}, "selectedForValidation": None}
    archived = {"09": "wccca731d04dbfacbaba0", "10": "w7b412da927edcef0081e", "14": "w2464fa0a1a5ce6878d47", "15": "w657d3e2075cdc8dcb443"}
    replications = []
    for row in records:
        if row["status"] != "complete" or not row["label"].endswith("-benchmark"):
            continue
        old = archived[row["seed"].split("-")[-1]]
        new = row["worldId"]
        replications.append({"seed": row["seed"], "archivedWorld": old, "newWorld": new, "identicalEvents": sha(ROOT / f"runs/{old}.events.json") == sha(ROOT / f"runs/{new}.events.json"), "identicalScore": read(ROOT / f"runs/{old}.score.json") == read(ROOT / f"runs/{new}.score.json")})
    report["benchmarkReplications"] = replications
    if terminal:
        by_arm = {arm: [r for r in records if r["label"].endswith("-" + arm)] for arm in ["benchmark", "planner", "future", "payments"]}
        control = {r["seed"]: r for r in by_arm["benchmark"]}
        control_summary = summarize(by_arm["benchmark"])
        gate = read(ROOT / plan["protocol"])["developmentGate"]
        for arm, rows in by_arm.items():
            summary = summarize(rows)
            summary["versusBenchmark"] = paired([r["score"]["marginCents"] - control[r["seed"]]["score"]["marginCents"] for r in rows])
            kinds = set().union(*(r["ledger"] for r in rows), *(r["ledger"] for r in control.values()))
            summary["meanLedgerDifferenceEuros"] = {kind: statistics.mean(r["ledger"].get(kind, 0) - control[r["seed"]]["ledger"].get(kind, 0) for r in rows) / 100 for kind in sorted(kinds)}
            assert abs(sum(summary["meanLedgerDifferenceEuros"].values()) - summary["versusBenchmark"]["meanEuros"]) < 1e-6
            summary["planner"] = {name: sum(r["planner"][name] for r in rows) for name in ["solves", "fallbacks", "omittedCandidates", "framesWithFutureValue", "framesWithPaymentChoices", "changedQuotes", "anchoredQuotes", "bundledPosts", "higherPaidPosts", "meaningfulActions", "heldOverflow", "neutralDeadlineExpirations"]}
            checks = {"profit": summary["versusBenchmark"]["meanEuros"] >= gate["meanPairedGainEuros"], "qualification": summary["qualified"] == summary["weeks"], "weeklyOnTime": summary["minimumOnTime"] >= gate["minimumWeeklyOnTime"], "aggregateOnTime": summary["aggregateOnTime"] >= control_summary["aggregateOnTime"] - gate["maximumAggregateOnTimeDrop"], "undelivered": summary["undelivered"] == gate["undelivered"], "failedVisits": summary["failedVisits"] == gate["failedVisits"], "operations": not any(r["runtimeFailures"] for r in rows), "mechanismExercised": summary["planner"]["meaningfulActions"] > 0}
            summary["developmentChecks"] = checks
            summary["developmentGatePassed"] = arm != "benchmark" and all(checks.values())
            report["summary"][arm] = summary
        indexed = {arm: {r["seed"]: r["score"]["marginCents"] for r in rows} for arm, rows in by_arm.items()}
        for name, a, b in [("futureIncrement", "future", "planner"), ("paymentIncrement", "payments", "future")]:
            report["contrasts"][name] = paired([indexed[a][s] - indexed[b][s] for s in sorted(control)])
        passing = [(a, s) for a, s in report["summary"].items() if s["developmentGatePassed"]]
        if passing and len(replications) == 4 and all(r["identicalEvents"] and r["identicalScore"] for r in replications):
            report["selectedForValidation"] = max(passing, key=lambda item: item[1]["versusBenchmark"]["meanEuros"])[0]
    report["limitations"] = ["Four familiar underlying seed blocks; sixteen worlds are not sixteen independent weeks.", "All confidence intervals are descriptive under IID-week assumptions. Four successes imply only a 47.3% one-sided 95% qualification lower bound. Bootstrap cannot reveal unseen tails.", "An operational interruption leaves the panel incomplete; complete-case means are not used to select a finalist.", "Payment and tail models contain explicit unvalidated assumptions. Solver optimality is restricted to the supplied finite model.", "No result here promotes a policy, establishes rank, or proves a global optimum."]
    output = ROOT / f"docs/{plan_path.stem}-results.json"
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: report[k] for k in ["terminal", "completed", "expected", "selectedForValidation", "summary", "contrasts"]}, indent=2))


if __name__ == "__main__":
    main()
