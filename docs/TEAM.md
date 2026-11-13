# Team and AI work assignments

We optimize gross margin subject to at least 90% of WON ORDERS arriving on time.
Every leg in a trade-in must be on time. Public rule files are local in docs/.

Each teammate gives their AI the repository and ONE assignment below. Work in separate clones and branches, open a PR; no direct push to main. Do not send your AI a screenshot containing the key: set .env locally.

Owners: A = Doni / derzetta (#1); B = yerzham (#2); C = Yera, GitHub username pending (#3); D = Boris / XeUby (#4). See CONTRIBUTING.md for exact setup, fork and PR instructions. Invitations are not yet sent; forks allow work to begin without write access.

## A — Pricing and admission (feature/pricing)
Own pricing.py and tests/test_pricing_*.py.
Improve prices_for(request, now, roads, drivers, orders, policy) -> dict[option, integer cents].
Study route supply, time windows, loading, quote win/loss learning. Policy changes must remain deterministic.
Start with no network or hidden simulator state in the policy. All observable data comes from API.
Measure margin, wonOrders and onTimeShare on spread-1, burger-validation-1, burger-validation-2, then fresh seeds.
Do not trade away the 90% constraint for an attractive mean score.

## B — Drivers and routes (feature/dispatch)
Own dispatching.py and tests/test_dispatch_*.py. Coordinate integration hooks before changing strategy.py.
Improve fee_schedule(now, reference_fee, cars, total_cars, urgent, level, policy).
Investigate direct offers to suitable recent drivers, booking drops and early rescue. Respect 3 offers/driver/day, 3 open offers/gig, 10-minute expiry.
Only then investigate multi-order bundling: <=12h driving; cancellation and restart must preserve every leg.
Compare fixed upfront fees with escalating fees on paired seeds. Drivers learn to wait for raises.

## C — Dealer notes (feature/notes)
Own a new notes.py and tests/test_notes.py; coordinate integration with the integrator.
Propose parse_note(text, language, arrived_at) returning constraints AND confidence/unknown markers.
Handle Finnish/Swedish/English, corrections, negation, weekday offsets, pickup-ready, site hours, delivery deadline, plates and manual licence.
Do not let unrecognized constraints disappear. Reject risky requests until parsed reliably.
Use practice reveal AFTER the world ends for evaluation only; never leak reveal into live decisions.
The current fallback declines all notes; safely accepting harmless notes is an especially useful first improvement.

## D — Integration and reliability (current Codex session)
Own strategy.py, run.py, final_runner.py, config.py, transport.py, CI and README.
Collect run artifacts, integrate reviewed changes and run paired experiments.
Verify replay idempotency, cancelled orders, failed posts, 429, reconnect and 4.5-second response budget.
Keep final entry point conservative until live test succeeds.

## Copy this prompt to each AI

You are working on Burger Han's Spread challenge. Read AGENTS.md and docs/TEAM.md first. You own assignment [A/B/C]. Implement that assignment on your feature branch, keeping existing interfaces. Read the official rules and SDK types. Preserve other teammates' work. Never publish credentials or delete their worlds. Return code, tests and measured paired-seed results, including failures and limitations. Ask the integrator for new event/state hooks rather than editing their modules concurrently.

## Required event checklist (Helsinki)
- Friday 13 November: preliminary Junction draft saved successfully. The final submission remains pending. Yerzhan will be added to the Junction roster later.
- Saturday 14 November 14:00 and 20:00: test finals. Use one designated operator.
- Sunday 15 November before 07:30: registration completed; stable version selected and machine ready.
- Sunday 08:00: final begins, ~34 minutes. One process, stable network, automatic recovery.
- Sunday 10:00: final submission: hash from team page, code link and 5–10 slides or short video. Check Junction's own required fields too.

## Presentation evidence
One idea per slide: behavior, reason, paired before/after results. Show uncertainty and failure modes. Do not claim to beat House best until a comparable ranking proves it.
