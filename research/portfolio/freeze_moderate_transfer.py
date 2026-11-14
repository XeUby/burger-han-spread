"""Test the completed level-1 nominee at levels with learning and bundling."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
name = "moderate-payment-transfer-v1"
path = ROOT / f"experiments/{name}.json"
if path.exists():
    raise RuntimeError("Frozen study already exists")
result = json.loads((ROOT / "docs/level1-corrected-economics-v1-results.json").read_text())
if not result["terminal"] or result["deploymentNominee"] != "payment":
    raise RuntimeError("The completed level1 screen must nominate the moderate payment arm")
original = json.loads((ROOT / "experiments/level1-corrected-economics-v1.json").read_text())
settings = next(t["settings"] for t in original["trials"] if t["label"].endswith("-payment"))
plan = json.loads((ROOT / "experiments/corrected-payment-transfer-v1.json").read_text())
seeds = list(dict.fromkeys(t["seed"] for t in original["trials"]))
protocol = {
    "frozenAt": datetime.now(timezone.utc).isoformat(), "role": "Four-world transfer development check; no promotion",
    "selection": "The complete six-world level1 study nominated fee0.90 with original capacity. Its two-week mean gain was1826.48euros; minimum on-time97.9495%. Capacity expansion did not improve the mean. Freeze that exact policy before testing levels2–3; do not assume the level1 result transfers.",
    "hypothesis": "Moderate payment reduction with corrected first-option/opening-cost admission remains profitable under level2 driver learning and level3 bundling.",
    "settings": settings, "seeds": seeds, "levels": [2, 3],
    "control": "Verified same-seed corrected-option benchmark worlds from portfolio-lower-v1.",
    "stopping": "Complete all four irrespective of profit; inherited600-second runtime budget and failure preservation. No tuning during play.",
    "operations": {"workers": 4, "maximumUnfinishedTeamWorlds": 8, "capacityAuthorization": "remove 4 world limit, go 8", "ranked": False},
    "deploymentScreen": "Per level, gains on both weeks, mean gain>=1500euros, both qualified and>=92%on-time, zero undelivered/failed visits/runtime failures. Report any on-time loss versus control. No statistical promotion or24-pair validation claim.",
    "search": "Adaptive follow-up on the same two familiar seed blocks, not four independent weeks and not an untouched panel. All earlier moderate, strong and joint variants remain in the record.",
}
protocol_path = ROOT / f"experiments/{name}-protocol.json"
protocol_path.write_text(json.dumps(protocol, indent=2) + "\n")
plan.update(frozenAt=protocol["frozenAt"], role=protocol["role"], trials=[{"level": level, "seed": seed, "label": "moderate-transfer-v1-payment", "settings": settings} for seed in seeds for level in [2, 3]], attempts=f"experiments/{name}-attempts.jsonl", report=f"docs/{name}-runs.json", protocol=str(protocol_path.relative_to(ROOT)), protocolSha256=hashlib.sha256(protocol_path.read_bytes()).hexdigest())
path.write_text(json.dumps(plan, indent=2) + "\n")
print(json.dumps({"manifest": str(path), "worlds": len(plan["trials"])}))
