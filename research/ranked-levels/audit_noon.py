"""Check all twenty frozen ranking attempts against terminal and official evidence."""

import hashlib
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from scipy.stats import beta

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "analysis"))
from frontier_validation import order_counts

read = lambda p: json.loads((ROOT / p).read_text())
sha = lambda p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest()
protocol = read("experiments/levels-noon-protocol.json")
inventory = read("runs/levels-noon-server.json")
for file, expected in protocol["sourceFiles"].items():
    assert sha(file) == expected, file
assert sha("research/ranked-levels/noon.ts") == protocol["launcherSha256"]
attempts = [json.loads(line) for line in (ROOT / "experiments/levels-noon-ranked-attempts.jsonl").read_text().splitlines() if line]
created = [r for r in attempts if r["event"] == "created"]
assert len({(r["level"], r["run"]) for r in created}) == len(created)
assert all(r["level"] in [1,2,3,4] and 1 <= r["run"] <= 5 for r in created)
extras = {"firstOptionOnly": False, "openingCostAdmission": False, "actionGuard": False, "capacityValue": False, "routeValue": False, "driverValue": False, "paymentProbe": False, "randomSeed": 1, "portfolio": False, "futureValue": False, "paymentChoice": False}
base = read("experiments/final-config.json")
rows = []
for level in [1,2,3,4]:
    for run_number in range(1,6):
        start = next((r for r in created if r["level"] == level and r["run"] == run_number), None)
        row = {"level": level, "run": run_number, "status": "pending"}
        if not start:
            rows.append(row)
            continue
        world = start["worldId"]
        info = next(w for w in inventory["worlds"] if w["worldId"] == world)
        assert info["kind"] == "practice" and info["season"] == protocol["season"] and info["level"] == level and info["boardRun"] == run_number
        assert start["at"] < protocol["stopNewRankedAt"]
        failures = [r for r in attempts if r["event"] == "failed" and r.get("worldId") == world]
        row.update(worldId=world, startedAt=start["at"], server=info, runtimeFailures=failures, status="failed" if failures else "running")
        finish = next((r for r in attempts if r["event"] == "completed" and r.get("worldId") == world), None)
        if not finish:
            rows.append(row)
            continue
        assert info["ended"] and finish["completedAt"] < protocol["stopRankedRequestsAt"]
        files = {}
        def artifact(kind):
            path = f"runs/{world}.{kind}.json"
            files[kind] = {"path": path, "sha256": sha(path)}
            return read(path)
        meta, score, snapshot, events = [artifact(k) for k in ["meta", "score", "snapshot", "events"]]
        errors, recoveries = artifact("errors"), artifact("recoveries")
        assert snapshot["now"] == snapshot["endsAt"]
        assert meta["worldId"] == world and meta["level"] == level and meta["revision"] == protocol["revision"]
        assert meta["settings"] == {**base, **extras, **protocol["policies"][str(level)]}
        counts = order_counts(snapshot["orders"])
        assert counts["wonOrders"] == score["wonOrders"]
        assert abs(counts["onTimeOrders"] / counts["wonOrders"] - score["onTimeShare"]) < 1e-12
        assert abs(counts["undeliveredOrders"] / counts["wonOrders"] - score["undeliveredShare"]) < 1e-12
        ledger = Counter()
        for e in events:
            if e["kind"] == "ledger":
                ledger[e["line"]["kind"]] += e["line"]["cents"]
        assert sum(ledger.values()) == score["marginCents"]
        board = next(b for b in inventory["boards"] if b["level"] == level)
        season = next(s for s in [board["current"], board["previous"]] if s and s["season"] == protocol["season"])
        team = next(t for t in season["teams"] if t["team"] == "burger-han")
        official = next(r for r in team["runs"] if r["run"] == run_number)
        assert all(official[k] == score[k] for k in ["marginCents", "wonOrders", "ranked", "onTimeShare"])
        assert official["deletedAt"] is None
        row.update(status="complete", completedAt=finish["completedAt"], score=score, counts=counts, ledgerCents=dict(ledger), failedVisits=sum(e["kind"] == "visit_failed" for e in events), errors=errors, recoveries=recoveries, files=files)
        rows.append(row)
summary = []
for level in [1,2,3,4]:
    done = [r for r in rows if r["level"] == level and r["status"] == "complete"]
    board = next(b for b in inventory["boards"] if b["level"] == level)
    season = next(s for s in [board["current"], board["previous"]] if s and s["season"] == protocol["season"])
    ours = next(t for t in season["teams"] if t["team"] == "burger-han")
    leader = season["teams"][0]
    won = sum(r["score"]["wonOrders"] for r in done)
    qualified = sum(r["score"]["ranked"] for r in done)
    value = {"level": level, "completed": len(done), "qualifiedWeeks": qualified, "qualificationLower95": float(beta.ppf(.05, qualified, len(done)-qualified+1)) if qualified else 0, "totalProfitEuros": sum(r["score"]["marginCents"] for r in done)/100, "orders": won, "onTimeShare": sum(r["counts"]["onTimeOrders"] for r in done)/won if won else None, "minimumOnTimeShare": min((r["score"]["onTimeShare"] for r in done), default=None), "undelivered": sum(r["counts"]["undeliveredOrders"] for r in done), "failedVisits": sum(r["failedVisits"] for r in done), "driverPaymentsEuros": -sum(r["ledgerCents"].get("driver_fee",0) for r in done)/100, "refundsEuros": -sum(r["ledgerCents"].get("late_refund",0) for r in done)/100, "finesEuros": -sum(r["ledgerCents"].get("fine",0) for r in done)/100, "actionErrors": sum(len(r["errors"]) for r in done), "recoveries": sum(len(r["recoveries"]) for r in done), "officialRank": ours["rank"], "officialPlayed": ours["played"], "officialQualified": ours["ranked"], "leader": {"team": leader["team"], "name": leader["name"], "played": leader["played"], "totalProfitEuros": leader["marginCents"]/100 if leader["marginCents"] is not None else None}}
    if len(done) == 5 and leader["played"] == 5:
        value["matchedLeaderGapEuros"] = value["leader"]["totalProfitEuros"] - value["totalProfitEuros"]
    summary.append(value)
complete = all(r["status"] == "complete" for r in rows) and not any(r["event"] == "failed" for r in attempts)
report = {"generatedAt": datetime.now(timezone.utc).isoformat(), "officialSnapshotAt": inventory["checkedAt"], "protocolSha256": sha("experiments/levels-noon-protocol.json"), "season": protocol["season"], "complete": complete, "completed": sum(r["status"] == "complete" for r in rows), "expected": 20, "lastCompletedAt": max((r["completedAt"] for r in rows if r["status"] == "complete"), default=None), "summary": summary, "worlds": rows, "maximumObservedOccupancyBeforeCreation": max((len(r["unfinished"]) for r in attempts if r["event"] == "occupancy"), default=0), "unfinishedTeamWorlds": [w for w in inventory["worlds"] if not w["ended"]], "nonWorldFailures": [r for r in attempts if r["event"] == "failed" and not r.get("worldId")], "limitations": [protocol["evidenceStatus"], "All twenty weeks used one frozen level-aware policy. No ranked-outcome tuning or replacement. Related levels are not twenty independent seed blocks.", "Qualification bounds are descriptive exact binomial bounds under IID-week assumptions; five successes give only54.93% lower confidence. Ranked weeks are not a randomized representative qualification guarantee.", "Leaderboard positions and leader gaps refer only to the recorded snapshot of the same season and matched run numbers. No unmatched practice-to-leader ranking claim.", "Levels5–8 are paused for review; no final or test final was entered."]}
(ROOT / "docs/levels-noon-ranked-audit.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({k: report[k] for k in ["complete", "completed", "lastCompletedAt", "summary"]}, indent=2))
