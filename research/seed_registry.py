"""Retire every observed seed from future untouched validation panels."""

import hashlib
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "experiments/seed-registry.json"
previous = json.loads(path.read_text()) if path.exists() else {"seeds": []}
known = {row["seed"]: row for row in previous["seeds"]}
observed = defaultdict(list)
labels = set()
policies = set()
for file in sorted((root / "runs").glob("*.meta.json")):
    meta = json.loads(file.read_text())
    seed = meta.get("seed")
    if not isinstance(seed, str) or not seed:
        raise ValueError(f"A world without a named seed cannot establish a unique week: {file}")
    world = meta["worldId"]
    labels.add(meta.get("label"))
    policies.add((meta.get("revision"), json.dumps(meta.get("settings"), sort_keys=True)))
    observed[seed].append({"worldId": world, "label": meta.get("label"), "revision": meta.get("revision"), "hasTerminalArtifacts": all((root / f"runs/{world}.{kind}.json").exists() for kind in ["score", "snapshot", "events"]), "metaSha256": hashlib.sha256(file.read_bytes()).hexdigest()})
now = datetime.now(timezone.utc).isoformat()
for seed, worlds in observed.items():
    row = known.setdefault(seed, {"seed": seed, "retiredAt": now})
    row.update(role="development-or-historical-evidence", eligibleForFreshValidation=False, worlds=worlds, reason="This seed has already been played or inspected. Prior validation reports retain their historical role; this retirement forbids future reuse as untouched evidence.")
report = {"updatedAt": now, "unit": "unique simulation seed/week; repeated worlds are not independent replications", "worldRecords": sum(len(rows) for rows in observed.values()), "uniqueNamedWeeks": len(known), "distinctLabels": len(labels), "distinctSourceSettingsCombinations": len(policies), "interpretation": "Counts document the adaptive search, not independent tests or a guarantee that distinct deterministic seeds are IID. Every observed seed is conservatively unavailable for any future untouched panel.", "seeds": [known[seed] for seed in sorted(known)]}
path.write_text(json.dumps(report, indent=2)+"\n")
print(json.dumps({key: report[key] for key in ["worldRecords", "uniqueNamedWeeks", "distinctLabels", "distinctSourceSettingsCombinations"]}))
