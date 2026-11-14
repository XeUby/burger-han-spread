# Burger Han — optimized Spread dispatcher

A TypeScript dispatcher for Bahn's level 8 challenge. It learns the price market from its own wins and losses, optimizes expected contribution, and limits exposure to scarce drivers. Node 22.18 or newer; no runtime packages required.

## Latest independent comparison

The broader-admission bundle candidate was frozen before an eight-week paired evaluation on new seeds. All sixteen ordinary practice worlds reached their terminal minute; their ledger totals and delivery counts reconcile with the official scores.

| Metric | Previous validated policy | Bundle candidate |
| --- | ---: | ---: |
| Mean weekly margin | €8,242.34 | **€10,411.59** |
| Qualified weeks | 8/8 | **8/8** |
| Aggregate on-time delivery | 99.14% | 97.95% |
| Lowest weekly on-time delivery | 98.10% | 94.94% |
| Undelivered orders | 0 | 0 |

Mean gain is **€2,169.25/week (+26.32%)**, positive in seven of eight paired weeks. The 95% paired bootstrap interval is €1,195.42–€3,048.48; the exact two-sided sign-test p-value is 0.0703. Eight weeks cannot establish a low rare-failure probability or global optimality. These are unranked practice results. See the [complete comparison](docs/frontier-validation.md), [machine-readable evidence](docs/frontier-validation.json), and [frozen manifest](experiments/frontier-validation-manifest.json).

The public leaderboard leader averaged €16,006.00 over five different secret weeks at the recorded observation. That is a comparison target, not a controlled estimate of our rank. The [public snapshot](docs/leaderboard-observation.json) preserves the observation.

The prior policy had independently improved mean margin from €5,541.90 to €8,418.62 on an earlier eight-week panel. That historical evaluation and its reroute correction remain in [the earlier report](docs/optimization-validation.md). Those older seeds became development data for this research.

## Research and reproducibility

The selected source is frozen under `experiments/frontier/candidate/`; the previous source is under `experiments/frontier/baseline/`. Exact source hashes and settings are in [source-index.json](experiments/frontier/source-index.json). The selected configuration is also in [frontier-selected-config.json](experiments/frontier-selected-config.json). The default executable still uses the previous validated settings; research features remain opt-in.

Development selection used [screening trials](docs/frontier-experiments.md) and a [four-week confirmation](docs/frontier-confirmation.md). A separate note-hours treatment passed an initial screen but [failed confirmation](docs/note-hours-confirmation.md), so it remains disabled. A controlled [direct-offer head-start probe](docs/offer-window-probe.json) also found no benefit. [Current experiment state](experiments/frontier-status.json) records runs and decisions. No ranking submission has been made by this research.

A bounded fee reset after on-time pickup is already impossible gained €891.79 and €1,273.40 in two deliberately high-exposure development weeks. [Complete screening evidence](docs/late-rescue-results.md) includes all costs and refunds. Broader confirmation is running; this feature is not enabled in the validated incumbent.

Both study runners cap workers at four, serialize their own creations, and check total unfinished server worlds before each creation. Coordinate separate runners so their creation checks cannot race. Raw world logs and credentials remain local.

## Method

The [formal model](docs/optimization-model.md) treats the game as partially observed stochastic control with a qualification constraint. The implementation has three main decisions:

1. **Price:** a regularized online Bayesian approximation estimates demand effects for world, day, origin, destination, dealer and distance. It accounts for the documented dealer-trust multiplier. Using the least-expensive feasible option as a pricing reference, it solves `(price − estimated cost) × P(win)` to the best integer cent under its logistic model, then applies the same normalized price ratio to the other options. Unimodality gives a bounded scalar optimization, checked against exhaustive integer search.
2. **Admit work:** reserve capacity for pending quotes and won orders, enforce local backlog and daily workload limits, and remove the same-day option when today's queue reaches four weighted unbooked jobs. Later feasible options remain available. Expanded note recognition and a 550 km route ceiling admit more work within these safeguards.
3. **Fulfill and recover:** post gigs with equipment and driver restrictions, use scheduled rescue fees, and handle changes, drops, cancellations and expired gigs. Rerouted work receives a fee scaled to its new driving duration. Failed quotes cannot create false demand observations; failed withdrawals preserve the existing gig.

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

Run the exact latest validated bundle source on an ordinary practice seed:

```bash
node --env-file=.env experiments/frontier/candidate/src/run.ts --seed new-bundle-trial-1 --config '{"capacity":0.35,"backlog":0.08,"minDrivers":8,"maxKm":700,"bundleWait":15}'
```

The earlier optimized policy is the default. Its complete settings are in [final-config.json](experiments/final-config.json). Runtime and integration tests: **98 passing**; isolated research tests: **8 passing**; statistical-report tests: **9 passing**. TypeScript checks include the experiment launchers.

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
