"""Keep each lower level separate and every frozen trial visible."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from research.portfolio.report import audit, sha
from research.value.report import paired, summarize

plan, report = audit(ROOT / "experiments/portfolio-lower-v1.json")
history = json.loads((ROOT / "docs/levels-first-option-complete-analysis.json").read_text())["records"]
factorial = json.loads((ROOT / "docs/levels-factorial-analysis.json").read_text())["records"]
report["benchmarkReplications"] = []
for row in report["records"]:
    if row["status"] != "complete" or not row["label"].endswith("benchmark"):
        continue
    candidates = history if row["level"] <= 3 else factorial
    label = "levels-first-option-cost" if row["level"] <= 3 else "levels-factorial-control"
    old = next(r for r in candidates if r["level"] == row["level"] and r["seed"] == row["seed"] and r["label"] == label)
    old_id = old["worldId"]
    new_id = row["worldId"]
    report["benchmarkReplications"].append({"level": row["level"], "seed": row["seed"], "archivedWorld": old_id, "newWorld": new_id, "identicalEvents": sha(ROOT / f"runs/{old_id}.events.json") == sha(ROOT / f"runs/{new_id}.events.json"), "identicalScore": json.loads((ROOT / f"runs/{old_id}.score.json").read_text()) == json.loads((ROOT / f"runs/{new_id}.score.json").read_text())})
if report["terminal"]:
    for level in [1, 2, 3, 4]:
        rows = [r for r in report["records"] if r["level"] == level]
        by_arm = {arm: [r for r in rows if r["label"].endswith(arm)] for arm in ["benchmark", "planner"]}
        control = {r["seed"]: r for r in by_arm["benchmark"]}
        values = {}
        for arm, worlds in by_arm.items():
            value = summarize(worlds)
            value["pairedGain"] = paired([r["score"]["marginCents"] - control[r["seed"]]["score"]["marginCents"] for r in worlds])
            value["promotionAllowed"] = False
            values[arm] = value
        report["summary"][str(level)] = values
report["limitations"] = ["Only two familiar underlying seeds; cross-level worlds are dependent. No untouched validation or promotion.", "Exact qualification bounds assume IID weeks; two successes give only a 22.36% one-sided 95% lower bound.", "This urgency-driven development screen does not waive the minimum 24-pair validation protocol. Ranking requires separate explicit authorization."]
(ROOT / "docs/portfolio-lower-v1-results.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({k: report[k] for k in ["terminal", "completed", "expected", "summary"]}, indent=2))
