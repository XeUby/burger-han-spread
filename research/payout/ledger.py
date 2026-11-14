"""Describe cash-flow changes in every completed payout evaluation pair."""

import json
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parents[2]
report = json.loads((root / "docs/payout-validation.json").read_text())
rows = []
for week in report["weeks"]:
    ledgers = {}
    for side in ["baseline", "candidate"]:
        world = week[side]["worldId"]
        amounts = Counter()
        for event in json.loads((root / f"runs/{world}.events.json").read_text()):
            if event["kind"] == "ledger":
                amounts[event["line"]["kind"]] += event["line"]["cents"]
        assert sum(amounts.values()) == week[side]["marginCents"]
        ledgers[side] = dict(sorted(amounts.items()))
    kinds = sorted(ledgers["baseline"].keys() | ledgers["candidate"].keys())
    differences = {kind: ledgers["candidate"].get(kind, 0) - ledgers["baseline"].get(kind, 0) for kind in kinds}
    assert sum(differences.values()) == week["differenceCents"]
    rows.append({"seed": week["seed"], "ledgersCents": ledgers, "differencesCents": differences})
totals = Counter()
for row in rows:
    totals.update(row["differencesCents"])
assert sum(totals.values()) == report["paired"]["totalDifferenceCents"]
result = {
    "evaluation": "docs/payout-validation.json",
    "interpretation": "Positive differences improve candidate margin. Every ledger line, including shared gig fees and cancellations, is included. This is an accounting decomposition, not an isolated causal effect of each component: fees, demand, assignments and dealer trust change together.",
    "meanDifferencesCents": {kind: total / len(rows) for kind, total in sorted(totals.items())},
    "weeks": rows,
}
(root / "docs/payout-validation-ledger.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result["meanDifferencesCents"], indent=2))
