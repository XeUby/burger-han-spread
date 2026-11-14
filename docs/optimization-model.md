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

The payout-only experiment separates customer pricing costs from driver payouts. Its opening-only variant reduces the initial unbundled fee by 15% while preserving escalation and rescue fees. It passed the two-week development screen and four predeclared confirmation weeks; a frozen 12-pair independent evaluation is running. The full-schedule reduction failed qualification on one screening week. Neither treatment changes the selected default, which retains `payout=1` pending independent evaluation.

An initial eight-week evaluation exposed a recovery defect: after a dealer changed a local trip into a longer one, the fee ceiling still reflected the original short trip. The final version scales the fee by `max(1, (45 + new road minutes) / (45 + original road minutes))`, and recomputes local driver eligibility/supply using the changed legs. The 45 minutes represent fixed mobilization work. This is a conservative cost approximation for a changed contractual obligation, not an estimate of a driver's hidden reservation price. It does not change the agreed customer quote. A targeted replay checks the failed order, and a fresh eight-week panel evaluates the corrected source; the first panel is retained as development evidence for this correction.

The final experimental runner copies source, official client and trial plan into a content-addressed directory before starting Node. This prevents a later edit from changing the source associated with a delayed trial. The final validation uses one frozen revision and configuration across every reserved week, and the report rejects missing, duplicate or mixed-revision comparisons.
