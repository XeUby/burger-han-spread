# Menu choice intervention: proposed development study

## Decision and hypothesis

The hybrid's demand model ignores the offered menu, while its single-option policy changes the dealer's choice set. The prior single-option intervention lost €557/week on six familiar development weeks. Restoring options is not a new treatment: the preserved portfolio benchmark already offers menus. The next question is whether changing relative option prices shifts awards toward less urgent delivery, or mainly loses orders.

Primary hypothesis: raising only the same-day price by 10%, while leaving every later option and its price unchanged, changes the probability of a same-day award. The prespecified mechanism outcomes are later-option awards and no purchase, all measured per randomized eligible request, including losses. Do not condition comparisons on winning. No assumption of increased profit is required or claimed.

The historical screen (`research/menu-choice/screen.py`, `docs/menu-choice-screen.json`) verifies exposure in eight hash-checked familiar weeks: 1,354 eligible menus among 4,532 executed quotes; a 40/week, 8/day cap selects 318. This is a nomination screen, not a simulation of changed demand. Successful acknowledgements were used retrospectively; prospective eligibility and assignment must precede transmission and retain failed or ambiguous actions.

## Policy and identification

Use the incumbent's selected, unanchored quote on a single public leg, with no note and a menu containing same-day and at least one later option. Preserve admission, every offered deadline, later prices and all fulfillment actions. Exclude anchor reservations so the intervention does not silently invalidate a joint quote plan. At most 40 assignments per week and eight per day, counting both arms and unsuccessful transmissions.

Randomize each eligible decision with probability 1/2 to its original menu or the same menu with `same_day = ceil(1.10 * originalSameDayPrice)`. Fix the assignment seed and deterministic hash algorithm before play. Assign a request once; preserve the assignment across any repeated delivery path. Log the full original and transmitted action, request, state features, assignment probability, quote acknowledgement and chosen option or no purchase. Unknown mutation results are unknown, never losses. Disable the scalar demand update for every assigned request in both arms, because it cannot represent the intervened menu; retain all data for the separate choice analysis. Real trust and capacity continue to respond to observed outcomes.

The local estimand is the randomized menu effect under the sequential exploratory policy and its eligibility history. Report per-week inverse-probability-weighted contrasts for same-day, later-option and no-purchase outcomes; use week-level uncertainty, not independent-order standard errors. Capacity and trust couple assignments. This does not identify the value of applying the intervention to every quote, arbitrary menu removal, other price shifts or different operating regimes.

## Complete policy comparison and stopping

Before any creation, freeze eight fresh development seed pairs: exact incumbent versus bounded menu exploration, sixteen unranked worlds, alternating launch order. Both arms use the separately tested readiness handshake with the same unchanged solver objective and 0.2-second CP limit. Verify frozen-control conformance outside that lifecycle change. The full-policy comparison includes both relative-price exploration and suppression of unsupported demand updates; it cannot attribute their separate weekly effects.

Allow at most three newly running worlds while the interrupted private world remains unfinished, so this assistant has at most four unfinished worlds. Always enforce the shared eight-world cap under the existing creation lock. Use the existing 600-second world limit, stop further creation on runtime failure, retain active outcomes and partial artifacts, and never replace adverse worlds. No ranking or finals. Freeze all source, settings, assignment seeds, seed exclusions, report logic and decision rules before execution.

Complete the fixed panel before the planned economic comparison. Report paired weekly profit, qualification, orders, driver payments, refunds, cancellations, failed visits, fines, undelivered work, action/runtime failures and uncertainty. An interrupted panel cannot pass support or promotion gates. Report every attempted case, including never-started cases.

## Decision rule

This is a data collection study, not a promotion candidate. Require at least 100 acknowledged assignments per arm across at least six weeks, plus at least 20 later-option awards overall, and no unknown assignment outcomes before fitting a menu-response model. These counts only permit analysis; they do not establish identification outside the two tested menus. If support fails, stop without extending the panel or tuning the price shift.

First report the randomized contrasts, including null or adverse results. A reduction in same-day awards without a corresponding increase in later awards indicates demand loss rather than substitution at this perturbation. Assess whether uncertainty is narrow enough to justify implementing option-specific choice valuation; do not infer a response merely from the sign of the mean. Any fitted model must face a separate frozen whole-week holdout against a constant option-share baseline and the existing scalar model. Final policy promotion still requires the existing untouched validation and reliability rules.

Execution status is recorded in the versioned manifest, attempt journal and results report. This design is frozen before any world creation.
