"""Evaluate the corrected-option interaction on two complete familiar weeks."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from research.portfolio.report import audit, sha
from research.value.report import paired, summarize

plan, report = audit(ROOT / "experiments/level1-corrected-economics-v1.json")
_, controls = audit(ROOT / "experiments/portfolio-lower-v1.json")
control = {r["seed"]: r for r in controls["records"] if r["level"] == 1 and r["label"].endswith("benchmark")}
report["controlPlanSha256"] = sha(ROOT / "experiments/portfolio-lower-v1.json")
report["controls"] = list(control.values())
report["terminal"] &= all(r["status"] == "complete" for r in control.values())
report["deploymentNominee"] = None
if report["terminal"]:
    groups = {arm: [r for r in report["records"] if r["label"].endswith("-" + arm)] for arm in ["capacity", "payment", "joint"]}
    groups["control"] = list(control.values())
    for arm, rows in groups.items():
        value = summarize(rows)
        delta = paired([r["score"]["marginCents"] - control[r["seed"]]["score"]["marginCents"] for r in rows])
        value["pairedGain"] = delta
        value["deploymentScreenPassed"] = arm != "control" and delta["wins"] == 2 and delta["meanEuros"] >= 1500 and value["qualified"] == 2 and value["minimumOnTime"] >= .92 and value["undelivered"] == value["failedVisits"] == 0 and not any(r["runtimeFailures"] for r in rows)
        value["promotionAllowed"] = False
        report["summary"][arm] = value
    index = {arm: {r["seed"]: r["score"]["marginCents"] for r in rows} for arm, rows in groups.items()}
    report["contrasts"]["interaction"] = paired([index["joint"][s] - index["capacity"][s] - index["payment"][s] + index["control"][s] for s in sorted(control)])
    passed = [(arm, value) for arm, value in report["summary"].items() if value["deploymentScreenPassed"]]
    if passed:
        report["deploymentNominee"] = max(passed, key=lambda item: item[1]["meanProfitEuros"])[0]
report["limitations"] = ["Two familiar development seeds, not independent validation. Deployment nomination is not statistical promotion or a reliability guarantee.", "The screen was frozen before these trials. It leaves any on-time loss versus control explicit and does not alter the prospective validation gates.", "Level1 driver behavior does not establish transfer to levels2–4. A ranked deployment exception needs explicit user authorization of its exact frozen scope."]
(ROOT / "docs/level1-corrected-economics-v1-results.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({k: report[k] for k in ["terminal", "completed", "expected", "deploymentNominee", "summary", "contrasts"]}, indent=2))
