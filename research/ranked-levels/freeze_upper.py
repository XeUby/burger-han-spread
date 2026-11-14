import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[2]
path = root / "experiments/levels-upper-protocol.json"
if path.exists():
    raise RuntimeError("Do not overwrite a frozen ranked policy")
protocol = json.loads((root / "experiments/levels-noon-protocol.json").read_text())
prior = json.loads((root / "experiments/levels-deadline-protocol.json").read_text())
base = json.loads((root / "experiments/portfolio-development-v1.json").read_text())["trials"][0]["settings"]
protocol.update(frozenAt=datetime.now(timezone.utc).isoformat(), levels=[8,7,6,5], policies={str(level): {**base, **(prior["policies"][str(level)] if level in [5,6] else {}), "actionGuard": True, "portfolio": False} for level in [8,7,6,5]}, stopNewRankedAt="2026-11-14T09:58:00Z", stopRankedRequestsAt="2026-11-14T09:59:55Z", authorization={"approved": True, "instruction": "submit the best models for level 5-8 NOW; Start with 8; Do not overshoot past12:00", "capacityInstruction": "remove4worldlimit,go8", "scope": "Season5, level8first then7,6,5; hard stop before noon; no final or test final"}, selection={"8-7": "Retain validated control. The new portfolio failed its development promotion screen; cheap fees failed in shortage.", "6-5": "Retain the previously ranked level-aware economics policy from the earlier frozen deadline deployment. Do not transfer the new level1–3candidate without evidence. This remains uncertain and development-selected."}, behavior="One frozen policy; level priority8,7,6,5. Eight concurrent worlds with serialized creation and duplicate-run checks. No tuning, deletion or replacement. Leave unstarted attempts unused at the creation cutoff; abort every ranked mutation at11:59:55Helsinki.", launcherSha256=hashlib.sha256((root / "research/ranked-levels/upper.ts").read_bytes()).hexdigest())
path.write_text(json.dumps(protocol, indent=2) + "\n")
print(json.dumps({"levels":protocol["levels"],"creationCutoff":protocol["stopNewRankedAt"],"hardStop":protocol["stopRankedRequestsAt"]}))
