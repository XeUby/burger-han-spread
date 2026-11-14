# Portfolio optimization component

This is a tested optimizer and persistent TypeScript/Python bridge, **not a live dispatcher or a validated profit improvement**. It starts no worlds and has no Spread client or credentials. Candidate generation, scenario estimation, action execution and the new frozen development protocol remain to be implemented.

The implementation uses OR-Tools CP-SAT 9.11.4210. NetworkX is an independent oracle for pair-only cases. Python dependencies are isolated from the existing research environment and fully pinned in `requirements.lock.txt`.

```bash
python3 -m venv runs/portfolio-venv
runs/portfolio-venv/bin/python -m pip install -r research/portfolio/requirements.lock.txt
runs/portfolio-venv/bin/python -m unittest discover -s research/portfolio -p '*_test.py'
node --test research/portfolio/bridge.test.ts
npx tsc --noEmit -p research/portfolio/tsconfig.json
runs/portfolio-venv/bin/python research/portfolio/benchmark.py
```

## Input contract

`Portfolio` in `bridge.ts` defines the JSON input. All money is integer cents. A candidate claims the jobs, requests or decisions it consumes, so competing quotes, routes and payment choices cannot duplicate work. Every mandatory existing commitment must appear exactly once. `baseline` names a feasible continuation; the optimizer independently checks it and returns it if no feasible solver result arrives within the budget. An infeasible baseline is an input error, not an excuse to abandon existing work.

All candidates use the same ordered scenarios and integer scenario weights. A single candidate-selection vector applies across scenarios; the solver cannot choose a cheap quote in the future where it wins and a different quote in another future. Scenario outcomes include customer revenue, fulfillment, refunds, penalties, future value, resource use and lateness. Each scenario has its own resource and lateness limits. The solver maximizes weighted net value while preserving at least the baseline's modeled value.

Existing-anchor candidates must include the anchor's continuation costs even when the new customer declines. These are future cash flows within the modeled horizon, not sunk historical costs. Terminal future value must not duplicate a separate capacity or positioning charge. The solver cannot enforce the economic truth of supplied numbers; scenario construction must enforce these accounting rules.

`observedAt <= now` rejects explicitly future-dated features. It does not prove that an upstream model avoided reveal-only information or counterfactual leakage. No live-state adapter has been written yet. Driver-time budgets are modeled resource constraints, never guaranteed driver assignments.

The solver uses one worker, a fixed random seed and a 0.2-second solve budget. It reports status, integer weighted objective, expected value, bound when available, time and baseline fallback. Wall-clock limits can affect incumbent solutions; any live freeze must specify and audit that behavior. Proven optimality applies only to this finite supplied model. The TypeScript bridge uses one persistent isolated process, allows one outstanding decision, strips credentials from its environment and imposes a three-second response budget. It sends no game actions. A bridge failure must trigger a logged policy fallback or a declared study failure in the future adapter.

## Checked properties and limits

Eight Python tests cover common decisions across scenarios, globally shared capacity, anchor continuation costs, risk limits, timeout fallback, invalid/missing commitments, thirty small exhaustive comparisons and twenty 25-node NetworkX comparisons. The TypeScript test checks a rejected input followed by a valid decision through the same process. The oracle comparisons validate the mathematical selection problem, not route feasibility or payment-response estimates.

The [synthetic runtime report](../../docs/portfolio-solver-check.json) solved its 40-candidate/8-scenario and 128-candidate/16-scenario fixtures to optimality. Its 500-candidate/64-scenario fixture exhausted the budget and returned the baseline. Candidate generation therefore needs explicit limits and a record of omitted alternatives. These timings are machine-specific; no whole-week experiment has exercised this component.

Next: build bounded alternatives from public decision-time state, reuse the tested route/eligibility checks, and supply common quote-win, anchor-survival and booking scenarios. Keep the full objective and uncertainty assumptions visible. Verify the adapter and stale-action fallback before freezing the four-arm, 16-world development comparison described in [the research design](../../docs/portfolio-research-design.md). Preserve the validated controls and the four-world team limit. Do not start ranked rounds.
