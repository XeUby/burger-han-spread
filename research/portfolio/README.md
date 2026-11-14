# Portfolio optimization component

This is a bounded joint quote/route/payment research dispatcher with an OR-Tools optimizer and persistent TypeScript/Python bridge. The first live development comparison is frozen in [the manifest](../../experiments/portfolio-development-v1.json), with the exact assumptions in [the protocol](../../experiments/portfolio-v1-protocol.json). It is **not a validated profit improvement**. The solver process has no Spread client or credentials; the TypeScript adapter executes the next selected action and replans from observed events.

The implementation uses OR-Tools CP-SAT 9.11.4210. NetworkX is an independent oracle for pair-only cases. Python dependencies are isolated from the existing research environment and fully pinned in `requirements.lock.txt`.

```bash
python3 -m venv runs/portfolio-venv
runs/portfolio-venv/bin/python -m pip install -r research/portfolio/requirements.lock.txt
runs/portfolio-venv/bin/python -m unittest discover -s research/portfolio -p '*_test.py'
node --test --test-concurrency=1 research/portfolio/*.test.ts
npx tsc --noEmit -p research/portfolio/tsconfig.json
runs/portfolio-venv/bin/python research/portfolio/benchmark.py
```

## Input contract

`Portfolio` in `bridge.ts` defines the JSON input. All money is integer cents. A candidate claims the jobs, requests or decisions it consumes, so competing quotes, routes and payment choices cannot duplicate work. Every mandatory existing commitment must appear exactly once. `baseline` names a feasible continuation; the optimizer independently checks it and returns it if no feasible solver result arrives within the budget. An infeasible baseline is an input error, not an excuse to abandon existing work.

All candidates use the same ordered scenarios and integer scenario weights. A single candidate-selection vector applies across scenarios; the solver cannot choose a cheap quote in the future where it wins and a different quote in another future. Scenario outcomes include customer revenue, fulfillment, refunds, penalties, future value, resource use and lateness. Each scenario has its own resource and lateness limits. The solver maximizes weighted net value while preserving at least the baseline's modeled value.

Existing-anchor candidates must include the anchor's continuation costs even when the new customer declines. These are future cash flows within the modeled horizon, not sunk historical costs. Terminal future value must not duplicate a separate capacity or positioning charge. The solver cannot enforce the economic truth of supplied numbers; scenario construction must enforce these accounting rules.

`observedAt <= now` rejects explicitly future-dated features. It does not prove that an upstream model avoided reveal-only information or counterfactual leakage. The adapter's logistic priors are rebuilt from original request fields on the existing whole-seed training split; TypeScript predictions match the scikit-learn fixtures. Driver-time budgets are modeled resource constraints, never guaranteed driver assignments.

The solver uses one worker, a fixed random seed and a 0.2-second solve budget. It reports status, integer weighted objective, expected value, bound when available, time and baseline fallback. Wall-clock limits can affect incumbent solutions. Proven optimality applies only to this finite supplied model. The TypeScript bridge allows one outstanding decision, strips credentials from its environment and imposes a three-second response budget. A bridge failure triggers a declared study failure, preserves partial records and stops new world creation. Other running worlds finish.

## Checked properties and limits

Eight Python tests cover common decisions across scenarios, globally shared capacity, anchor continuation costs, risk limits, timeout fallback, invalid/missing commitments, thirty small exhaustive comparisons and twenty 25-node NetworkX comparisons. The TypeScript test checks a rejected input followed by a valid decision through the same process. The oracle comparisons validate the mathematical selection problem, not route feasibility or payment-response estimates.

The [synthetic runtime report](../../docs/portfolio-solver-check.json) solved its 40-candidate/8-scenario and 128-candidate/16-scenario fixtures to optimality. Its 500-candidate/64-scenario fixture exhausted the budget and returned the baseline. Candidate generation therefore needs explicit limits and a record of omitted alternatives. These timings are machine-specific; no whole-week experiment has exercised this component.

## Frozen live comparison

The adapter compares at most three requests and six owned anchors under eight common parameter scenarios. It reuses the tested route and eligibility checks, retains continuation costs for existing orders, and constrains regional workload and expected lateness. It considers solo and anchored quotes, held-order routes, and optional 108% opening payments. Future value appears once. Rescue actions remain inherited; this is not a full multistage stochastic optimizer. Payment elasticities, failure tails, fractional capacity reservations and future values remain unvalidated approximations.

The four arms are the preserved mechanism control, joint portfolio, added future value, and added payment choices. All use the same four familiar level-8 seed blocks. Ten Node tests, eight solver tests and [control replay](../../docs/portfolio-control-conformance.json) passed before the freeze. Pre-quote booking Brier score improved from 0.09065 to 0.07662 on the old 19-week model-test split; that is predictive evidence on accepted historical work, not policy value or causal payment evidence.

The manifest hashes all runtime sources, priors, dependencies, protocol and launchers. To restore a missing bundle, create its directory and extract the tracked source archive there; the launcher checks every file before creating worlds. Do not overwrite an existing bundle or rerun a manifest with attempts. Launch from the repository root:

```bash
node --env-file=.env research/portfolio/run.ts experiments/portfolio-development-v1.json
python3 research/portfolio/report.py experiments/portfolio-development-v1.json
```

The launcher uses two workers and the shared creation lock, checks server occupancy before each creation, and permits at most four unfinished team worlds. All worlds are seeded unranked research. The frozen 600-second per-world budget and operational stopping rule bound this first comparison. Every planned, failed and completed attempt appears in the audit. Familiar development weeks cannot validate qualification reliability or establish leaderboard rank. No ranked entry is authorized.
