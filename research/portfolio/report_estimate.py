import json
import importlib.metadata
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from research.portfolio.report import audit
from research.value.report import paired, summarize

NAME = "level8-estimate-v1"
plan, report = audit(ROOT / f"experiments/{NAME}.json")
report["role"] = "Fixed eight-pair development estimate; no policy promotion"
report["analysisVersions"] = {name: importlib.metadata.version(name) for name in ["numpy", "scipy"]}
report["limitations"] = [
    "Practice seeds differ from ranked seeds. Leaderboard differences are descriptive benchmarks, not matched policy effects or predicted ranks.",
    "Eight independent seed blocks are assumed for intervals; sixteen policy worlds do not double the sample size. Small samples cannot resolve unseen tails.",
    "Candidate was selected on prior development data; this panel is estimation/development and cannot later be called untouched validation.",
    "A failed or interrupted panel retains every planned case and does not support a complete-policy estimate.",
]
if report["terminal"]:
    groups = {arm: [r for r in report["records"] if r["label"].endswith("-" + arm)] for arm in ["benchmark", "payments"]}
    controls = {r["seed"]: r for r in groups["benchmark"]}
    for arm, rows in groups.items():
        value = summarize(rows)
        value["profitInterval"] = paired([r["score"]["marginCents"] for r in rows])
        value["profitInterval"].pop("wins", None)
        value["profitInterval"].pop("losses", None)
        value["profitInterval"]["weeklyProfitsEuros"] = value["profitInterval"].pop("differencesEuros")
        value["versusControl"] = paired([r["score"]["marginCents"] - controls[r["seed"]]["score"]["marginCents"] for r in rows])
        report["summary"][arm] = value
    snapshot = json.loads((ROOT / "docs/level8-estimate-board.json").read_text())
    board = snapshot["board"]["current"]
    leader = next(t for t in board["teams"] if t["rank"] == 1)
    reference = leader["marginCents"] / len(leader["runs"]) / 100
    report["leaderboard"] = {"checkedAt": snapshot["checkedAt"], "season": board["season"], "leader": leader, "meanWeeklyProfitEuros": reference, "comparison": "Unmatched seeds; descriptive gap only"}
    for value in report["summary"].values():
        value["unmatchedLeaderShortfallEuros"] = reference - value["meanProfitEuros"]
        value["fractionOfLeaderMean"] = value["meanProfitEuros"] / reference
    report["decision"] = "Retain control and candidate separately. Use this estimate to prioritize research; no promotion or ranking authorized."
(ROOT / f"docs/{NAME}-results.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({k: report[k] for k in ["terminal", "completed", "expected", "summary"]}, indent=2))
