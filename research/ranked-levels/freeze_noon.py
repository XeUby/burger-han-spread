"""Freeze one level-aware ranking policy from completed development comparisons."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
path = ROOT / "experiments/levels-noon-protocol.json"
if path.exists():
    raise RuntimeError("Do not overwrite a frozen ranking policy")
read = lambda p: json.loads((ROOT / p).read_text())
sha = lambda p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest()
runtime = read("experiments/portfolio-development-v1.json")
base = {**runtime["trials"][0]["settings"], "portfolio": False}
level1 = read("docs/level1-corrected-economics-v1-results.json")
transfer = read("docs/moderate-payment-transfer-v1-results.json")
strong = read("docs/corrected-payment-transfer-v1-results.json")
if not all(r["terminal"] for r in [level1, transfer, strong]):
    raise RuntimeError("Complete all declared payment comparisons before freezing")
moderate_plan = read("experiments/level1-corrected-economics-v1.json")
strong_plan = read("experiments/corrected-payment-transfer-v1.json")
moderate = next(t["settings"] for t in moderate_plan["trials"] if t["label"].endswith("-payment"))
policies, evidence = {}, {}
for level in [1, 2, 3]:
    moderate_result = level1["summary"]["payment"] if level == 1 else transfer["summary"][str(level)]["payment"]
    choices = [("corrected control", base, level1["summary"]["control"]["meanProfitEuros"] if level == 1 else transfer["summary"][str(level)]["control"]["meanProfitEuros"])]
    if moderate_result["deploymentScreenPassed"]:
        choices.append(("moderate payment", moderate, moderate_result["meanProfitEuros"]))
    for arm in ["payment", "joint"]:
        result = strong["summary"][str(level)][arm]
        if result["deploymentScreenPassed"]:
            settings = next(t["settings"] for t in strong_plan["trials"] if t["level"] == level and t["label"].endswith("-" + arm))
            choices.append(("strong " + arm, settings, result["meanProfitEuros"]))
    name, settings, profit = max(choices, key=lambda c: c[2])
    policies[str(level)] = settings
    evidence[str(level)] = {"choice": name, "twoWeekDevelopmentMeanEuros": profit, "independentValidation": False}
previous = read("experiments/levels-deadline-protocol.json")
policies["4"] = {**base, **previous["policies"]["4"], "actionGuard": True, "portfolio": False}
evidence["4"] = {"choice": "earlier economics-only policy with original capacity", "developmentMeanEuros": 3982.38, "minimumOnTime": .956221198156682, "report": "docs/levels-factorial-analysis.json", "reason": "Three completed same-seed gains over control, all qualified; no transfer from shortage levels. Keep this separately documented development choice.", "independentValidation": False}
source = hashlib.sha256()
for file in sorted((ROOT / runtime["bundle"] / "src").glob("*.ts")):
    source.update(file.name.encode())
    source.update(file.read_bytes())
protocol = {
    "frozenAt": datetime.now(timezone.utc).isoformat(), "bundle": runtime["bundle"], "revision": source.hexdigest(),
    "season": 5, "seasonName": "Saturday 09:00", "levels": [1, 2, 3, 4], "policies": policies,
    "maximumUnfinishedTeamWorlds": 8, "rankedRunsPerLevel": 5,
    "stopNewRankedAt": "2026-11-14T09:55:00Z", "stopRankedRequestsAt": "2026-11-14T09:59:55Z", "userDeadline": "2026-11-14T12:00:00+02:00",
    "authorization": {"approved": True, "instruction": "start submitting best models/policies for ranking starting level 1-4. Pause before 5-8 if there is anything to learn from 1-4", "capacityInstruction": "remove 4 world limit, go 8", "scope": "Five runs each at levels1–4 in season5 before noon; pause before levels5–8. No test final or final."},
    "evidenceStatus": "Explicitly authorized deadline deployment from best completed development evidence. This is not statistical promotion, not an untouched24-pair validation, and not a qualification guarantee. The prospective validation protocol remains unchanged.",
    "selection": evidence, "behavior": "One frozen level-aware policy for all20ranked weeks. Reset every week. Retain every result; no ranked-outcome tuning, replacement, deletion or favorable stopping. Stop creation on operational failure or the declared deadline.",
    "sourceFiles": {f"{runtime['bundle']}/{name}": expected for name, expected in runtime["files"].items()},
    "sourceArchive": "experiments/portfolio-development-v1-source.tar.gz", "sourceArchiveSha256": sha("experiments/portfolio-development-v1-source.tar.gz"),
    "launcherSha256": sha("research/ranked-levels/noon.ts"),
    "selectionEvidenceHashes": {p: sha(p) for p in ["docs/level1-corrected-economics-v1-results.json", "docs/moderate-payment-transfer-v1-results.json", "docs/corrected-payment-transfer-v1-results.json", "docs/levels-factorial-analysis.json"]},
}
path.write_text(json.dumps(protocol, indent=2) + "\n")
print(json.dumps({"protocol": str(path), "selection": evidence, "worldLimit": 8, "scope": [1, 2, 3, 4]}, indent=2))
