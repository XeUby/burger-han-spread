"""Report the prespecified development panel without inspecting future holdouts."""

import json
import statistics
from pathlib import Path

from frontier_validation import load_world

ROOT = Path(__file__).resolve().parents[1]
protocol = json.loads((ROOT / "experiments/frontier-confirmation-protocol.json").read_text())
seeds = [row["seed"] for row in protocol["baselines"]]
candidates = {row["label"]: row for row in protocol["candidates"]}
baselines = {row["seed"]: load_world(ROOT, row["worldId"], row["seed"], row) for row in protocol["baselines"]}
matches = {}
for path in (ROOT / "runs").glob("*.meta.json"):
    meta = json.loads(path.read_text())
    key = (meta.get("label"), meta.get("seed"))
    if key[0] not in candidates or key[1] not in seeds:
        continue
    if key in matches:
        raise ValueError(f"Multiple attempts for {key}; record interrupted trials explicitly before reporting")
    expected = candidates[key[0]]
    if meta["revision"] != protocol["revision"] or meta["settings"] != expected["settings"]:
        raise ValueError(f"Frozen source/settings mismatch for {key}")
    matches[key] = meta

records = []
for seed in seeds:
    for label, expected in candidates.items():
        meta = matches.get((label, seed))
        row = {"seed": seed, "label": label, "worldId": meta["worldId"] if meta else None, "status": "pending"}
        if meta and all((ROOT / "runs" / f"{meta['worldId']}.{kind}.json").exists() for kind in ["score", "snapshot", "events"]):
            result = load_world(ROOT, meta["worldId"], seed, {**expected, "revision": protocol["revision"]})
            row.update(status="complete", result=result, differenceCents=result["marginCents"] - baselines[seed]["marginCents"])
        records.append(row)

summaries = {}
for label in candidates:
    rows = [row for row in records if row["label"] == label and row["status"] == "complete"]
    summaries[label] = {
        "complete": len(rows), "planned": len(seeds),
        "meanMarginCents": statistics.mean(row["result"]["marginCents"] for row in rows) if rows else None,
        "meanPairedDifferenceCents": statistics.mean(row["differenceCents"] for row in rows) if rows else None,
        "qualified": sum(row["result"]["ranked"] for row in rows),
        "worstOnTimeShare": min((row["result"]["onTimeShare"] for row in rows), default=None),
        "positivePairs": sum(row["differenceCents"] > 0 for row in rows),
    }
report = {"stage": protocol["stage"], "protocol": protocol, "baselines": baselines, "summary": summaries, "records": records,
          "limitations": ["These seeds were already inspected in earlier development; this is not independent validation.", "Do not compare partial means when the completed seed sets differ.", "Only whole-week ledger totals enter profit, including shared-gig costs with null order IDs.", "A source/settings freeze and fresh paired weeks remain necessary before promotion."]}
(ROOT / "docs/frontier-confirmation.json").write_text(json.dumps(report, indent=2) + "\n")

def euros(cents):
    return f"€{cents / 100:,.2f}"

lines = ["# Development confirmation", "", "Four previously inspected weeks, declared before running these candidate policies. This panel tests whether the two-week screening pattern persists; it is not independent validation.", "", "| Seed | Previous validated policy | Bundles | Broader admission + bundles | Moderate admission + bundles |", "|---|---:|---:|---:|---:|"]
for seed in seeds:
    values = [seed.rsplit("-", 1)[1], euros(baselines[seed]["marginCents"])]
    for label in candidates:
        row = next(row for row in records if row["label"] == label and row["seed"] == seed)
        values.append(f"{euros(row['result']['marginCents'])} / {row['result']['onTimeShare']:.1%}" if row["status"] == "complete" else "Pending")
    lines.append("| " + " | ".join(values) + " |")
lines += ["", "Cells show whole-week profit and on-time share. All declared outcomes, including disqualifications, remain in the report. Shared-gig fees are included in whole-week totals. Do not compare incomplete means across different seed subsets.", "", "The JSON report records full settings, source revision, explicit worlds, ledger reconciliation and file hashes. No fresh holdout outcomes are opened by this report."]
(ROOT / "docs/frontier-confirmation.md").write_text("\n".join(lines) + "\n")
print(json.dumps(summaries, indent=2))
