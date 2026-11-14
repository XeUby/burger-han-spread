# Pricing mechanics research

This study investigates legal game decisions through the documented ordinary-practice and fork APIs. It uses no ranking runs, final worlds or undocumented access. Root coordinates subsequent simulation launches; the completed probe used one base world and one temporary fork at a time, and deleted both after collecting results.

## Quote-menu response surfaces

Six requests with multiple delivery options were tested on the seed `mechanics-menu-01`. Each individual option received a binary price search, followed by joint menus and menus containing deliberately expensive alternatives. Complete quotes and outcomes are in `runs/menu-probe-mechanics-menu-01.json`; the reproducible probe is `analysis/menu-probe.ts`.

In all six cases, the common-markup menu won near the maximum acceptable individual-option markup and lost 0.04 above it. Adding expensive alternatives did not change the observed cheap option's outcome. These observations do not support a useful extra-lottery effect from padding the menu.

The dealer's value of speed is material. For one request, same-day delivery won around 1.01 times its list price, while next-day and three-day options lost even around 0.59 times their respective list prices. The binary search's lower bound was 0.60; values reported at that boundary are censored, not confirmed winning thresholds. Across the other requests, next-day acceptable markups were often below same-day acceptable markups. The six requests do not identify the simulator's complete choice model, but they falsify the assumption that an arbitrary slower option can replace same-day delivery without losing demand.

The resulting experiment is an urgency premium, rather than dropping fast options. `src/menu.ts` adjusts same-day prices only when there is another feasible option, optionally discounts slower choices, retains the cost floor, and returns the minimum normalized price for request-level learning. That minimum remains an approximate sufficient statistic: a fully specified model would predict both acceptance and the chosen speed. Full-week trials must decide whether the menu increases profit after demand and capacity respond.

## Transferable market priors

The training allowlist fixes 24 world IDs from 24 distinct seeds in `analysis/market-training-selection.json`. These worlds contain 11,313 genuine offered quotes. Artificial decline quotes are excluded. One full run per seed is used, and folds are assigned by a deterministic hash of the seed. No seed occurs in both training and evaluation within a fold.

A regularized logistic fit estimates stable origin and destination effects while treating world and world-day effects as nuisance terms. Price is normalized by list price and the documented dealer-trust factor. A quote's prediction uses only preceding resolved outcomes during evaluation; pending outcomes become observations when they actually resolve. Models are compared by chronological online replay on the held-out seed folds.

| Model | Prior weight | Log loss | Brier score |
| --- | ---: | ---: | ---: |
| Current online model | 0 | 0.55920 | 0.18723 |
| Origin and destination prior | 0.5 | 0.54584 | 0.18188 |
| Origin and destination prior | 1 | 0.54481 | 0.18085 |
| Origin, destination, dealer and distance prior | 1 | 0.54791 | 0.18200 |
| Above plus individual lane prior | 1 | 0.55541 | 0.18441 |

The place prior improves log loss by approximately 2.6% and Brier score by 3.4%. Static dealer and individual-lane tables add complexity without improving held-out performance. The production candidate therefore uses only the origin/destination prior, and still learns each current world's conditions online.

`src/place-market.ts` implements the prior through the same threshold used for both prediction and learning. A zero weight reproduces the original model exactly in tests. `src/place-prior.ts` records the coefficients, training world IDs and quote count. The trainer verifies that cached observations match the explicit allowlist; it never discovers new training worlds from current experiment results. Cross-validation fits and per-week losses remain in `analysis/market-prior-cross-validation.json` and `analysis/market-prior-evaluation.json`.

Prediction scores are conditional on historical offered prices and selected requests. They do not prove that different prices improve profit, and they do not identify counterfactual demand. Full policy trials remain necessary. The prior's allowlist includes the previously reported validation weeks; those weeks are now development data for this feature. A new validation set is required for claims about its generalization.

## Structured war/outage mixture: not promoted

An offline alternative considered 600 hidden schedules: five possible price-war weekdays, a distinct outage weekday, and one of 30 outage centers. The documented 80 km straight-line region, 20% price-war reduction and 30% outage increase defined the state effects. Bayesian likelihood weights were combined with the existing Gaussian demand residual, and several likelihood temperatures were tested.

The best log loss was 0.55774, versus 0.55920 for the current model; Brier score was 0.18569 versus 0.18723. This improvement is small, and less than the simpler place prior. The mixture was not promoted to production or given simulation slots. The experiment and per-world results are retained in `analysis/evaluate-regime.ts` and `analysis/regime-evaluation.json` so the negative result remains reviewable.

The game does contain abrupt regime changes, but the current day-specific online effects already adapt to them. Encoding the narrative more literally did not by itself establish a useful optimization advantage.
