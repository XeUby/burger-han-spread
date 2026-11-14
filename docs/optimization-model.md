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

Driver price learning remained a distinct mechanism for a bounded test. The documented learning anchor is the first fee actually viewed, not the creation fee; the earlier zero-time creation-price probe did not test this. Any experiment must count the cost of establishing that behavior and retain rescue failures. The following trial tested actual exposure and failed its continuation rule.

## Bounded first-view fee experiment

The [frozen protocol](../experiments/viewed-fee-protocol.json) tested whether a limited early investment could change later driver behavior enough to improve whole-week profit. During the first day, eligible new posts displayed 1.5 times their normal opening fee for five minutes, then restored the exact normal schedule if unbooked. Exposure reserved its entire possible initial premium against a €600 weekly cap. Customer pricing, admission and route composition remained the validated control. This isolated an untested mechanism after the larger architecture trials; it was not a new validated dispatcher.

The two matched old development seeds were 14 and 15. A third world, with the exposure disabled, exactly reproduced the archived seed14 events and score. The predetermined continuation rule required at least €1,500 average gain, no loss on either week, both qualified, and no undelivered orders or failed visits. Code and settings stayed frozen throughout. Five focused tests and strict TypeScript checking passed before launch.

| Seed | Control net | Exposure net | Paired gain | Orders | On time | Driver fees | Late refunds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 14 | €10,120.20 | €9,723.91 | −€396.29 | 273 | 98.53% | €17,748.36 | €194.44 |
| 15 | €11,063.77 | €11,031.07 | −€32.70 | 326 | 92.64% | €25,803.47 | €1,476.01 |

Both treatment weeks qualified, with zero undelivered orders, failed visits, fines or recoveries. Mean profit fell €214.50/week. Mean driver fees rose €1,156.49 while revenue rose only €961.90; changes in late refunds and release fees account for the rest. The three refused reprices followed same-minute bookings and remain in the [full report](viewed-fee-results.json). There were no failed restorations or runner interruptions.

Of 39 exposed gigs, 38 booked during the higher-fee period. They incurred €821.81 in total initial premiums across both weeks, relative to those same gigs' intended opening fees. Only one gig reached restoration and subsequently booked below its exposed fee. There were 77 view events during exposure, but views do not prove that a driver could perform the job. The intervention mostly bought immediate bookings at higher prices; it supplied little evidence about learning from falling fees. Its whole-week economics were negative.

Decision: reject this implementation, with no adjustment of pulse duration, size or budget and no further confirmation or fresh validation. This does not prove that driver learning has no value. It shows that this bounded attempt to influence it did not earn back its cost. The validated control remains unchanged; no ranking or final was played.

The next route-composition question is whether the pair-only architecture leaves useful three-or-more-car routes unused. In the four archived development controls, respectively 55, 109, 46 and 85 won requests belonged to batches containing at least three wins. These are acquisition-event counts, including later cancellations, not feasible route counts or a profit forecast. A useful next probe must test stop-window feasibility and actual shared work for larger routes before treating those batches as savings.

## Multi-car routes and broader admission

The [feasibility screen](multi-routes-screen.json) replayed first holding batches using public events in time order, without looking at later cancellations or terminal gig membership to select candidates. On the existing accepted work, a wider four-car route policy found 57 routes containing at least three cars and modeled €504.14/week lower opening fees. Simply increasing route length under the narrower payment assumptions added only €4.86/week beyond net-cost-aware pairs. Neither estimate predicted realized profit or ruled out an architecture that changes accepted work.

The new planner enumerates sequential routes of up to four cars, checks all stop windows and stated hours, allows 90 minutes for booking, protects 30 minutes of delivery slack, and enforces the 720-minute driving limit. It prices the route using 80% of modeled saved work, capped at a 45% discount, and compares that fee against the actual discounted single-car alternatives. It chooses disjoint routes by exact set packing for queues up to 20 candidates and uses greedy packing above that size. Enumeration has a 30,000-extension limit; no tested batch hit that limit. These are finite-model optimization guarantees, not global dispatcher optimality.

The [frozen protocol](../experiments/multi-routes-protocol.json) tested two policies on old matched seeds 09, 10, 14 and 15. Both hold jobs 30 minutes and use route-based pay. The first retains incumbent admission. The second raises regional daily capacity from 0.35 to 0.55 per weighted driver, backlog from 0.08 to 0.12, and the same-day unbooked limit from four to six. Customer pricing, the 700km route limit, minimum driver supply and cheap single-car opening fees remain the control's rules. This tests the interaction of expanded admission with different fulfillment, without the generous early driver payments that defeated the earlier volume architecture.

The large-gain hypothesis was that less repeated travel and fewer driver commitments would reduce rescue costs and support additional profitable volume. It would be falsified if routes failed to book reliably, or if final driver costs and lateness consumed the additional revenue. Eight focused tests and strict TypeScript checking passed. An additional disabled-policy control exactly reproduced the archived seed14 event history and score.

| Policy | Mean weekly net | Paired gain | Mean orders | Qualified | Aggregate on time | Mean driver fees | Mean late refunds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Validated control | €11,790.90 | — | 316.25 | 4/4 | 96.28% | €20,969.28 | €664.68 |
| Larger routes | €10,803.72 | −€987.19 | 315.25 | 4/4 | 95.00% | €21,506.14 | €1,038.56 |
| Larger routes and broader admission | €11,767.98 | −€22.92 | 330.25 | 4/4 | 95.53% | €22,309.55 | €934.53 |

| Development seed | Larger-route gain | Larger-route and volume gain |
| --- | ---: | ---: |
| 09 | +€19.74 | +€711.62 |
| 10 | −€2,833.21 | −€1,207.51 |
| 14 | −€1,032.77 | −€135.40 |
| 15 | −€102.50 | +€539.61 |

The first policy formed 73 three-or-four-car routes across four weeks; the volume policy formed 80. Thus larger route formation was implemented and exercised, rather than rejected by a narrow estimate alone. Broader admission increased throughput 4.43%, but its €1,579.64/week additional revenue was absorbed by €1,340.27 more driver fees and €269.85 more late refunds, partly offset by €7.56 lower release fees. Larger routes alone increased driver fees despite their modeled opening savings. Requested route savings are not final ledger savings.

All eight treatment weeks qualified, with no undelivered orders, failed visits or recoveries. There were 63 late orders for larger routes and 59 for the volume version, versus 47 in the control. The route-only arm incurred one €100 charging fine after a booked destination change; the volume arm had no fines. One stale reprice after a same-minute booking was retained and audited. All nine worlds ended, including replication; terminal ledgers, source hashes and settings were checked against the frozen plan. Complete outcomes are in [multi-routes-results.json](multi-routes-results.json).

A seed10 diagnostic found that 32 of the route-only policy's 33 late orders finished as single-car gigs; larger routes generally booked quickly. This suggested possible competition for drivers, but the [overlap check](multi-routes-displacement.json) found only one of 23 matched orders that became late had its baseline driver physically occupied on a treatment large route at the baseline pickup minute. That does not support direct displacement as the dominant explanation. Reservations, payment expectations, posting timing and other changed assignments remain possible causes; this analysis does not isolate them.

Decision: reject both frozen implementations. Neither reached the €1,500/week improvement gate, and both exceeded the allowed €1,000 worst weekly loss. No candidate proceeds to confirmation or fresh validation; the validated control remains unchanged. No within-study parameter rescue is justified by the near-zero average of the volume arm.

The public leaderboard was refreshed through its read-only API during this study. Its leading five-run average remained €17,185.02/week, with 97.28% on time; the [observation](multi-routes-board.json) preserves the timestamp and source. Those are different hidden ranking seeds. No rank or causal performance gap can be inferred for these development policies, and competitiveness remains unproven. No ranking or final was entered.

## Fulfillment cost and four new development weeks

The arrival-time cost model groups orders connected by shared gigs, so shared fees are not arbitrarily assigned to individual cars. It uses public request and prior-commitment features; final outcomes supply labels only. Six old development weeks trained one frozen ridge model. Four newly generated weeks were declared development before play. On these four weeks the feature model reduced group-cost RMSE by5.27% against the incumbent1.15cost ratio but only0.365% against a fitted scalar, winning two of four weeks. It failed the predeclared prediction gate and was rejected without a rescue fit.

The fitted scalar0.97804 then received four matched whole-week development tests. Throughput rose17.6%, but mean net profit fell€1021.86: added revenue was outweighed by driver fees and late refunds. A single bounded countertest at cost ratio1.35 cut volume and raised on-time share, but lost€664.40/week. Both policies qualified in four of four weeks and delivered every order, yet neither passed the substantial-gain gate. Neither advances to fresh validation. These are four unique weeks with repeated policies, not twelve independent weeks. Changed accepted work and capacity use prevent treating the old predictive cost estimate as a causal cost forecast under new prices.

All outcomes, errors and ledger checks remain in `docs/cost-calibration-results.json` and `docs/cost-premium-results.json`. The selected control is unchanged. The registry in `experiments/seed-registry.json` excludes all observed seeds from future untouched validation. `experiments/search-integrity.json` records prospective freeze, unique-week, minimum-panel and sequential multiplicity rules; it does not retroactively correct historical selection. No new independent validation look was spent by these cost studies.

## Authorized level compatibility and ranking

The user subsequently authorized one quick unranked check at each level1–7, followed by five ranked runs per level, with no ranked execution after09:00 Helsinki on14November2026. This supersedes the earlier no-ranking restriction only for that scope. `experiments/levels-ranking-protocol.json` freezes the already validated control and its exact settings; no experimental cost model is used. The scheduler allows four unfinished team worlds, one ranked run per level, checks the current season before creating worlds, and blocks new starts at08:55 and all ranked mutations at08:59:55 Helsinki. Compatibility checks do not establish safety or constitute a fresh comparative validation panel. Every ranked outcome is retained; scores cannot trigger policy tuning or replacement runs.

## Cross-level transfer failure and corrective experiments

The level8 control was not competitively validated for levels1–7. Seven unranked smoke checks passed delivery qualification but showed poor profit; treating that as adequate support for ranking was an error. Four first ranked runs were started at levels1–4. Following the user's correction, they were allowed to finish and all four qualified, at€923.47,€605.36,€869.72and€849.88respectively. The temporary process pause caused recoveries in three runs; that operational disturbance is retained in their records. No further ranked worlds were created: the blocked level5create is an orchestration event with no world, not a consumed attempt. No final was touched.

The first abundance probe changed admission and economic assumptions together on one reused development seed. Levels1and2failed qualification; levels4and6did not improve net profit. This is one seed block, not four independent observations. A frozen36world2×2development study now compares unchanged control, economic settings only, admission only, and their combination on three seed blocks at levels1,4,7. The prespecified interaction is coupled−economics−admission+control, evaluated within seed and level. No pooling across levels conceals an adverse result, and omitted levels are not implicitly validated.

A separate archival diagnosis found a semantic error belowlevel4. The server selects the request's first option regardless of the quoted option; the incumbent can instead pass feasibility on a later option. In the failed level1probe149wins omitted the first option, and34of those were late. This identifies a contract mismatch, not a causal benefit estimate. A separate frozen27worldstudy compares the unchanged control, first-option feasibility alone, and first-option feasibility with an admission floor based on actual opening pay. Driver payments and regional admission limits stay unchanged in that study. All three levels1–3 are tested on the same three development seed blocks; levels2and3 share base worlds and do not add independent evidence.

Every candidate, unsuccessful outcome, cost and reliability metric remains in explicit protocols and attempt logs. Neither development study may authorize promotion or further ranking. Any selected candidate requires an untouched frozen panel under the existing prospective integrity rules. If sufficient validation is not complete before09:00Helsinki, remaining ranked attempts stay unused; the deadline is not grounds to weaken the evidence standard.
