# Booking, capacity value and acquired routes

Research resumed on 14 November 2026 on `codex/standalone-dispatcher`, initially at commit `b913677`. The checkout was clean. No repository or ancestor `AGENTS.md` existed; the user's supplied shell-format instructions apply. No local experiment process was running. The server reported zero unfinished team worlds at 07:17:44Z and again at 07:31:32Z. Its RULES, HANDBOOK and API documents were byte-identical to the checked-in copies.

The current limit is **four unfinished team worlds**, overriding the historical eight-slot exception. The new runner uses two workers, a local creation lock and a fresh team occupancy check before each creation. `search-integrity.json` and the general level-search runner now enforce the four-world limit. Historical eight-slot protocols remain historical records. No ranking, test final or final is authorized by this study.

## Preserved controls

`experiments/current-selection.json` still selects the independently evaluated level-8 payout policy. `src/policy.ts` and its settings are unchanged. The separate `research/low-level/bundle/` candidate retains its first-option and opening-cost fixes and its development-only status. The new research class has all interventions disabled by default. On three recorded development streams it reproduces 4,717 control actions and 12,109 decision frames exactly; this is behavioral conformance, not counterfactual performance evidence. See `value-control-conformance.json`.

The mechanism-only arm enables first-option/opening-cost admission below level4 and filters already-known stale actions. Unit tests compare its low-level quotes and payments against the archived low-level candidate. It has no independent validation claim.

## Mechanism contract

| Mechanism | Evidence and treatment |
|---|---|
| Awarded option | Rules specify the original first option at list price below level4. Candidate checks that option; an infeasible first option cannot be replaced with a later one. The raw benchmark intentionally retains its historical behavior. |
| Capabilities | Level1 has one fee and one car; schedules begin at2; bundles and offers at3; competitive quoting at4. The inherited fulfillment code gates these actions. No new private-address or multi-leg admission is enabled. |
| Driver eligibility | Premium experience, manual licence, plates and charging requirements remain in posts and offer feasibility. Visible home supply is a feature, not an assignment guarantee. |
| Changed-route charging | Open gigs are withdrawn and replanned with the changed route. A low-charge car that changes from <=200km to >200km after booking can retain a post without charging. The API has no stop-edit action; release is costly before start and unavailable after start. This unresolved exposure remains in every relevant outcome. It is explicitly logged as `booked_charge_risk`, not claimed fixed. |
| Deadlines | Expired requests produce no quote. Existing opening-hour, latest-pickup, charging and route-window checks remain. Anchored routes are rechecked after the quote resolves. |
| Stale actions | Before sending a queued offer/reprice/withdrawal, the opt-in guard drops actions for gigs already known booked or removed. Synchronous withdrawals can still race later events; refusal retains the original gig and solo fallback. Every refusal remains recorded. |

The existing109 tests and nine new research tests passed before freezing. New tests cover control conformance, the separate lower-level candidate, option semantics, censored online learning, week reset, stale actions, changed-route charging limits, anchored-route fallback, ID relabeling and bounded randomization. The normal and research TypeScript projects passed.

## Models and architectural changes

`research/booking-response/dataset.py` selects one complete run per underlying historical seed, without selecting by profit, and extracts public features at order award. It excludes IDs and reveal fields from predictors. The deterministic seed split places57 weeks in training and19 in model testing. Repeats, forks and related levels cannot cross the split. These76 already-familiar seeds remain development data.

Three fixed models predict booking within120 minutes of award, any drop and late delivery: a pooled probability, logistic regression and a small boosted tree model. The report keeps per-week metrics and censored labels. On the19 model-test weeks, mean booking Brier scores are0.09065,0.07597 and0.06996 respectively. Late-delivery scores are0.01911,0.01770 and0.01752. These estimates describe the accepted workload; they do not identify untried payment responses or the value of acquiring rejected work. Final gig membership can lose cancelled/shortened cars; unmapped labels remain censored. A neural network is deferred given the small number of independent weeks and incomplete action coverage.

The live policy uses only a descriptive training-only booking prior and a fixed online update rule. It does not deploy the fitted trees or reinterpret their associations as a fee-response model. A cohort updates the posterior only after its entire120-minute horizon is observed; early cancellations are censored. Each week resets identically.

The capacity treatment prices outstanding work using booking experience, uncertain pending wins and local supply. It retains count safeguards at1.5 times their prior bounds, adds a scarcity charge to customer pricing, and subtracts a bounded positioning credit derived from requests already seen. It does not force work into invented future driver schedules. The constants are assumptions to falsify with whole-week results.

The route treatment searches before accepting for a feasible pair with an **already-won** order. It discounts modeled savings for anchor-booking risk, reserves each anchor once, and recomputes the route after the new quote wins. It withdraws only an open singleton; a refusal leaves both work commitments recoverable. Prices still account for the possibility of solo fulfillment. This differs from the rejected two-uncertain-request acquisition implementation.

The driver treatment reuses the existing, tested return-offer feasibility helper after capacity and route treatments change the workload. The old screen only measured opportunities under the incumbent workload. Its incremental comparison is combined minus capacity-routes, not a rerun of a claimed new offer algorithm.

## Frozen development study

`experiments/value-protocol.json` declares comparisons, outcomes, failure handling and development gates. `experiments/value-development-v1.json` freezes34 worlds, six underlying seed blocks, exact source/prior hashes and settings. Four old level8 seeds receive six policies; two additional familiar seeds receive mechanism/capacity comparisons at levels1 and4. Two level8 worlds add at most20 randomized opening-payment interventions each. Probabilities, actual fees, action failures and subsequent outcomes are retained. Orders within a world are not independent experimental weeks.

There is no favorable interim stopping. Runtime failures stop new creation and preserve the world. No validation seeds are generated by this protocol. A finalist must first pass the development gates; fresh evaluation must then satisfy `search-integrity.json`, including at least24 unique pairs, prespecified sample-size and reliability requirements, and the existing alpha-spending rule. No result below that standard changes the selected control.

Rebuild and verify the frozen bundle on a fresh checkout:

```bash
python3 research/value/freeze.py --rebuild
node --test research/value/policy.test.ts
npx tsc --noEmit -p research/value/tsconfig.json
```

The runner refuses a second launch when its attempts ledger exists. This prevents accidental duplicate weeks after a lost polling session. Raw events, decisions, source snapshots and credentials stay in ignored local paths. The manifest, protocol, code and aggregate audit are versioned.
