# Burger Han V2 — independent experiment

**Goal:** EUR 100,000 gross margin across **five** level-8 ranking weeks, with at least 90% of won orders on time in **each individual week**. This is a target, **not an achieved or validated result**. The live Sunday final consists of just one secret week and is scored separately.

## Isolation and safety
- V2 lives alongside the current implementation on branch `experiment/burger-han-v2`.
- Existing `run.py`, `pricing.py`, `dispatching.py`, `strategy.py` and `final_runner.py` remain unchanged.
- V2 policy: `v2_engine.py`; V2 runner: `v2_runner.py`; repeatable five-week test: `v2_benchmark.py`.
- Do not merge into `main` or replace the final operator until **verified** improvement on the exact same seeds and a live-clock rehearsal.
- Never paste `SPREAD_KEY` into code or screenshots. Existing ignored `.env` loading applies.
- Only one designated team operator may run `--final`. Practice worlds share team quotas.
- Unknown notes, private addresses and trade-ins remain deliberately excluded until validated parsing and execution are available. This limits upside.

## Setup
Install the repository dependencies and official SDK per README.md; use Python 3.12.
```sh
python -m unittest discover -s tests -v
python v2_runner.py --level 8 --seed spread-1
python v2_benchmark.py --seeds burger-holdout-1 burger-holdout-2 burger-holdout-3 burger-holdout-4 burger-holdout-5
```
Compare V1 and V2 on the **same** seed and level, with complete ended worlds. Record `marginCents`, `wonOrders`, `onTimeShare`, refusals, error count and qualification for each week. Do not discard poor weeks.

## Experimental decisions
- Quote per-option prices from list price and fee floor, with a higher premium on scarce local supply and near deadlines.
- Accept single-leg routes up to 600 minutes if the time window and driver-supply filters allow.
- Permit more concurrent orders (up to 240), instead of the old fixed 16 cap. **This can cause a severe driver shortage; on-time rate must be verified.**
- Start with a relatively high fee, escalating earlier if nobody books. Use steeper rescue fees for urgent jobs.
- Reuse the official dispatch state machine, order/event handling and reconnect protocol. No LLM in live decisions.
- No inferred driver activity is treated as fact: home location alone is a poor supply estimate.

## Tests and evidence
The eight offline `V2Tests` pass locally; these verify pure logic and do **not** prove game profitability or final reliability. No authenticated Spread simulation has been completed for V2 yet: this environment does not have the private team key. Do not claim a target has been achieved without the real server scores.

## To reach the target
After V2 earns a qualified baseline, prioritize:
1. Capacity admission by *unbooked workload by region/time*, not a blunt global count.
2. Price learning using accepted/rejected quote events, with a proper holdout evaluation.
3. Explicit note parser and safe handling of plates, licensing and time windows.
4. Multi-car chain optimization plus targeted driver offers with constraints.
5. Saturday live-clock test/restart and fallback to best verified policy.

## Live final
Registration closes Sunday 15 November **07:30 Helsinki**, final begins **08:00** and runs approximately 34 minutes. To test the V2 runner in the official scheduled rehearsal **only if the team operator has chosen it**: `python v2_runner.py --final`. Never run alongside the V1 final runner.

Finally submit code link, submission hash, presentation and Junction-specific material by Sunday 10:00.
