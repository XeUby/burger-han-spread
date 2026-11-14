"""Summarize public ranking volume and margin without starting a ranking run."""

import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
observation = json.loads((root / "docs/leaderboard-observation.json").read_text())
current = observation["data"]["current"]
rows = []
for team in current["teams"]:
    if not team["ranked"] or team["played"] != 5 or not team["rank"] or team["rank"] > 10:
        continue
    orders = sum(run["wonOrders"] for run in team["runs"])
    assert len(team["runs"]) == 5 and sum(run["marginCents"] for run in team["runs"]) == team["marginCents"]
    rows.append({
        "rank": team["rank"], "name": team["name"],
        "meanWeeklyMarginEuros": team["marginCents"] / 500,
        "meanWeeklyOrders": orders / 5,
        "marginEurosPerOrder": team["marginCents"] / 100 / orders,
        "onTimeShare": team["onTimeShare"],
    })
report = {
    "observedAt": observation["observedAt"], "source": observation["source"],
    "season": current["season"], "round": current["name"], "leaders": rows,
    "interpretation": "These public outcomes describe volume and margin per order jointly. Neither alone is the objective; the aggregates do not identify a causal strategy.",
    "limitations": ["These are public aggregate outcomes, not evidence about another team's implementation, prices or driver fees.", "Our development and independent evaluation seeds differ from the ranking seeds. Cross-panel differences cannot establish a causal performance gap or projected rank.", "Rank-selected teams are a selected sample. Their aggregate on-time shares do not establish out-of-sample qualification probabilities."],
}
(root / "docs/leaderboard-metrics.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(rows, indent=2))
