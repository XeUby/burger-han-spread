# Optimization model and experimental protocol

The problem is an online, partially observed stochastic control problem. We observe requests, drivers' profiles, gig views, bookings and completed deliveries. We do not observe drivers' work schedules or reservation costs, or the competing quotes. Decisions change future driver behavior and dealer trust. A deterministic vehicle-routing optimum on the visible requests would therefore solve a different problem.

## Objective and constraints

For a policy π and a complete simulated week ω, let M(π,ω) be final ledger margin, N be won noncancelled orders, and L be late or undelivered orders. The exact qualification condition is N > 0 and L/N ≤ 0.10. The primary optimization target is high margin subject to reliable qualification:

    maximizeπ  E[M(π,ω)]
    subject to Prω(N > 0 and L ≤ 0.10 N) ≥ 1 − δ.

This chance constraint is a design objective, not a guarantee supplied by the implementation. Driver failures, snow, flu and common origins correlate lateness, so a binomial calculation treating individual orders as independent would overstate certainty. Whole unseen weeks are the appropriate evaluation units. The game ranks realized margin in one secret week, rather than this expected objective, so the lower tail and probability of disqualification must also be reported.

A useful local approximation assigns each request j an expected delivery cost c_j, lateness probability ℓ_j, resource demand a_j, and win probability q_j(p) at quote p. For fixed delivery decisions, a relaxed admission/price objective is:

    maximize  Σj q_j(p_j) [p_j − c_j − μ·a_j − λ(ℓ_j − 0.10)].

Here μ prices scarce driver capacity and λ prices consumption of the lateness allowance. This is a Lagrangian approximation: it does not make random order counts or correlated outcomes independent. Current code approximates capacity protection through explicit regional daily load and unbooked-backlog limits, plus a cost floor. It does not estimate calibrated per-order lateness probabilities or solve the full chance-constrained program.

Hard restrictions remain outside the price model: eligibility, opening hours, charging, plates, response times, offer quotas, and vehicle requirements. An infeasible request receives an intentionally losing quote, which carries no learning signal about the market.

## Adaptive pricing approximation

For a request with list price v and dealer trust multiplier τ, define normalized price r = p/(vτ). The documented trust increase is τ = 1 + 0.01 min(25,n), where n counts the dealer's on-time orders and a late delivery halves n. An experiment may deliberately use a smaller trust coefficient to leave more surplus with the dealer; that is a pricing choice, not the rule of the simulator.

The demand model is:

    q(r,x) = sigmoid(b[θ(x) − r])
    θ(x) = θ₀ + u_world + u_day + u_origin + u_destination + u_dealer + u_distance x_distance.

The cold level-8 prior has θ₀ = 1.4 and b = 14. Effects start at zero with independent Gaussian prior standard deviations 0.10, 0.16, 0.06, 0.06, 0.04 and 0.04 respectively. Distance is centered on 200 km, divided by 200 km, and bounded to [−1,2]. A new day introduces a fresh effect, while the global and market effects carry information forward. This allows a temporary price war to affect its day more than future days. The model does not explicitly identify outages, competitor feedback, or dealer-specific dissatisfaction.

After a genuine quote resolves, the binary won/lost observation updates the coefficients and their full covariance using an online Gaussian approximation to logistic Bayesian inference. With feature vector z including the slope, predicted probability q, covariance C, v = Cz and h = q(1−q):

    C_new = C − h vvᵀ/(1 + h zᵀv)
    mean_new = mean + v(y−q)/(1 + h zᵀv).

The covariance keeps correlated features from each receiving an independent full update. This is a one-step approximation, not exact posterior inference. Rare surprising outcomes can move a small-sample estimate substantially; the Gaussian priors, pricing bounds and admission controls limit the practical impact. The slope and prior variances are hypotheses, not simulator parameters recovered from source.

For fixed estimated cost c, the quote routine solves the one-dimensional objective

    maximizep∈[p_min,p_max]  (p−c) sigmoid(b[θ−p/(vτ)]).

For p ≥ c, its derivative has the sign of

    1 − b(p−c)(1−q)/(vτ).

The subtracted term increases with p, so the objective is unimodal on the profitable domain. Bisection finds its continuous maximum; checking neighboring integer cents and interval boundaries obtains the discrete choice, up to floating-point precision. If the whole allowed interval is below cost, the best endpoint is also considered. Tests compare the result with exhaustive integer search.

This optimization is exact only for the specified demand curve, cost estimate and price interval. Its output is not a proof that the resulting dispatcher is globally optimal.

## Multiple options and feedback limitations

The dispatcher currently gives feasible options the same trust-adjusted list-price ratio. It learns one binary request-level outcome at that ratio. This treats dealer choice among speeds as a nuisance variable. It does not model option substitution with a multinomial choice model, or optimize different option markups jointly. Cancellation occurs after acceptance and is not evidence of a lost price competition.

Rejected requests and unobserved alternative quotes are censored. The reveal never identifies competitor prices or exact driver costs. Therefore historical win rates identify acceptance only on the prices and admissible requests actually tried. A fitted model should not be evaluated as if it knew counterfactual outcomes. Deliberate million-euro decline quotes must be excluded; repeated outcome events must not update the model twice.

Quote optimization and fee optimization interact. A lower customer price can increase wins and exhaust capacity. A lower driver fee can reduce cost but delay booking and teach drivers to wait for increases. Raising fees may restore reliability yet remove customer margin. Experiments should isolate these decisions before evaluating their combination.

## Hypotheses and experiments

1. Adaptive demand estimates outperform a fixed price multiplier when the world's price level, daily war and local competition change. Compare identical fee, eligibility and capacity rules, changing only the adaptive pricing switch.
2. Earlier targeted offers reach active or recently displaced drivers before the rescue fee grows. Compare identical quotes and fees, changing only offer timing and recipient scoring; examine accepted offers, booking delay, fees, drops and lateness.
3. A lower opening fee increases margin only if booking delays and rescues do not erase the saving. Measure final driver cost per delivered order, not merely opening prices.
4. A wider admissible request set adds value only when note interpretation and feasibility remain correct. Evaluate note safety separately from capacity and price changes.
5. Resource-aware pricing or admission should outperform a raw driver-count cutoff during bulk orders and flu. Distinguish booked work from unbooked exposure and check demand concentration by origin and pickup day.

Development uses fixed common seeds across candidates. The same seed does not make all future random events identical after policies diverge; it does hold the underlying world configuration constant, and is the supported comparison method. Run records must retain settings, source hash, seed, world identifier and final ledger/qualification metrics. Paired differences in final margin are more informative than unmatched averages.

An independent validation set is generated and frozen before its outcomes are read. The final candidate is selected on development evidence, then compared with the frozen baseline on the same unseen weeks. Eight unseen weeks provide useful comparative evidence but weak evidence for extremely rare disqualification. Even eight qualifications out of eight have a one-sided 95% exact lower confidence bound of only about 68.8% for qualification probability under independent identical week sampling. Repeated runs of one deterministic seed are not additional independent observations.

Report all paired margins and qualification outcomes, their mean and median difference, minimum on-time share, and downside outcomes. Do not select a new candidate using the validation results and continue calling those weeks unseen. If validation drives another change, treat those seeds as development and generate another untouched set. Prediction scores from replay are diagnostic; only full policy rollouts test profit and reliability after the policy changes the market.

The current approach is deliberately tractable: learn uncertain demand online, optimize a scalar quote, protect capacity explicitly, and use the simulator to falsify policy hypotheses. Bundling, a driver-specific acceptance model, matching of direct offers, and a joint choice model are candidates for further work; none should be described as implemented without corresponding code and validated experiments.

## Selected implementation

The selected policy uses the slope-14 demand model, a quote cost estimate of 1.15 times its canonical base fee, a minimum quote of that fee divided by 0.90, and no fixed euro addition. Its regional daily capacity factor is 0.35 and backlog factor is 0.08, with a minimum backlog allowance of two. A separate limit of four weighted unbooked jobs removes the same-day option for cars ready today; later feasible options remain available. Routes may be up to 700 km and require at least eight weighted eligible local drivers. These constants are development choices, not analytical safety guarantees. The exact selected settings and provenance are in [final-config.json](../experiments/final-config.json) and [current-selection.json](../experiments/current-selection.json).

Expanded note recognition accepts only fully understood harmless and equipment clauses. Unknown timing restrictions, private-address jobs and trade-ins still receive intentionally losing quotes. Early offers and explicit conservative pickup cutoffs were tested but are disabled in the selected policy. Safe public single-car posts wait up to 15 minutes for feasible sequential pairing. Deadline fee escalation and emergency direct offers remain active; the validated late-rescue rule briefly reduces eligible unbooked single-car fees after on-time pickup is no longer possible, then escalates on a fixed clock.

The selected opening-only payout policy reduces the initial unbundled fee by 15% while preserving customer pricing costs, bundle fees, escalation and rescue fees. It passed the two-week development screen, four predeclared confirmation weeks, and a frozen 12-pair independent evaluation. Mean paired gain was €636.44/week (+6.76%), with a 95% bootstrap interval of €228.53–€1,008.66; all twelve candidate weeks qualified with no undelivered orders or failed visits. Aggregate on-time share declined from 97.98% to 96.21%, and the minimum candidate week was 93.80%. This reliability tradeoff remains material despite passing the frozen rule. Defaults are now `payout=0.85` and `openingOnly=true`; action-level conformance verifies the selected settings against the frozen candidate. The full-schedule reduction remains rejected after failing qualification on one screening week.

An initial eight-week evaluation exposed a recovery defect: after a dealer changed a local trip into a longer one, the fee ceiling still reflected the original short trip. The final version scales the fee by `max(1, (45 + new road minutes) / (45 + original road minutes))`, and recomputes local driver eligibility/supply using the changed legs. The 45 minutes represent fixed mobilization work. This is a conservative cost approximation for a changed contractual obligation, not an estimate of a driver's hidden reservation price. It does not change the agreed customer quote. A targeted replay checks the failed order, and a fresh eight-week panel evaluates the corrected source; the first panel is retained as development evidence for this correction.

The final experimental runner copies source, official client and trial plan into a content-addressed directory before starting Node. This prevents a later edit from changing the source associated with a delayed trial. The final validation uses one frozen revision and configuration across every reserved week, and the report rejects missing, duplicate or mixed-revision comparisons.

## Architectural development screen, 14 November

Three substantially different policies completed four matched development weeks each (09, 10, 14 and 15). All twelve outcomes are retained in [architectures-results.json](architectures-results.json), with the frozen hypotheses, settings, source hash, world IDs, ledgers and action-error contexts. The [protocol](../experiments/architectures-protocol.json) was fixed before the trials. An additional control replication exactly reproduced the archived seed 14 event history and terminal score. The existing validated policy remains selected and unchanged.

The selection rule required at least €1,500 mean weekly improvement, no paired loss worse than €1,000, all four qualifications, no undelivered orders and no failed visits. None passed; none proceeds to independent validation. These four selected development weeks are not a fresh estimate of generalization performance. Their control mean differs from the earlier independent panel because the seeds differ.

| Policy | Mean weekly net profit | Paired gain | Mean orders | Qualified | Aggregate on time | Mean driver fees | Mean late refunds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Validated control | €11,790.90 | — | 316.25 | 4/4 | 96.28% | €20,969.28 | €664.68 |
| Joint acquisition and routes | €11,287.25 | −€503.66 | 358.25 | 4/4 | 94.84% | €24,809.44 | €1,024.07 |
| Service-day capacity pricing | €3,196.02 | −€8,594.89 | 459.75 | 2/4 | 87.55% | €40,439.62 | €4,183.83 |
| High volume and proactive pay | €4,787.61 | −€7,003.29 | 387.25 | 3/4 | 93.29% | €37,021.00 | €1,554.03 |

Order counts follow the terminal score, which excludes cancelled orders. Across four weeks, the control had 47 late and 0 undelivered orders; joint acquisition had 74 late and 0 undelivered; calendar planning had 227 late and 2 undelivered; high volume had 104 late and 0 undelivered. All policies had zero failed visits. Qualification is the simulator's eligibility flag, not a ranking submission.

### Joint acquisition and routes

Mechanism: collect requests until just before their response deadlines, form feasible hypothetical pairs and optimize both customer prices before either order is accepted. The modeled objective is `q1(p1−c1) + q2(p2−c2) + q1*q2*S`, where S is the modeled shared-route saving. This assumes conditionally independent wins. A leg may be priced below its standalone cost; unmatched requests use incumbent admission. Accepted jobs wait 30 minutes for route composition, with connectors up to 90 km.

The potential large gain was access to complementary work that standalone admission rejects, plus lower combined fulfillment cost. The hypothesis would fail if the additional acquired routes did not cover solo fallback costs, driver fees and refunds. The earlier roughly €299/week estimate used narrower connectors, discounts and incumbent demand; it was a model-based deferral, not adequate evidence against this architecture.

Result:1,216 jointly quoted requests and 402 custom bundle compositions. Terminal multi-order gig counts were 397 across four weeks, compared with 153 for the control; cancellations can shorten terminal routes, so these are not original creation counts. Throughput rose 13.28%. Mean revenue rose €3,712.96, but driver fees rose €3,840.16 and late refunds rose €359.39. Mean net fell €503.66; the worst paired loss was €1,207.37. More shared routes alone did not create enough economic value. Reject this implementation, without claiming that joint acquisition is intrinsically inferior.

### Service-day capacity pricing

Mechanism: replace ready-day count and backlog gates with expected pending work and committed won work assigned to service days. Compare option/day choices using a convex load-dependent quote cost and enforce the chosen service day in posted stop windows. The potential gain was selling idle future service capacity and charging for scarce days. The workload budget was a heuristic, not a feasible schedule for individual drivers.

Falsification: additional work must book and deliver without driver costs and lateness consuming its revenue. The earlier €84/week screen protected booked work on every possible day and kept incumbent quotas; that conservative model did not rule out this policy.

Result:2,651 calendar quotes, including 1,172 assigned later than the original ready day. Throughput rose 45.38%, establishing that substantially more demand was available. But the capacity estimate did not protect fulfillment: mean driver fees rose €19,470.34 against €14,741.56 additional revenue, late refunds rose €3,519.16, and two orders remained undelivered. Seed 15 ended at−€8,331.35 and 76.83% on time. Reject this implementation. The findings require a different model of bookable driver capacity before another calendar policy deserves testing; they do not prove that future-day scheduling has no value.

### High volume and proactive pay

Mechanism: remove cumulative daily admission limits, expand live backlog and route eligibility, pay 1.10 times canonical fees initially and 1.30 after 45 minutes, then 1.50 after 120 minutes, with deadline rescue. Hold new jobs 5 minutes and repeatedly rematch compatible open singles into routes. The potential gain was earlier driver commitment supporting more throughput and dealer trust, with shared routes offsetting the higher pay.

Falsification: extra revenue must exceed the combined cost of generous pay, congestion and refunds. Earlier low-fee volume failures and static early-rescue exposure screens did not test this combination.

Result:2,633 high-volume quotes,206 initial custom compositions and 74 successful rematches. Throughput rose 22.45%, but mean driver costs rose €16,051.72 against only €10,001.04 additional revenue. Mean net fell €7,003.29 and seed 15 failed qualification at 88.92% on time. Reject this implementation. Paying more early did not make the extra work profitable or reliably deliverable.

### Audit and decisions

All thirteen worlds, including control replication, ended. Source and protocol hashes match their frozen values, and every terminal ledger sums to its score. There were no runner interruptions or recoveries. Five action errors remain in the report: four stale reprices after same-minute drop/rebooking, and one withdrawal refused after a same-minute order change and booking of an existing bundle. That bundle remained booked and reached terminal status `done`. No failed outcome was replaced.

Each architecture also incurred a €100 charging fine on seed 14 after the same low-charge car's destination changed from Vantaa to Pori while booked. This is an exposed route-change handling limitation, not a failed visit, and is included in net profit. The frozen trials were not patched or rerun to remove it. Future broader policies need to reassess equipment when booked routes change.

The control stays selected. No architecture met either the promotion screen or its optional redesign condition of at least 25% more throughput with nonnegative mean profit gain. Therefore there is no fresh validation panel or ranking/final submission for these candidates. More demand and more composed routes are demonstrated; a competitive improvement is not.

The next distinct mechanism worth a bounded test is driver price learning: compare a policy that rarely rewards waiting with deadline escalation, measuring realized booking costs and later booking behavior. The documented learning anchor is the first fee actually viewed, not the creation fee; the earlier zero-time creation-price probe does not test this. Any experiment must count the cost of establishing that behavior and retain rescue failures. It should not be presented as a proven gain or as another way to tune away the losses above.
