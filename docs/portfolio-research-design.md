# Route portfolios, pricing and fulfillment under uncertainty

Status: the [standard solver and live adapter](../research/portfolio/README.md) are implemented and checked. The first 16-world comparison is frozen in [the manifest](../experiments/portfolio-development-v1.json) and [executable protocol](../experiments/portfolio-v1-protocol.json); results are tracked in [the complete-attempt audit](portfolio-development-v1-results.json). Only four familiar development seed blocks are used. It incorporates the [researcher note supplied on 14 November](researcher-note-2026-11-14.md) and the [completed second-round evidence](second-round-findings.md).

## What the completed panel establishes

The local capacity-price implementation lost €287.32/week at level 8. Anchoring acquisition to already-won work gained €126.49, and their combination gained €172.87, on four familiar blocks. The combination gained €1,620.86 in revenue but spent an additional €1,021.06 on drivers and €404.18 on refunds, plus fines. Five additional return offers produced three expirations and two declines. None of these facts rejects the broader joint-planning hypothesis.

The completed precursor assigned a discounted credit to one anchor at a time and still relied on inherited fulfillment rules. The new adapter compares competing customer prices, route commitments and payment schedules under common parameter scenarios. This addresses that omission; uncertain outcomes are still integrated analytically rather than modeled as a full multistage scenario tree.

## Decision contract

At each material public event, build a bounded set of alternatives: retain the current plan, quote a legal customer option at one of several prices, acquire a request for solo fulfillment, acquire it for an anchored route with a solo fallback, post a feasible route, offer it to an eligible driver, or change an open gig's payment. Include the incumbent's next action so that the planner has an executable fallback.

Each alternative carries its required commitments, earliest execution time, public features, scenario outcomes, and a concrete next API action. Route generation should reuse the tested opening-hour, deadline, licence, plates, premium and charging checks. Below level 4, the awarded first option must remain the one evaluated. A known driver is not reserved capacity.

Mutually exclusive prices or payment schedules for the same job cannot both be selected. No request, acquired order, driver-time resource or anchor can be consumed twice. Existing commitments retain a feasible continuation in every modeled adverse scenario. A customer rejection, competing anchor booking or driver refusal must lead to an explicit fallback, not silently erase fulfillment cost. Recheck current state immediately before the next action; process its result and newly arrived events before solving again.

The known charging defect is a prerequisite mechanism issue. A new route that needs charging must include it when posted. If an already-booked route changes and the API cannot amend stops, represent the legal release/repost choices and costs before start, and record the unavoidable exposure after start. Do not label a scenario safe by assuming an unavailable API action.

## One economic objective

For each scenario, compare the candidate with keeping the current commitments and continuation policy:

`incremental customer revenue − incremental fulfillment costs − incremental refunds and penalties + change in future earning value`

The initial future-value approximation can use geographic and time-specific capacity prices plus positioning. It must account only for earnings beyond the explicit planning horizon. If a learned state-value model later includes capacity and positioning, it replaces those terms; adding both would count the same future value twice. Costs for an existing anchor enter as the difference from its baseline continuation, not as either a free resource or a newly purchased full route.

Scenarios should share the same latent draws across competing plans: customer wins, anchor survival until quote resolution, booking delays, drops, delivery tails and future request flow. Payment changes affect booking scenarios only through a declared response model or explicit sensitivity range. Optimistic associations in historical accepted work are not a causal response curve.

Qualification risk needs its own constraint, not merely a small expected refund penalty. Track already consumed lateness allowance and plausible additional failures among existing commitments. Freeze the risk measure, scenario generator, risk budget and fallback rule before play. A model-based risk limit remains an assumption to validate with whole-week qualification.

## Standard solvers and honest guarantees

Use [NetworkX maximum-weight matching](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.matching.max_weight_matching.html) when the subproblem consists solely of additive, disjoint pair choices. Use integer monetary weights and `maxcardinality=False`; pairing more jobs is not the objective. The completed oracle check already demonstrates why the current large-component greedy fallback is not a general optimizer.

Once alternatives overlap beyond pairs or share regional capacity, time, risk or payment-choice constraints, formulate route selection with binary variables using [OR-Tools CP-SAT](https://developers.google.com/optimization/cp/cp_solver). Scale coefficients explicitly to integers. Record solver status, objective, bound, gap and elapsed time; a time-limited feasible answer is not a proved optimum. Even a proved optimum applies only to the supplied candidate set and modeled objective, never to the full game. Benchmark the actual formulation before choosing the live solver or integration method; do not introduce a bespoke search as a default.

The cited [same-day delivery pricing paper](https://arxiv.org/abs/1912.02946) provides precedent for joint pricing/routing with approximate future values and uncertain travel times. Its reported results concern another simulation problem and supply no Spread performance estimate.

## Learning and data collection

Keep offline priors and within-week inference separate. Fit customer-choice and booking-delay models on entire seed groups; compare pooled/simple models with boosted trees before adding capacity. The 40 randomized posts from two blocks provide initial action coverage, not a stable payment-response estimate. Preserve assignment probabilities, actual rounded fees, escalation, failed posts, cancellations, expiry and censoring. Treat shared-world interventions as dependent.

Further payment exploration should be a separately frozen bounded protocol, with the same eligible action set in every treatment and risk limits that protect existing commitments. Record the chance of every sampled action, including the reference action. Identify which regime/fee/route combinations lack support before proposing a model. Use conservative response ranges where support is absent rather than extrapolating a confident booking curve.

For the portfolio prototype, log candidate plans and the same scenario draws used to compare them. Log enough public state to reproduce every score and constraint. Offline replay can verify feasibility, accounting and solver behavior; it cannot score the counterfactual world that would follow a different accepted order or payment. Any state-value fit needs trajectories spanning multiple policies, a whole-seed split and a feature cutoff at the decision time. End-to-end reinforcement learning remains deferred.

## Bounded next comparison

First implement and test the candidate schema, economic accounting, scenario coupling, solver interface and stale-state fallback. Then write an executable manifest with exact features, candidate bounds, prices/payments, scenario count, randomization, training hashes, risk limits, runtime limits and source hashes. This document alone is not that freeze.

A targeted development comparison should separate four policies: preserved mechanism control; joint quote/route portfolio with fixed payment and no terminal future value; that portfolio plus future value; and that portfolio plus payment choices. This tests whether global competition among plans helps before attributing an effect to a learned capacity value or payment response. A candidate generating no meaningful changed actions fails the mechanism screen even if it runs without errors. The previous factorial comparison remains historical development evidence, not a substitute for ablations of the new planner.

Bound the first live panel to four predeclared development seed blocks crossed with those four arms, with two workers and at most four unfinished team worlds total. Complete all planned outcomes irrespective of profit, with declared operational stopping. Preserve every error and partial world. Do not tune on a partly completed panel. Customer-choice, payment-response or state-value models revised from these outcomes retire the whole panel to development.

Carry forward the €1,500 paired mean development gain requirement, reliable qualification buffer and complete cost accounting. A passing screen only nominates a finalist. Freeze that one policy and its complete evaluation procedure before generating untouched weeks. The 24-pair minimum remains a floor: the current prospective calculation needs at least 86 zero-failure pairs for a 95% qualification lower bound at the first allocated alpha, and more if variance or reliability targets demand it. No new alpha has been allocated. Ranked rounds, test finals and the final remain outside this research authorization.
