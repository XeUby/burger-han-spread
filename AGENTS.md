# Burger Han — shared agent contract

Read README.md, docs/TEAM.md, then docs/RULES.md and docs/API.md before changing behavior.
Official source: https://spread.bahnexpress.com/how ; RULES.md wins on conflicts.

## Working rules
- Python 3.12. Keep deterministic, fast decisions; no synchronous LLM calls in final quotes.
- Credentials are only in ignored .env or environment. Never print, commit or upload them.
- One branch per owner: feature/pricing, feature/dispatch, feature/notes, feature/reliability.
- Change only your owned modules unless coordinated in the PR. Integrator owns strategy.py, run.py and final_runner.py.
- Existing teammates may be running worlds. NEVER delete other worlds. A world ID must be yours and recorded locally.
- At most 2 concurrent practice worlds per teammate; team limit is 8. Use agreed seeds. Do not run --board during tuning.
- Only the designated operator may run --final. Never start duplicate final clients.
- Compare baseline and candidate on the SAME seeds, level and complete weeks. Preserve failures in the report.
- Every evaluated week must have >=90% on-time orders and >=1 won order. Target a safety margin.
- Do not claim production readiness from unit tests: Saturday live test and restart exercise are required.
- Read actual score/reveal data; do not invent results. Label hypotheses and unvalidated changes.
- Test: python -m unittest discover -s tests -v. Add behavioral tests for changed constraints.
- Do not edit official SDK in .venv or starter_reference.py. Extend in project modules.

## Deliver each change
Code + focused tests + exact CLI/config + per-seed results + limitations. No secrets in logs/PRs.
