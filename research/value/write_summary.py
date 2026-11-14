import json
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
report=json.loads((ROOT/"docs/value-development-v2-results.json").read_text())
if not report["terminal"]:
    raise RuntimeError("Do not write a final decision before every trial is audited")
if len(report["benchmarkReplications"])!=4 or not all(r["identicalEvents"] and r["identicalScore"] for r in report["benchmarkReplications"]):
    raise RuntimeError("Investigate benchmark drift before writing conclusions")
payment=json.loads((ROOT/"docs/value-development-v2-payment-probes.json").read_text())
selection=report["selectedForValidation"]
money=lambda x:f"€{x:,.2f}"
percent=lambda x:f"{x:.2%}"
arms=["benchmark","mechanisms","capacity","routes","capacity-routes","combined"]
lines=["# Second research round: decisions and limitations","",f"All {report['expected']} frozen replacement worlds completed. They represent six familiar underlying seed blocks: four at level 8 and two shared across levels 1 and 4. No untouched validation, ranking, test final or final was run.","",("No candidate passed the declared development gates. Keep the validated level-8 control and the separate lower-level development candidate unchanged." if selection is None else f"The {selection} arm passed the development gates. It is a finalist for a separately frozen fresh evaluation, not a promoted policy."),"","## Level 8","","| Policy | Mean net profit | Paired gain vs mechanisms | 95% paired-t interval | Qualified | Minimum on time | Mean driver payments | Mean refunds |","|---|---:|---:|---|---:|---:|---:|---:|"]
for arm in arms:
    row=report["summary"]["8"][arm];p=row["versusMechanisms"]
    interval=p["t95Euros"]
    lines.append(f"| {arm} | {money(row['meanProfitEuros'])} | {money(p['meanEuros'])} | {money(interval[0])} to {money(interval[1])} | {row['qualified']}/{row['weeks']} | {percent(row['minimumOnTime'])} | {money(row['meanDriverPaymentsEuros'])} | {money(row['meanRefundsEuros'])} |")
lines += ["","Intervals are descriptive under independent-week/paired-t assumptions. Four adaptive development blocks do not justify confirmatory inference; the JSON also reports whole-week bootstrap sensitivity. Even four qualifying weeks imply only a 47.29% one-sided 95% lower qualification bound under IID-week sampling.","","All four benchmark replications exactly match the archived event histories and scores. Every complete score reconciles to the full ledger and terminal order counts. No failed outcome is removed from a mean.","","## Hypothesis decisions",""]
for arm in ["capacity","routes","capacity-routes","combined"]:
    row=report["summary"]["8"][arm]
    reasons=[]
    if row["versusMechanisms"]["meanEuros"]<1500:reasons.append("mean gain below the declared €1,500 threshold")
    if row["qualified"]<row["weeks"]:reasons.append("qualification failures")
    if row["minimumOnTime"]<.92:reasons.append("a week below 92% on time")
    if row["aggregateOnTime"]<report["summary"]["8"]["mechanisms"]["aggregateOnTime"]-.005:reasons.append("aggregate on-time decline exceeded 0.5 percentage points")
    if row["undelivered"] or row["failedVisits"]:reasons.append("undelivered work or failed visits")
    decision="Eligible only for fresh validation" if row["developmentGatePassed"] else "Do not promote this implementation"
    lines.append(f"- **{arm}: {decision}.** {('; '.join(reasons)+'.') if reasons else 'All development criteria passed.'} Throughput averaged {row['meanOrders']:.2f} orders/week; aggregate on-time share was {percent(row['aggregateOnTime'])}.")
for key,title in [("capacityRouteInteraction","Capacity/route interaction"),("driverOfferIncrement","Incremental return-offer effect")]:
    p=report["contrasts"][key]
    lines.append(f"- **{title}:** {money(p['meanEuros'])}/week, with paired differences {', '.join(money(x) for x in p['differencesEuros'])}. This comparison separates the specified mechanisms; it does not generalize beyond these weeks.")
lines += ["","## Where the profit went","","| Treatment | Revenue change | Driver-payment change to profit | Refund change to profit | Fine change to profit | Release-fee change to profit | Net change |","|---|---:|---:|---:|---:|---:|---:|"]
for arm in ["capacity","routes","capacity-routes"]:
    row=report["summary"]["8"][arm];ledger=row["meanLedgerDifferenceEuros"]
    values=[ledger.get(k,0) for k in ["revenue","driver_fee","late_refund","fine","release_fee"]]
    lines.append(f"| {arm} | "+" | ".join(money(v) for v in values+[row["versusMechanisms"]["meanEuros"]])+" |")
offers=[o for r in report["records"] for o in r["returnOfferOutcomes"]]
answers=Counter(o["answer"]["answer"] if o["answer"] else "unobserved" for o in offers)
lines += ["","These are paired whole-week ledger differences, not causal costs assigned to individual routes. Higher revenue and throughput did not imply a comparable net-profit gain. The routing arms also exposed the known changed-route charging defect.","",f"The added return-offer mechanism sent {len(offers)} offers: {dict(answers)}. Its zero profit increment does not test whether a calibrated driver-aware payment planner could help; this particular filter and offer rule produced no accepted offers on these weeks."]
lines += ["","## Other regimes","","| Level | Policy | Mean net profit | Paired capacity gain | Qualified | Minimum on time |","|---|---|---:|---:|---:|---:|"]
for level in ["1","4"]:
    for arm,row in report["summary"][level].items():
        lines.append(f"| {level} | {arm} | {money(row['meanProfitEuros'])} | {money(row['versusMechanisms']['meanEuros'])} | {row['qualified']}/{row['weeks']} | {percent(row['minimumOnTime'])} |")
lines += ["","There are only two underlying blocks here, shared across levels. Two successes yield a 22.36% one-sided 95% qualification lower bound. These checks cannot validate transfer across levels 1–8.","","## Payment interventions","","| Opening multiplier | Assigned | Observed 120-minute outcome | Booked within 120 minutes |","|---|---:|---:|---:|"]
for dose,row in payment["summary"].items():lines.append(f"| {dose} | {row['assigned']} | {row['observed120']} | {row['booked120']} |")
lines += ["","Each of at most 20 eligible posts per world used recorded probability 1/3 for each multiplier. These interventions came from two seed blocks with sequential interference, not 40 independent weeks. Unread offers, closed gigs, cancellations, failed posts and censored booking outcomes must not become imaginary driver-cost labels. No fee response or payment policy is promoted from this sample.","","## Operational audit",""]
complete=report["records"]
lines.append(f"The replacement panel retained action errors: {sum(len(r['actionErrors']) for r in complete)}; recoveries: {sum(len(r['recoveries']) for r in complete)}; failed visits: {sum(r['failedVisits'] for r in complete)}; undelivered orders: {sum(r['score']['undeliveredOrders'] for r in complete)}; fines: {money(-sum(r['ledger'].get('fine',0) for r in complete)/100)}. Error contexts remain in the JSON. The booked-reroute charging limitation is still unresolved.")
lines += ["","The first panel suffered an unplanned CPU interruption: five full worlds, two partial worlds and 27 unstarted trials remain recorded separately. The two partial worlds were administratively closed without further dispatch; those administrative scores are not full-week policy evidence. Version 2 changed only redundant computation and durability/budget handling, with a new freeze. Its benchmark replications and offer-equivalence tests detect behavioral drift.","","## What remains weak","","- The capacity price uses heuristic work budgets and a pooled booking prior; it does not estimate causal driver availability or marginal capacity value.","- Anchored routes use fixed uncertainty discounts. Fallback, driver learning, release/booking interactions and changed-route charging still matter.","- Historical models learn on accepted work. Cost prediction gains are small, and the better 99th-percentile tail model is conditional on delivery and uses award-time features.","- The current matching fallback is greedy above 20 connected nodes. NetworkX verified 48 small cases and exposed a larger counterexample; no whole-game optimality claim follows.","- Any promotion requires a frozen evaluation procedure and untouched seed panel. At the first alpha allocation, at least 86 zero-failure weeks are required for a 95% qualification lower bound, before any larger profit-driven sample size. The 24-pair floor is insufficient for that reliability claim.","","Exact results: [paired audit](value-development-v2-results.json), [payment outcomes](value-development-v2-payment-probes.json), [interruption record](value-development-interruption.json), [protocol](../experiments/value-v2-protocol.json), [frozen manifest](../experiments/value-development-v2.json), [model study](booking-response-models.json), [cost/tails](booking-cost-and-tail-models.json), [NetworkX check](value-networkx-check.json).",""]
lines += ["## Next architectural departure","","The attached researcher note distinguishes the tested local adjustments from a portfolio planner. The next design compares mutually exclusive customer quotes, routes and payment schedules under common scenarios, executes one action and replans. Use NetworkX for pure disjoint pairs and a standard integer solver when capacity, overlapping routes and payment choices couple the decisions. A solver optimum is only as meaningful as the candidate set and economic model. See [portfolio research design](portfolio-research-design.md). This design has not been implemented or played; it is not a validated solution.","","The [final server audit](value-operations-audit.json) verifies that all research worlds ended as unranked practice worlds. The server reported zero unfinished team worlds at that check. Occupancy observations and their limits are retained.",""]
(ROOT/"docs/second-round-findings.md").write_text("\n".join(lines))
decision={"role":"development selection only","selectedForValidation":selection,"promoted":False,"preservedSelection":"experiments/current-selection.json","lowerLevelCandidate":"research/low-level/bundle","report":"docs/value-development-v2-results.json","findings":"docs/second-round-findings.md","rankingAuthorized":False,"finalAuthorized":False}
(ROOT/"experiments/value-decision.json").write_text(json.dumps(decision,indent=2)+"\n")
print(json.dumps(decision))
