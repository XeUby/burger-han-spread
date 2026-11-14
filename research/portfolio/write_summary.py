"""Write the panel decision only after every frozen trial has completed."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
report = json.loads((ROOT / "docs/portfolio-development-v1-results.json").read_text())
if not report["terminal"]:
    raise RuntimeError("An incomplete panel cannot produce a complete-case policy decision")
money = lambda x: f"€{x:,.2f}"
percent = lambda x: f"{100*x:.2f}%"
summary = report["summary"]
lines = [
    "# Joint portfolio development results", "",
    "The frozen four-arm panel completed all sixteen unranked worlds on four familiar underlying seed blocks. These are development results, not untouched validation. The validated selection and the separate lower-level candidate remain unchanged.", "",
    "The policy compares customer quotes, existing route commitments and opening driver payments in one OR-Tools model. It executes one action, observes events and replans. NetworkX supplies an independent oracle for pair-only solver tests. Optimality of that finite model does not establish optimality in Spread.", "",
    "## Whole-week outcomes", "",
    "| Policy | Mean net profit | Paired gain | 95% paired-t interval | Qualified | Minimum on time | Mean orders | Mean driver payments | Mean refunds |",
    "|---|---:|---:|---|---:|---:|---:|---:|---:|",
]
for arm, row in summary.items():
    delta = row["versusBenchmark"]
    low, high = delta["t95Euros"]
    lines.append(f"| {arm} | {money(row['meanProfitEuros'])} | {money(delta['meanEuros'])} | {money(low)} to {money(high)} | {row['qualified']}/{row['weeks']} | {percent(row['minimumOnTime'])} | {row['meanOrders']:.2f} | {money(row['meanDriverPaymentsEuros'])} | {money(row['meanRefundsEuros'])} |")
lines += ["", "The JSON retains paired differences, whole-week bootstrap intervals, ledger decomposition, qualification bounds, errors and every world ID. Four adaptive blocks provide weak precision and cannot establish qualification reliability. With four successes, the one-sided 95% lower qualification bound is only 47.29% under IID-week assumptions.", "", "## Mechanisms and decisions", "", "| Policy | Changed quotes | Anchored quotes | Bundled posts | Higher-paid posts | Frames with future values | Solver fallbacks |", "|---|---:|---:|---:|---:|---:|---:|"]
for arm, row in summary.items():
    p = row["planner"]
    lines.append(f"| {arm} | {p['changedQuotes']} | {p['anchoredQuotes']} | {p['bundledPosts']} | {p['higherPaidPosts']} | {p['framesWithFutureValue']} | {p['fallbacks']} |")
labels = {"profit": "mean paired gain below €1,500", "qualification": "a nonqualifying week", "weeklyOnTime": "a week below 92% on time", "aggregateOnTime": "aggregate on-time loss exceeded 0.5 percentage points", "undelivered": "undelivered work", "failedVisits": "failed visits", "operations": "an operational failure", "mechanismExercised": "no meaningful changed actions"}
for arm in ["planner", "future", "payments"]:
    row = summary[arm]
    failures = [labels[k] for k, passed in row["developmentChecks"].items() if not passed]
    decision = "Passes the development screen; still requires a single frozen finalist and untouched validation." if not failures else "Does not pass this implementation's development screen: " + "; ".join(failures) + "."
    lines += ["", f"**{arm}:** {decision}"]
for name, description in [("futureIncrement", "Added future-value term"), ("paymentIncrement", "Added payment choices")]:
    d = report["contrasts"][name]
    lines += ["", f"{description}: {money(d['meanEuros'])} per week relative to the preceding arm; descriptive 95% paired-t interval {money(d['t95Euros'][0])} to {money(d['t95Euros'][1])}."]
records = report["records"]
lines += ["", "## Operational and economic audit", "", f"All {len(report['benchmarkReplications'])} control replications matched archived events and scores: {all(r['identicalEvents'] and r['identicalScore'] for r in report['benchmarkReplications'])}. All completed score totals and terminal order counts reconcile to the ledger and snapshots.", "", f"Across all sixteen worlds: {sum(len(r['actionErrors']) for r in records)} action errors, {sum(len(r['recoveries']) for r in records)} recoveries, {sum(r['failedVisits'] for r in records)} failed visits, {sum(r['score']['undeliveredOrders'] for r in records)} undelivered orders, and {money(-sum(r['ledger'].get('fine',0) for r in records)/100)} in fines. These outcomes remain in the report."]
for arm in ["planner", "future", "payments"]:
    parts = summary[arm]["meanLedgerDifferenceEuros"]
    lines += ["", f"{arm} mean profit change: " + "; ".join(f"{kind} {money(value)}" for kind, value in parts.items() if value) + "."]
lines += ["", "## Remaining limits", "", "- The common scenarios are eight parameter sensitivities, with analytically integrated customer wins. They are not a full multistage model of correlated bookings, drops or future demand.", "- Capacity reservations, future value, payment response and refund/undelivery tails contain explicit unvalidated assumptions. Better booking prediction on historical accepted work does not identify counterfactual payment effects.", "- Candidate generation is bounded, holds at most six anchors, and omits two-uncertain-request pairs, larger routes, private addresses and trade-ins. Rescue behavior remains inherited. Omitted candidates and overflow posts are logged.", "- The API cannot add charging to an already-booked route. Changed-route exposure remains logged and paid; it is not claimed solved.", "- A passing development screen only nominates a finalist. Freeze one policy before generating untouched seeds. The 24-pair minimum remains a floor; the current 95% qualification target needs at least 86 zero-failure pairs at the first allocated alpha, and possibly more for profit variance.", "- No ranked round, test final or final was entered. No leaderboard rank or global optimum is inferred from these seeds.", "", "Reproduction: [frozen manifest](../experiments/portfolio-development-v1.json), [protocol](../experiments/portfolio-v1-protocol.json), [audit](portfolio-development-v1-results.json), [server operations](portfolio-development-v1-operations.json), [code and commands](../research/portfolio/README.md), [pre-quote model check](portfolio-prior-check.json).", ""]
(ROOT / "docs/portfolio-development-findings.md").write_text("\n".join(lines))
decision = {"role": "development nomination only", "selectedForValidation": report["selectedForValidation"], "promoted": False, "preservedSelection": "experiments/current-selection.json", "lowerLevelCandidate": "research/low-level/bundle", "report": "docs/portfolio-development-v1-results.json", "findings": "docs/portfolio-development-findings.md", "rankingAuthorized": False, "finalAuthorized": False}
(ROOT / "experiments/portfolio-decision.json").write_text(json.dumps(decision, indent=2) + "\n")
