# Burger Han — optimized Spread dispatcher

A TypeScript dispatcher for Bahn's level 8 challenge. It learns the price market from its own wins and losses, optimizes expected contribution, and limits exposure to scarce drivers. Node 22.18 or newer; no runtime packages required.

## Final independent comparison

The final source was frozen before testing on eight fresh weeks, with the original baseline run on the same eight seeds. No final policy tuning used these outcomes.

| Metric | Original baseline | Final solver |
| --- | ---: | ---: |
| Mean weekly margin | €5,541.90 | **€8,418.62** |
| Lowest weekly margin | €3,381.06 | **€6,136.34** |
| Qualified weeks | 8/8 | **8/8** |
| Orders won | 1,311 | 2,263 |
| Aggregate on-time delivery | 99.39% | 98.59% |
| Lowest weekly on-time delivery | 98.31% | 96.14% |
| Undelivered orders | 1 | **0** |

Profit increased on **every week**, averaging **€2,876.73 more per week (+51.9%)**. The paired 95% bootstrap interval for that increase is €2,459.73–€3,253.70. Whole weeks, not individual orders, are resampled. These are practice results, not official leaderboard placements. The final policy trades some on-time percentage for more profitable volume while staying above the 90% qualification threshold in every tested week.

[Full paired results](docs/optimization-validation.md) and [machine-readable evidence](docs/optimization-validation.json) include every seed, world ID, setting, score and source hash. Final source: `f8a730aaed7e169b0e8df8fd1dee9cc5543a69ccaf93ea1780fb78d31747befb`.

An earlier eight-week evaluation exposed one car stranded after its dealer changed a local trip into a longer route. The fee correction was verified on that case, then the final source was evaluated on the fresh panel above. The [initial evaluation](docs/optimization-validation-round1.md) and [reroute regression](docs/reroute-regression.md) are preserved. The regression now delivers all 305 orders on time.

## Method

Further research is in progress. On four additional, previously inspected weeks, a bundle policy with broader admission averaged €10,660 versus €8,820 for the prior validated policy (+20.9%), with four qualifications and a minimum on-time share of 95.6%. These are development results, not independent validation. See the [confirmation panel](docs/frontier-confirmation.md), [screening results](docs/frontier-experiments.md) and [current experiment state](experiments/frontier-status.json). Eight entirely new paired weeks are reserved in an explicit validation manifest. No ranking submission has been made by this research. The default configuration remains the previously validated policy.

Frozen baseline and candidate source snapshots are committed under `experiments/frontier/`; their source hashes and complete settings are in `experiments/frontier/source-index.json`. Raw world logs and credentials remain local. The paired study runner caps its workers at four and checks total unfinished server worlds before each serialized creation. Isolated experiments in `research/` are not enabled in the candidate.

The [formal model](docs/optimization-model.md) treats the game as partially observed stochastic control with a qualification constraint. The implementation has three main decisions:

1. **Price:** a regularized online Bayesian approximation estimates demand effects for world, day, origin, destination, dealer and distance. It accounts for the documented dealer-trust multiplier. Using the least-expensive feasible option as a pricing reference, it solves `(price − estimated cost) × P(win)` to the best integer cent under its logistic model, then applies the same normalized price ratio to the other options. Unimodality gives a bounded scalar optimization, checked against exhaustive integer search.
2. **Admit work:** reserve capacity for pending quotes and won orders, enforce local backlog and daily workload limits, and remove the same-day option when today's queue reaches four weighted unbooked jobs. Later feasible options remain available. Expanded note recognition and a 550 km route ceiling admit more work within these safeguards.
3. **Fulfill and recover:** post gigs with equipment and driver restrictions, use scheduled rescue fees, and handle changes, drops, cancellations and expired gigs. Rerouted work receives a fee scaled to its new driving duration. Failed quotes cannot create false demand observations; failed withdrawals preserve the existing gig.

The [development experiments](docs/experiments.md) cover eleven policy variants and five-seed confirmation. Lower quote floors, broader note coverage, early offers, lower fees, longer routes, queue control, demand-curve slopes and pickup cutoffs were tested. Coupled treatments and source-provenance limitations are identified explicitly. Early offers and explicit pickup cutoffs remain experimental switches and are disabled by default.

The quote subproblem is solved exactly for the fitted curve and estimated cost. Full-game global optimality and a future qualification guarantee are not claimed. Eight independent weeks give limited evidence about rare failures. The solver still declines private-address jobs, trade-ins and notes with unrecognized timing constraints. It does not bundle separate orders or observe drivers' hidden daily schedules.

## Run

Run commands from this repository. The team key is already in local `.env`, which Git ignores. On another machine, copy `.env.example` to `.env` and enter the key locally.

```bash
npm ci
npm run check
npm test
npm run practice -- --seed new-trial-1
```

The optimized policy is the default. Its complete settings are in [final-config.json](experiments/final-config.json). Runtime and integration tests: **34 passing**; statistical-report tests: **5 passing**. TypeScript checks include the experiment launchers.

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
