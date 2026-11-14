# Burger Han — optimized Spread dispatcher

A TypeScript dispatcher for Bahn's level 8 challenge. It learns the price market from its own wins and losses, optimizes expected contribution, and limits exposure to scarce drivers. Node 22.18 or newer; no runtime packages required.

## Latest independent comparison

The late-rescue candidate was frozen before eight fresh paired weeks. All sixteen ordinary practice worlds reached their terminal minute; their whole-week ledgers and delivery counts match the official scores.

| Metric | Validated bundle policy | Bundle policy + late rescue |
| --- | ---: | ---: |
| Mean weekly margin | €9,070.28 | **€9,352.92** |
| Qualified weeks | 8/8 | **8/8** |
| Aggregate on-time delivery | 97.80% | 97.85% |
| Lowest weekly on-time delivery | 96.46% | 96.78% |
| Undelivered orders | 0 | 0 |

Mean gain is **€282.64/week (+3.12%)**, with seven wins, one tie and no losses. The 95% paired bootstrap interval is €149.16–€423.22; the exact two-sided sign-test p-value is 0.015625. Most of the gain is lower driver fees (€273.78/week), with smaller refunds (€8.75/week). Both arms had the same single rejected reprice and no network recoveries. See the [complete comparison](docs/late-rescue-validation.md), [audit](docs/late-rescue-validation-audit.json), and [frozen manifest](experiments/late-rescue-validation-manifest.json). These are ordinary practice results, with no ranking submissions.

The public leaderboard leader averaged €16,631.51 over five different secret weeks at the recorded observation. That is a comparison target, not a controlled estimate of our rank. The [public snapshot](docs/leaderboard-observation.json) preserves the observation.

On an earlier independent panel, broader admission plus bundles improved mean weekly margin from €8,242.34 to €10,411.59, a **26.32%** gain, with all eight weeks qualified. See the [bundle comparison](docs/frontier-validation.md). The earlier policy had improved from €5,541.90 to €8,418.62 on another panel ([report](docs/optimization-validation.md)). Means from different panels are not paired treatment comparisons. None establishes global optimality or a rare-failure guarantee.

## Research and reproducibility

The selected source is frozen under `experiments/frontier/late-rescue/`; the previous validated bundle source remains under `experiments/frontier/candidate/`. Exact source hashes and settings are in [source-index.json](experiments/frontier/source-index.json). The complete current configuration is [final-config.json](experiments/final-config.json), with provenance in [current-selection.json](experiments/current-selection.json). The standalone default uses the validated late-rescue policy. [Conformance evidence](docs/late-rescue-conformance.json) compares all 5,614 emitted actions and decision times against the frozen source on three old development streams. Other research features remain opt-in.

The late-rescue policy briefly lowers an unbooked single-car gig's fee after its last possible on-time pickup. It then escalates again on a fixed clock, reaching the full rescue fee within six hours. Repricing cannot restart that clock. Booked drivers and shared gigs are excluded. Development [screening](docs/late-rescue-results.md) and [confirmation](docs/late-rescue-confirmation.md) preceded the fresh evaluation.

A note-hours treatment passed its initial screen but [failed confirmation](docs/note-hours-confirmation.md), so it remains disabled. A [direct-offer head-start probe](docs/offer-window-probe.json) found no benefit. New offline screens found limited scope for [crediting completed work against daily capacity](docs/admission-screen.json) and only €77.39/week of modeled gain from [correcting the expected paid option value](docs/menu-value-screen.json), before extra congestion. Neither was added to the policy. [Current experiment state](experiments/frontier-status.json) records runs and decisions.

A more aggressive pre-deadline fee cap had only €13.53/week of favorable hindsight exposure before omitted trust costs ([screen](docs/economic-rescue-screen.json)), so it was rejected. Strict spelling correction finds about20 otherwise-feasible requests/week in old data. Its [semantics probe](docs/note-spelling-probe.json) checked21 orders with no unmodeled restrictions; all157 reviewed corrections match the implementation. A frozen two-seed matched screen gained€396.89/week, with both weeks qualified and all27 newly accepted corrected-note orders on time ([results](docs/note-spelling-results.json)). Four predeclared confirmation weeks gained€600.75/week, positive in every pair; all40 corrected-note orders were on time ([confirmation](docs/note-spelling-confirmation.json)). Semantic audits found no unmodeled restrictions in the67 active corrected-note orders across development. Fresh evaluation gained€184.87/week (+1.95%), but its95% paired interval spans−€251.05 to€527.21, so it failed the predeclared promotion rule and remains disabled ([validation](docs/note-spelling-validation.md)). All65 corrected-note orders were on time and the semantic audit found no unmodeled restrictions. The largest whole-week loss was€1,157.42; extra revenue was outweighed by fees and refunds on that week.

A zero-time creation-fee anchor probe produced identical11,941-event histories and€10,369.66 margin in all three arms, so that hypothesis was dropped ([audit](docs/fee-anchor-results.json)). A bounded relisting probe gave5 versus3 bookings within30minutes at identical terms across12 cases; unchanged repricing exactly matched holding. All36 temporary forks were deleted and the unchanged base week reproduced its archived history ([audit](docs/relisting-results.json)). The handbook specifies one notification per order, so this is not evidence of renewed notifications; the internal cause remains unresolved ([correction](docs/relisting-interpretation.json)). The one-repost policy passed its frozen two-week screen with€220.81/€283.63 gains, both qualified and no undelivered work or action errors ([results](docs/relisting-policy-results.json)). Four predeclared confirmation weeks gained€389.08/week, with3wins and1loss of€71.12; all qualified with no undelivered work or failed visits ([results](docs/relisting-confirmation-results.json)). Three refused reprices followed a same-minute drop and expiry; no repost failed. Fresh evaluation gained only€39.46/week (+0.50%), with a95% paired interval of−€142.63 to€233.05; it failed the frozen profit promotion rule and stays disabled ([validation](docs/relisting-validation.md)). All8 treatments qualified, no orders were undelivered, and no visits failed. Aggregate on-time delivery improved from98.19% to98.80%, but this does not override the predeclared profit gate.

A recent-viewer offer probe stopped at the shared four-play guard when3external worlds appeared. Its7completed cases had no accepted offers at either the public fee or a10% discount, and matched control bookings. All21forks and the archived paused base were deleted. This is an incomplete probe, not a12-case completed result ([audit](docs/viewer-offers-results.json)). Future full-week tests use1worker to reserve3slots for teammates.

A payout-only screen separates a 15% unbundled fee cut from customer pricing: full-curve and opening-only variants retain the incumbent quote formulas and bundle schedules. Opening-only gained €1,093.57/week across two old development seeds, both qualified. Full-curve failed because one week delivered only 89.10% on time. Opening-only then gained €1,776.87/week in four predeclared confirmation weeks, improving every week with all four qualified and no undelivered work or failed visits. Two stale reprices followed a same-minute drop and expiry. A frozen 12-pair independent evaluation is running serially; defaults retain `payout=1` ([screen](docs/payout-results.md), [confirmation](docs/payout-confirmation.md), [evaluation manifest](experiments/payout-validation-manifest.json)).

Recombining already-waiting single-car gigs found only three extra pairs per week and €42.96/week of modeled opening-fee savings in six old weeks. This is an opportunity screen, not measured profit; the small exposure does not justify a live test yet ([screen](docs/rolling-bundles-screen.json)).

An offline screen found 57.67 rejected requests per week with feasible later-day pickup and delivery. Replaying the original market model reproduced all 5,807 historical option prices exactly and estimated €518.99/week of added contribution before future capacity and booking effects. Protecting booked commitments and assigning unbooked jobs once across service days reduced modeled contribution to €84.15/week, so this version is deferred. No policy or live trial has been added ([audit](docs/flexible-admission-screen.md)).

Both study runners cap workers at four, serialize their own creations, and check total unfinished server worlds before each creation. Coordinate separate runners so their creation checks cannot race. Raw world logs and credentials remain local.

## Method

The [formal model](docs/optimization-model.md) treats the game as partially observed stochastic control with a qualification constraint. The implementation has three main decisions:

1. **Price:** a regularized online Bayesian approximation estimates demand effects for world, day, origin, destination, dealer and distance. It accounts for the documented dealer-trust multiplier. Using the least-expensive feasible option as a pricing reference, it solves `(price − estimated cost) × P(win)` to the best integer cent under its logistic model, then applies the same normalized price ratio to the other options. Unimodality gives a bounded scalar optimization, checked against exhaustive integer search.
2. **Admit work:** reserve capacity for pending quotes and won orders, enforce local backlog and daily workload limits, and remove the same-day option when today's queue reaches four weighted unbooked jobs. Later feasible options remain available. The validated bundle policy uses a 700 km route ceiling, eight weighted eligible local drivers, daily capacity factor 0.35 and backlog factor 0.08.
3. **Fulfill and recover:** briefly hold suitable orders for 15 minutes and pair compatible routes into sequential gigs. Preserve equipment and driver restrictions, use scheduled rescue fees, and handle changes, drops, cancellations and expired gigs. Rerouted work receives a fee scaled to its new driving duration. Failed quotes cannot create false demand observations; failed withdrawals preserve the existing gig.

The [development experiments](docs/experiments.md) cover eleven policy variants and five-seed confirmation. Lower quote floors, broader note coverage, early offers, lower fees, longer routes, queue control, demand-curve slopes and pickup cutoffs were tested. Coupled treatments and source-provenance limitations are identified explicitly. Early offers and explicit pickup cutoffs remain experimental switches and are disabled by default.

The quote subproblem is solved exactly for the fitted curve and estimated cost. Full-game global optimality and a future qualification guarantee are not claimed. Eight independent weeks give limited evidence about rare failures. The solver still declines private-address jobs, trade-ins and notes with unrecognized timing constraints. The frozen bundle candidate pairs compatible orders into sequential gigs; neither policy observes drivers' hidden daily schedules.

## Run

Run commands from this repository. The team key is already in local `.env`, which Git ignores. On another machine, copy `.env.example` to `.env` and enter the key locally.

```bash
npm ci
npm run check
npm test
npm run practice -- --seed new-trial-1
```

Run the latest validated standalone default on an ordinary practice seed:

```bash
node --env-file=.env src/run.ts --seed new-late-rescue-trial-1
```

The independently validated bundle policy with late rescue is the default. Its complete settings are in [final-config.json](experiments/final-config.json), including disabled research switches. Runtime and integration tests: **109 passing**; isolated research tests: **12 passing**; statistical-report tests: **9 passing**. The live integration fixture advances the clock through the default bundle window. TypeScript checks include the experiment launchers.

To play an active test final or final:

```bash
npm run final
```

This waits for an active final, plays it and exits when it ends. Keep the machine awake and connected. The runner rebuilds orders and gigs after interruption, retains its market model across transient reconnections, deduplicates events and uses the official client's rate limits. A full process restart starts market learning again. Live behavior has a local integration test; a real test final has not been played by this work. Consult the [organizer's schedule](https://spread.bahnexpress.com/judging).

Official ranking attempts are separate from ordinary practice:

```bash
npm run practice -- --board
```

One invocation consumes one official ranking attempt. No ranking attempt, live final, deployment or Junction submission was performed by this work.

## Reproduce and extend

Run a new paired example study:

```bash
node experiments/study.ts --plan experiments/plans/example.json --jobs 3
```

The launcher freezes source, official client and plan before starting Node. Each trial records its seed, settings, source snapshot, roster, events, score, action errors and reveal in ignored `runs/`. It waits when the team's shared practice slots are full. Completed worlds remain available and consume no active slot. Use fresh seeds for a new independent validation panel; repeated deterministic seeds are not new independent observations.

Rebuild the saved final comparison and check its statistics:

```bash
python3 analysis/compare.py
python3 -m unittest discover -s analysis -p test_compare.py
```

The comparison rejects missing runs, duplicate runs, changed candidate settings or mixed source revisions. The old baseline remains frozen in `experiments/baseline/`. The initial and final validation manifests and selection records are retained separately.

A stopped practice world stays paused. Resume using its original seed, level and settings:

```bash
npm run practice -- --world WORLD_ID --seed ORIGINAL_SEED --config '{}'
```

`src/optimizer.ts` owns demand learning and price optimization; `src/policy.ts` integrates admission and dispatch; `src/planning.ts` handles road and opening-hour feasibility; `src/notes.ts` parses recognized notes; `src/desk.ts` manages order lifecycle; `src/run.ts` runs practice and live worlds.
