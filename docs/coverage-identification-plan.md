# Coverage study: hypotheses, estimands and decision rules

Status: pre-execution design for development data collection. The original `coverage-development-v1` source freeze has not been run. This document narrows its interpretation before any outcome exists. Reproducibility is established separately from economic validity; this study cannot validate the dispatcher architecture or establish leaderboard superiority.

## What changes, and why

The current portfolio cannot observe fulfillment outcomes for requests excluded before optimization. Its payment model is not conditioned adequately on the actual action. The study collects randomized support for those decisions while retaining the incumbent as a benchmark. It does not replace the objective with a newly fitted model during execution.

All eight underlying weeks are familiar development seeds. Prior policies and all failed attempts remain available. The current candidate and historical control remain unchanged. No observation from this study is eligible for future untouched validation.

## Hypotheses and identification

| Question | Assignment and estimand | Primary outcome | What it cannot identify |
|---|---|---|---|
| H1: Can some physically feasible incumbent-excluded public single-leg work be acquired profitably? | At each eligible request, assign decline, quote at 1.25 list, or quote at 1.50 list with probability 1/3 each; realized quotes have a 1.35 base-fee floor. Estimate assignment effects conditional on the logged history and eligibility. | Realized request contribution through week end, with zero revenue/cost for lost requests and attributed payments, refunds and penalties for won work. Report acquisition probability and reliability alongside contribution. | Private/trade-in work, unsupported notes, requests outside the exploration limits, globally expanding acceptance, or displacement costs inferred from request contribution alone. |
| H2: Does changing opening payment alter booking and eventual costs? | First 40 eligible posts per week; assign 0.92, 1 or 1.08 times opening fee with probability 1/3 each, clipped to the next step. Estimate the total effect of that assignment under the frozen continuation policy. | First-gig booking within 120 minutes, including unsuccessful posts in assignment accounting; eventual driver payment, drop and refund outcomes reported separately. | A standalone opening-price effect holding all subsequent actions fixed, the value of an untried rescue policy, or causal effects from historically selected posts. |
| H3: Does an 8% higher targeted offer improve acceptance enough to cover its cost? | First 40 offers already chosen by the incumbent targeting rule; randomize original versus 1.08 fee with probability 1/2. | Accepted, declined and expired outcomes, plus resulting fees, kept distinct. | The benefit of sending an offer versus no offer, optimal targeting, or treating expiration as refusal. |
| H4: Does delaying intermediate escalation improve whole-week profit? | Randomly select four of the eight weeks for a 60-minute delay; four retain the original schedule. Opening, final rescue and urgent schedules remain unchanged. Assignment uses a recorded random nonce before execution. | Whole-week net profit; qualification and on-time delivery are mandatory companion outcomes. | A reliable general effect from four versus four weeks, or the value of escalation under a different non-exploratory policy. |

The action randomizations are mutually independent by domain conditional on their recorded histories. Earlier assignments change later eligibility and state. Request/post/offer contrasts therefore describe local assignment effects under this exploratory policy, not independent replications or an additive decomposition of the whole policy value. H4 includes these sequential effects. No order-level standard error will be presented as week-level evidence.

The payment floor and schedule clipping can collapse nominal arms to the same realized action. Report both assigned arms and actual prices, including the fraction of assignments whose actions coincide. Do not remove these observations or reinterpret nominal-arm estimates as an unconstrained price elasticity.

## Observation and attribution

Record all candidates and omissions before assignment. For eligible units retain assignment probabilities, pre-action features, actual action, action result, event identifiers and the week/regime. Count control assignments, unsuccessful actions, dropped work and operational failures against the fixed budgets.

For booking, retain assignment time, posted gig ID, booking time, first competing close (withdrawal, expiration or cancellation), and available follow-up. A competing event is not an unobserved refusal. Week end before 120 minutes is right censoring. Unknown mutation results remain unknown; do not assign zero cost or reconstruct a successful exposure without evidence. Report the full assignment denominator separately from observed-outcome denominators.

Aggregate order contribution only from ledger rows whose order attribution is explicit. Report unallocated bundle/other ledger values separately and do not invent per-order shares. Use full-week ledger totals for policy effects and capacity/displacement consequences. Report predictions or proxies separately from realized outcomes.

## Analysis and minimum support

Complete all eight planned worlds before economic analysis. No outcome-dependent replacement or expansion. Preserve runtime failures and all partially observed assignments. If a world is interrupted, retain its exposure data with explicit follow-up boundaries; do not use its administrative end score as a policy outcome.

First report assignment counts, realized treatment separation, observations and failures by week and arm. A mechanism is **unsupported** for fitting if any compared arm has fewer than 12 assignments, fewer than 3 contributing weeks, or fewer than 10 relevant observed events overall (wins for acquisition, bookings for payments, accepted offers for offer models). These are minimum screening conditions, not proof of adequate statistical power. Inadequate support leads to an explicitly narrower subsequent study, not extrapolated response curves.

For H1–H3, report per-week arm means and inverse-probability weighted descriptive assignment contrasts. Retain eligibility and censoring tables. Report week-level uncertainty, making the small number of clusters explicit. Do not treat overlapping requests or repeated offers as IID. H4 reports its randomized 4-versus-4 difference and the exact 70-allocation randomization distribution under the sharp null, as a diagnostic only. No hypothesis is a promotion gate, and there is no multiple-testing claim of a successful policy search.

Compare each complete exploratory week with the exact archived candidate on that seed. This measures the joint exploratory package; it does not isolate its components. Report profit, qualification, throughput, driver payments, refunds, undelivered work, failed visits, fines, action failures and runtime failures. Never select a regime solely because it happened to have the largest mean on four weeks.

## Economic model checks before structural deployment

The next model work must compare three levels of complexity on the same observed support:

1. A constant response and cost baseline estimated only from training weeks.
2. A small interpretable model using route length, slack, exposure, eligible supply, actual payment and weekly regime.
3. The existing portfolio heuristic, with its predictions reconstructed only from decision-time information; flag any prediction that cannot be reproduced.

Use leave-one-underlying-week-out predictions for development diagnostics. Related worlds and interventions from the same seed stay in one fold. Evaluate booking probabilities with Brier score and log loss, realized cost with absolute error and residual bias by action/slack regime, and decision rankings with randomized supported outcomes. Historical accepted-order accuracy alone does not validate rejected-work acquisition or untried actions.

A more complex model is eligible for the subsequent structural experiment only if it has adequate support, improves held-out mean Brier score by at least 0.01 or cost absolute error by at least 10% versus the constant baseline, and improves the chosen metric in at least 6 of 8 held-out weeks. It must also beat the corresponding existing heuristic on that metric, and show no unsupported extrapolation in the proposed action set. These are predeclared development screening rules; failure retains the simpler model or prompts a targeted coverage study. Passing is not evidence of higher policy profit.

Capacity value and option-choice models remain unvalidated by this panel. They require their own explicit hypotheses and supported interventions. Do not infer an opportunity-cost model from unallocated request profit or fit customer menu choice to single-option probes.

## Structural comparison and final validation

After support/model checks, freeze each structural policy with a concrete predicted mechanism and strong simple baselines: current candidate, option-specific standalone acquisition using conservative observed cost, then route-before-acceptance with explicit partial-win fallback. Keep route feasibility separate from economics and retain OR-Tools for the formulated selection problem. Solver optimality is only a correctness check for that model.

The subsequent bounded six-seed structural comparison must measure whole-week profit and qualification, not only predictive scores. Require at least €1,500/week mean gain against the retained candidate, all weeks qualifying, minimum weekly on-time share of 92%, and no undelivered work, failed visits or fines before considering a finalist. Report uncertainty and counterevidence; do not tune repeatedly until these familiar weeks pass.

Freeze one finalist before generating untouched weeks. Follow `experiments/search-integrity.json`: at least 24 unique paired weeks, preallocated multiplicity, fixed stopping and sample size driven by profit variance and qualification bounds. The reliability requirement may require at least 86 zero-failure weeks at the first allocated confidence level. Preserve failed attempts. Any panel used to revise a policy becomes development. Ranked submissions require separate explicit authorization for the frozen policy and round.
