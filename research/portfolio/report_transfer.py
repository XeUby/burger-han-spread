"""Audit the complete corrected-payment comparison separately at each level."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from research.portfolio.report import audit, sha
from research.value.report import paired, summarize

name = sys.argv[1] if len(sys.argv) > 1 else "corrected-payment-transfer-v1"
if name not in ["corrected-payment-transfer-v1", "moderate-payment-transfer-v1"]:
    raise ValueError("Unknown frozen transfer study")
plan, report = audit(ROOT / f"experiments/{name}.json")
levels = sorted({t["level"] for t in plan["trials"]})
arms = sorted({t["label"].rsplit("-", 1)[-1] for t in plan["trials"]})
_, reference = audit(ROOT / "experiments/portfolio-lower-v1.json")
controls = [r for r in reference["records"] if r["level"] in levels and r["label"].endswith("benchmark")]
report["controls"] = controls
report["controlPlanSha256"] = sha(ROOT / "experiments/portfolio-lower-v1.json")
report["terminal"] &= all(r["status"] == "complete" for r in controls)
report["deploymentNominees"] = {}
if report["terminal"]:
    for level in levels:
        control = {r["seed"]: r for r in controls if r["level"] == level}
        groups = {arm: [r for r in report["records"] if r["level"] == level and r["label"].endswith("-" + arm)] for arm in arms}
        groups["control"] = list(control.values())
        summary = {}
        for arm, rows in groups.items():
            value = summarize(rows)
            delta = paired([r["score"]["marginCents"] - control[r["seed"]]["score"]["marginCents"] for r in rows])
            value["pairedGain"] = delta
            value["deploymentScreenPassed"] = arm != "control" and delta["wins"] == 2 and delta["meanEuros"] >= 1500 and value["qualified"] == 2 and value["minimumOnTime"] >= .92 and value["undelivered"] == value["failedVisits"] == 0 and not any(r["runtimeFailures"] for r in rows)
            value["promotionAllowed"] = False
            summary[arm] = value
        report["summary"][str(level)] = summary
        passed = [(arm, value) for arm, value in summary.items() if value["deploymentScreenPassed"]]
        report["deploymentNominees"][str(level)] = max(passed, key=lambda item: item[1]["meanProfitEuros"])[0] if passed else None
report["limitations"] = ["Adaptive development on two shared underlying seeds. All variants and failures remain visible. No independent validation or statistical promotion.", "No pooled level claim. Level2 driver learning and level3 bundling are tested separately, with only two blocks each.", "Any lower on-time share, refund increase or operational error remains part of the outcome. A deployment screen does not waive the documented24-pair validation minimum."]
(ROOT / f"docs/{name}-results.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"terminal": report["terminal"], "completed": report["completed"], "expected": report["expected"], "nominees": report["deploymentNominees"], "summary": {level: {arm: {"profit": v["meanProfitEuros"], "gain": v["pairedGain"]["meanEuros"], "minimumOnTime": v["minimumOnTime"], "qualified": v["qualified"], "passed": v["deploymentScreenPassed"]} for arm, v in arms.items()} for level, arms in report["summary"].items()}}, indent=2))
