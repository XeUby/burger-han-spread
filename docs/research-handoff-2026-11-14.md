# Spread research handoff — 14 November 2026

## Resumed research — after noon

The user resumed local development and unranked research, then prioritized estimating the current best level-8 policy before further development. Ranking, test finals and finals remain unauthorized. The earlier paused status below is historical.

At 12:10:45 Helsinki, the live API showed season 6 and zero unfinished team worlds; a local process check found no active dispatcher runner. The level-8 leader was Freya with €94,319.10 over five ranked weeks (€18,863.82/week). Burger Han had no season-6 entries. These are unmatched reference scores, not a new measured competitive gap. Retained snapshot: `docs/research-resume-server.json`.

The frozen `experiments/level8-estimate-v1.json` panel compares the unchanged historical portfolio payments candidate against the preserved level-8 benchmark on eight new paired development seeds. Sixteen unranked worlds, two workers, four unfinished team worlds maximum, shared creation lock, no policy tuning, no outcome-based stopping or replacements. All eight seeds were retired from future untouched validation before play. This panel estimates performance; it does not waive the 24-pair validation floor or promote either policy. Source files and dependencies reuse the exact historical freeze. Run status and every attempted/completed case are retained in `experiments/level8-estimate-v1-attempts.jsonl`; final audited estimates belong in `docs/level8-estimate-v1-results.json`.

The broader research objective remains open. After this requested estimate: repair and fake-server-test the ranking scheduler; diagnose the lower-level portfolio's decision economics; collect bounded randomized driver-payment coverage; then compare route-before-acceptance and partial-win modeling with explicit ablations. The subsequent researcher-review section records the implemented scheduler, offline graph prototype and interrupted payment ablation; no replacement economic policy has been promoted.

The level-8 estimate is complete: all sixteen worlds qualified, with zero undelivered orders, failed visits, fines, action errors, recoveries or runtime failures. Candidate mean €11,357.38/week (descriptive 95% paired-t mean interval €9,134.66–€13,580.10), control €9,575.97/week. Candidate won all eight paired weeks, gaining €1,781.41/week (descriptive paired-t interval €1,136.21–€2,426.60). Candidate on-time share was 96.83%, minimum weekly 94.23%; control aggregate 95.37%. Eight successes imply only a 68.77% one-sided 95% qualification lower bound under IID-week assumptions. No promotion is claimed.

At 12:25:58 Helsinki, the season-6 leader had changed to No Empty Miles: €95,452.75 across five ranked weeks, or €19,090.55/week. Candidate profit is 59.49% of that unmatched benchmark, a €7,733.17/week descriptive shortfall. The panel demonstrates a useful control improvement, not leaderboard competitiveness. Server audit at 12:26:08 showed zero unfinished team worlds. Full evidence: `docs/level8-estimate-v1-results.json`, `docs/level8-estimate-board.json`, `docs/level8-estimate-v1-operations.json`.

During execution the user explicitly requested more parallel worlds and no other work. The operational amendment raised the limit to eight; all five not-yet-created cases launched alongside the two active originals, reaching seven unfinished worlds. The shared creation lock blocked the original workers from starting duplicate cases. After their eleven created worlds completed, the idle original process was terminated and the lock released. The continuation finished the other five. Policy, seeds, stopping rules and all outcomes were unchanged. Preserve `research/portfolio/continue_estimate.ts` as the executed one-off continuation, not a general resumable scheduler. The original process exit143 is an administrative drain, not a failed simulation. The attempt ledger records all sixteen cases and the drain; the audit uses this ledger because the drained original process did not write its usual final summary.

The user then requested a substantial architecture review. `docs/level8-architecture-review.json` records seven findings, code references, the replacement design and a bounded next tranche of at most 24 unranked worlds. No new policy was deployed. Reproducible audits are `research/portfolio/audit_architecture.py` and `research/portfolio/audit_admission.ts`; results are `docs/level8-architecture-audit.json` and `docs/level8-admission-audit.json`. All 10,109 recorded solver decisions reached their finite-model optimum, but 3,426 of 8,269 requests had no quote candidate. Only 304 were declined with candidates present. Static necessary-gate diagnostics identify 1,572 unparsed notes and 741 home-supply rejections; these overlap other excluded classes and do not establish the profit of accepting them. All private/multi-leg arrivals remained outside effective acquisition. The candidate's profit gain came from €1,544.45 lower driver fees and €279.46 lower refunds per week, with revenue €62.97 lower and release fees €20.46 lower. This is largely fulfillment improvement rather than acquisition expansion. The future-value term was essentially inactive.

Priority is a typed request/stop interpretation layer, a broad option/route candidate graph before economic rejection, action-conditioned booking/drop models, partial-win route economics and time/location capacity values. Keep OR-Tools; changing the solver does not repair missing candidates or bad economics. Earlier timed-note and broader-volume failures remain counterevidence: do not simply toggle those flags or lower every threshold. Freeze and test the new mechanism, then run the bounded interventions/ablations. No claim that the proposed architecture closes the leaderboard gap is justified yet.

## Researcher review, implementation, and interrupted payment ablation

The user's further researcher review is preserved in `docs/researcher-architecture-review-2026-11-14.txt`. It identified a consequential attribution error: the control bundles undiscounted held schedules, while the portfolio applies the 0.85 opening factor first. An independent fixture reproduced exactly €108.48 versus €92.21 opening fees, with identical stops and different full ladders. The complete logs contain 281 control bundles versus 518 portfolio bundles; earlier portfolio-specific telemetry must not be used to count control bundles. Candidate offer answers were 15 accepted, 328 declined and 1,307 expired. See `docs/bundle-payment-confound.json`. The observed whole-policy gain is valid; its attribution to joint optimization remains unresolved.

`research/graph/` now implements a separate prototype for typed request constraints, option-specific feasible routes, private/trade-in work, pairs of two unaccepted requests, and explicit four-branch values including solo fallbacks. Nine tests cover timing, private slots, charging/equipment, actual low-level first-option semantics, causality, omissions and partial wins. Offline coverage on the eight development weeks is 7,107 of 8,269 requests, versus 4,844 ever considered by the evaluated portfolio; 2,263 newly covered requests and 2,778 distinct request pairs on observed frames. It still abstains on 1,150 unresolved notes. This is feasibility/candidate coverage, not a policy rollout, guaranteed driver availability or estimated profit. It has not replaced either preserved control or the current candidate.

`research/runner/` replaces the untested launcher pattern with one scheduling path, shared occupancy checks under the lock, at most eight unfinished team worlds, one unfinished ranked world per level, a complete case journal, waiting cancellation, and transport-level mutation cutoffs. Ten tests include the live Spread adapter against a fake HTTP server, shared occupancy, existing ranked work, lost create responses, waiting/active cancellation and deadlines. No ranked use is authorized. Historical launchers remain unchanged. The new runner was exercised on the unranked ablation below; it retained every case and did not duplicate or lose waiting work.

`experiments/bundle-payment-ablation-v1.json` froze the first four seeds from the completed estimate, not an outcome-selected subset: eight archived reference weeks (control/high and portfolio/low) plus eight new crossed cases. All eight new cases started concurrently within the shared limit. Four control/low-payment weeks completed; all four portfolio/high-payment runs failed with HTTP502 responses. This observation does not establish why the server returned502. The frozen portfolio runtime deliberately aborts on network failure rather than reconstructing uncertain reservation state. The panel is incomplete and cannot estimate the full factorial or its interaction. No retry or replacement was made.

The completed control payment contrast lost €130.75/week on average (descriptive paired-t95 interval −€2,007.07 to +€1,745.58), with three positive pairs but one €1,837.05 loss. Qualification fell from 4/4 to 3/4; the failing week was 89.39% on time. Actual driver payments and refunds increased despite lower initial bundle schedules. There were no undelivered orders, failed visits, fines or action errors in those four completed new weeks. This rejects treating cheaper bundle payments as a reliably beneficial drop-in control change; it does not settle the portfolio effect.

Partial events, decisions, metadata, snapshot and score were preserved for each failed portfolio world. They were then advanced without further dispatch to free shared capacity; the resulting administrative scores are explicitly not full-policy outcomes. Complete server event histories were also retained separately after closure, including any activity committed but not observed around HTTP502 and the administrative closure events. No world was deleted, no failure reclassified as completion, and no adverse score replaced. Official audit reports zero unfinished worlds. Records: `docs/bundle-payment-ablation-v1-results.json`, `docs/bundle-payment-ablation-v1-interruption.json`, `docs/bundle-payment-ablation-v1-operations.json`, and the complete attempt journal. `research/bundle-ablation/report.py` retains the incomplete-panel status and reports only the complete control contrast as a diagnostic.

The separately frozen `bundle-payment-followup-v1` subsequently ran all four portfolio/high cases with the exact original code, settings, dependencies and time budget. All four completed and qualified; no undelivered orders, failed visits, fines, action errors or recoveries. Their observed event prefixes exactly match the interrupted originals. The original panel remains incomplete; this is 20 attempts on four familiar seed blocks, with 16 full-policy outcomes and four preserved failures, not 20 independent weeks. Official audit shows zero unfinished worlds. See `docs/bundle-payment-followup-v1-results.json`, `-operations.json`, `-prefix-audit.json`, and `docs/bundle-payment-interruption-audit.json`.

The supplemented comparison gives means of €10,130.34 control/high, €9,999.60 control/low, €10,741.58 portfolio/high and €11,766.98 portfolio/low. Within the portfolio, lower payments gain €1,025.41/week (descriptive paired-t95 −€42.92 to €2,093.73). At matched high payments the portfolio package gains €611.24 (−€403.36 to €1,625.83); at matched low payments it gains €1,767.39 (−€288.78 to €3,823.55). Interaction is €1,156.15 (−€1,589.46 to €3,901.76). These wide intervals and four development seeds do not establish generality. The lower convention materially contributes on these blocks but does not transfer as a reliable control improvement. The architecture factor includes the entire policy package, not just the solver. Keep the current candidate; no promotion or further threshold sweep follows from this panel.

A refreshed season-6 reference during the follow-up put DaVinci’s Night Shift first at €19,842.22/week. This unmatched leaderboard value remains a gap reference only (`docs/bundle-payment-followup-v1-server.json`).

Next: collect bounded acceptance/payment/offer coverage across the predeclared eight development weeks, with weekly escalation regimes evaluated at week level, then option-aware and route-before-acceptance structural comparisons. The revised sequence is in `docs/level8-architecture-review.json`. Preserve all failed attempts, do not label familiar seeds fresh, and do not infer safe portfolio mutation recovery from an absence of missing public events.

Read this first, then follow the evidence links. Workspace: `/Users/yerzham/Documents/ChatGPT/BAHN`. Branch: `codex/standalone-dispatcher`. Research/results commit before this handoff: `faa043d`, pushed to origin. This handoff compiles completed work; it does not resume experiments or authorize ranking. The persistent research goal is paused at the user's request.

## Current status and authority

- The objective remains substantially better whole-week net profit with reliable qualification, ultimately competitive with the leaderboard. It has **not** been achieved. Successful execution, qualifying weeks, and competitive performance are distinct.
- All ranking authorization for the noon round expired on 14 November at 12:00 Helsinki. No new ranked runs, test finals, or finals without renewed explicit permission. `experiments/search-integrity.json` records ranking as closed.
- The latest user limit is **eight unfinished team worlds total**, superseding four. Older frozen manifests intentionally retain stricter limits. Coordinate with other runners and serialize creation using the shared lock; a local lock alone is not proof that a job is live.
- No active relevant Node runner was found in the process check after noon. The last retained official server inventory at 11:59:02 Helsinki showed zero unfinished team worlds. These are dated observations: recheck both processes and server state before acting.
- No scheduler fix was made after the upper-level incident. The paused continuation only read files and inspected processes. Do not mistake the proposed repair below for implemented code.
- Credentials remain local in ignored `.env`; raw runs and environments are ignored. Never print credentials or put them in commits. Commands must be one complete physical line each.

## What changed our understanding

The largest improvement came from correcting the decision problem, not building a more elaborate optimizer. Levels 1–3 award the original first quote option at list price. The old feasibility loop could approve a later option while the server awarded the first. Separately, its acceptance threshold excluded profitable work. Fixing both acceptance economics and awarded-option handling increased development weekly profit from roughly €900 to €6,300–€7,000, on only three underlying seed blocks. Fixing the option mismatch alone barely helped under the conservative gate.

The next important result is that payment, acquisition and fulfillment interact. A moderate opening-payment change improved the corrected low-level dispatcher. A stronger cut produced more refunds and worse profit at levels 1–2, despite lower nominal payment settings. Total driver expenditure increased in the successful moderate policy because it served more profitable orders. Neither minimum fees nor maximum order count is the objective.

The portfolio optimizer worked mechanically but its economic assumptions were weak. It produced only modest gains at level 8 and rejected too much profitable work at levels 1–3. This rejects those implementations, not joint planning as an architectural direction. A standard solver cannot repair bad candidate values, missing alternatives, unsupported booking responses, or incorrect capacity prices.

## Preserve three distinct policy records

| Record | Location | Interpretation |
|---|---|---|
| Historical validated level-8 control | `experiments/current-selection.json`, `experiments/final-config.json`, `src/`, `docs/payout-validation.json` | Retained benchmark; historical 12-pair evidence, not a universal or search-adjusted safety guarantee |
| Earlier corrected lower-level candidate | `research/low-level/bundle`, first-option results below | Separate development candidate; do not overwrite the control |
| Noon deployment | `experiments/levels-noon-protocol.json` and frozen `runs/frozen/portfolio-development-v1` | Levels 1–3 use first-option/opening-cost admission, fee 0.90, original capacity; level 4 uses earlier economics-only settings. Explicit deadline deployment, not statistical promotion |

The upper protocol is separate: `experiments/levels-upper-protocol.json`. It retained control settings for levels 8–7 and earlier economics settings for 6–5. Only level 8 run 1 executed. The source archive is tracked at `experiments/portfolio-development-v1-source.tar.gz`; protocol/manifests hash the runtime, priors and dependencies. Preserve the exact frozen launchers as historical evidence.

## Findings and decisions

### Mechanisms and earlier comparisons

- Verify awarded options, level capabilities, actual driver eligibility, deadlines and stale actions before optimizing. Eligibility is not a guarantee that a driver will book.
- Changed booked routes can require charging, but the API cannot add charging to an already-booked route. This limitation remains unresolved; route experiments incurred fines. Do not assume route feasibility checks solve it.
- More elaborate routes and broader admission repeatedly increased revenue without enough net profit to compensate for driver fees, refunds and risk. Repeat only with a new mechanism and a targeted ablation.
- A fulfillment-cost model's 0.365% RMSE improvement did not meet its predictive gate. Deploying a cheaper scalar estimate increased throughput 17.6% but lost €1,022/week. Historical accepted-order costs do not identify the costs of newly accepted work.
- In the second research panel, level-8 capacity pricing lost €287/week; anchored routes gained €126; their combination gained €173, with worse timeliness. None passed the declared development gate. Return offers added zero profit: all five sent offers expired or were declined. That sparse exposure cannot reject driver-aware offers broadly.
- The first second-round panel was interrupted: five full worlds, two partial worlds and 27 unstarted cases remain recorded. Administrative closure of partial worlds is not policy evidence. The replacement panel completed 34 worlds over six familiar seed blocks.

Evidence: [first-round findings](first-round-findings-and-research-plan.md), [second-round findings](second-round-findings.md), [first-option analysis](levels-first-option-complete-analysis.json), [model study](booking-response-models.json), [cost and tails](booking-cost-and-tail-models.json).

### Joint portfolio architecture

Four familiar level-8 blocks, four policies, sixteen completed worlds:

| Policy | Mean weekly net profit | Paired gain vs control | Decision |
|---|---:|---:|---|
| Control | €11,790.90 | — | Preserve |
| Joint quotes/routes | €12,314.28 | +€523.38 | Below €1,500 development gate |
| Add future positioning | €12,314.07 | +€523.17 | Incremental effect approximately zero |
| Add payment choices | €12,407.14 | +€616.24 | Incremental +€93.08; insufficient evidence |

All qualified; four control replications exactly matched archived events and scores. Across the sixteen worlds there were €300 in fines, retained in the ledger audit. The planner gain's descriptive 95% paired-t interval was −€1,285.88 to +€2,332.64; four adaptive blocks do not support a confirmatory claim.

The adapter executes one selected action and replans. It uses eight parameter scenarios with analytically integrated customer wins, not a full multistage stochastic model. It considers at most three requests and six existing anchors; it omits pairs of two uncertain new requests, larger routes, private addresses and trade-ins. Rescue remains inherited. Capacity reservations, booking/payment response, future value and failure tails are partly heuristic. These are concrete targets for revision, not settled conclusions.

Evidence: [portfolio findings](portfolio-development-findings.md), [design](portfolio-research-design.md), [protocol](../experiments/portfolio-v1-protocol.json), [code/readme](../research/portfolio/README.md).

### Lower-level experiments

The following all reuse two familiar underlying blocks, including related level trials. They are adaptive development, not independent validation.

| Level | Corrected control | Portfolio | Moderate payment 0.90 | Strong payment 0.72 |
|---|---:|---:|---:|---:|
| 1 | €6,587.16 | €2,061.99 | €8,413.64 | €4,432.55 |
| 2 | €6,838.91 | €2,115.55 | €8,487.99 | €5,213.29 |
| 3 | €6,125.48 | €2,544.20 | €9,335.94 | €7,503.18 |

Values are mean weekly net profit. Moderate payment improved by €1,826.48, €1,649.08 and €3,210.46, respectively; minimum on-time shares were 97.95%, 98.55% and 98.42%. Level-1 capacity expansion alone lost €55.80/week. Combining it with moderate payment earned less than payment alone. Strong payment plus capacity remained poor at levels 1–2; level 3 improved but moderate payment still earned more with better timeliness.

Level 4's corrected-control/portfolio comparison was €1,685.24 versus €1,597.31. This is not the earlier economics-only policy selected for deployment, whose three-week development mean was €3,982.38. Do not confuse these controls.

The five final studies completed **54 unranked worlds**: portfolio L8 16, portfolio lower 16, L1 interactions 6, strong transfer 12, moderate transfer 4. All qualified, but that is not 54 independent weeks. Findings and all cost/reliability metrics: [lower-level report](lower-level-noon-findings.md), with linked JSON audits and manifests.

## Actual noon ranking outcome

All twenty levels 1–4 weeks completed by **11:52:52 Helsinki**, with no undelivered orders, failed visits, action errors, recoveries or fines. They used frozen settings throughout.

| Level | Qualified | Five-week net profit | Snapshot rank | Matched gap to snapshot leader |
|---|---:|---:|---:|---:|
| 1 | 5/5 | €36,942.42 | 5 | €23,176.68 |
| 2 | 5/5 | €38,695.20 | 5 | €18,959.03 |
| 3 | 5/5 | €44,806.98 | 5 | €35,014.74 |
| 4 | 5/5 | €15,381.76 | 6 | €24,901.33 |

These are the retained season-5 snapshot, not current standings. The matched gaps are substantial: the solution is not on par with the leaders. Level 4 run 5 earned only €875.11 despite qualification. See [full lower ranking report](levels-noon-results.md) and its official snapshot/audit.

The user then authorized levels 5–8, starting with 8. Only level 8 run 1 completed: **€7,850.21**, 259 orders, 97.30% on time, finished **11:57:46**. Driver payments €15,956.62; refunds €441.01. No undelivered orders, failed visits, fines or in-world action errors. The five-run entry was incomplete, so the team was **unranked at level 8**. Levels 5–7 were not submitted.

The upper launcher mistakenly replaced `nextAvailable(queue, active)` with a plain priority queue and eight workers. It attempted concurrent ranked worlds at level 8, which the server forbids. Two HTTP 409 responses stopped creation; the first world finished normally. This was an avoidable assistant scheduling error. It was not recovered before the deadline. All ranked activity stopped before noon; no worlds remained unfinished.

**Do not reuse `research/ranked-levels/upper.ts`.** Preserve it for audit. A replacement must retain one unfinished ranked world per level, parallelize across levels, verify server state under the creation lock, handle waiting-worker cancellation, and account for every planned case. Its raw `remaining` array omitted already-dequeued waiting tasks; the audit reconstructs all twenty cases. Test this behavior with a fake server before any authorized live ranking. Existing helper tests did not protect the launcher after it bypassed the helper. Full record: [upper outcome and postmortem](levels-upper-results.md).

## Learning, standard tools and inference limits

- OR-Tools CP-SAT 9.11.4210 handles coupled quote/route/payment selection. NetworkX supplies an independent maximum-weight matching oracle for pure pair cases. NetworkX also exposed a larger counterexample to an earlier greedy matching fallback above twenty connected nodes. Standard solvers are preferable to rebuilding their algorithms, but their guarantees apply only to the formulated subproblem.
- Booking priors and models were compared on whole-week splits. The pre-quote booking Brier score improved from 0.09065 to 0.07662 on an existing 19-week model-test split. This is prediction on historically accepted work, not causal payment evidence or proof of higher profit. No broadly validated neural dispatcher emerged from this session.
- The bounded payment probe randomized at most twenty eligible posts per world, with probability 1/3 for multipliers 0.92, 1 and 1.08. Across two seed blocks the assignments were 13, 19 and 8; bookings within 120 minutes were 10, 11 and 8. Sequential interference, small support and censoring prevent treating these as forty independent policy observations.
- Offline models provide frozen starting priors. Online updates may infer current-week competition/supply using observed events only. Freeze features, update rules, risk limits, optimizer and reset behavior for evaluation. Reveal-only and future information must never affect earlier decisions.
- Split by entire underlying seed, keeping forks, repeats and related levels together. Every panel used for diagnosis or revision becomes development. Use `experiments/seed-registry.json` and `experiments/search-integrity.json`; do not regenerate familiar weeks and label them fresh.
- No new untouched 24-pair validation was completed here. The 24-pair minimum is a floor. Under the first documented alpha allocation, at least 86 zero-failure independent weeks are needed to support a 95% qualification lower bound; profit variance may require more. At ordinary one-sided 95% confidence, 2/2, 4/4 and 5/5 qualifying weeks imply only 22.36%, 47.29% and 54.93% lower bounds under IID-week assumptions. Related level trials do not multiply the sample size.
- Predeclare comparisons, multiplicity, stopping rules and meaningful effect size. Retain all failures, interruptions, censored outcomes and operational errors. Do not infer leaderboard rank from unmatched practice seeds or claim global optimality.

## Recommended next work after an explicit resume

1. Repair the operational scheduler separately from policy research. Verify live jobs, server occupancy, current round and permissions first. Do not launch an expired manifest. Keep authorization, cutoff, one-world-per-level scheduling and complete inventory accounting in an integration-tested path.
2. Diagnose the low-level portfolio's rejected profitable requests using decision-time features. Recalibrate route cost and booking estimates by regime with an unseen-regime fallback; compare to the corrected moderate-payment control. Measure whole-week net profit, not just model fit. Avoid another unbounded parameter sweep on the same two seeds.
3. Test driver-aware payments with bounded randomized coverage of slack, geography, eligible supply, route length and congestion. Log exact probabilities, unsuccessful actions and censored booking/drop outcomes. Separate opening payment from rescue escalation to determine where nominal savings become refunds or higher eventual fees.
4. Revisit route formation before acceptance with a specific new mechanism: two uncertain requests, partial-win fallback costs and booking uncertainty. Existing-anchor-only results do not test that architecture. Price capacity by location/time opportunity cost rather than fixed order counts; ablate capacity, acquisition and fulfillment jointly.
5. Estimate the scale of profit variance and reliability needs on development data, then freeze one finalist and the complete evaluation procedure before generating untouched seeds. Preserve the current controls. Do not tune on the validation panel or ranked results and still call it untouched.

The planning objective should remain expected customer revenue minus fulfillment costs, expected refunds/penalties and scarce-capacity opportunity cost, plus future positioning value. Execute the next feasible action and replan from observed events. Spend substantial effort on structural alternatives; the incumbent is a benchmark, not a ceiling.

## Workspace map and safe reproduction

Start with this handoff, `docs/first-round-findings-and-research-plan.md`, `docs/second-round-findings.md`, `docs/portfolio-development-findings.md`, `docs/lower-level-noon-findings.md`, and both ranking outcome reports. The attached researcher note is preserved in `docs/researcher-note-2026-11-14.md`.

`research/portfolio/` contains the Python solver, TypeScript bridge/adapter, priors, tests, freeze scripts and reports. `research/ranked-levels/` contains historical launchers, deadline/scheduling helpers, official board readers and audits. `experiments/` contains frozen settings, source hashes, archives, attempts and selection decisions. `runs/` contains local raw metadata, snapshots, events, errors, scores, decisions, frozen bundles and virtual environments; these ignored files are **not** delivered by a Git clone. Keep this workspace or separately arrange a credential-free artifact transfer when moving machines. Do not copy `.env` as part of a research handoff.

The following commands inspect/test local artifacts and do not create worlds:

```bash
git status --short --branch
python3 research/ranked-levels/audit_noon.py
python3 research/ranked-levels/audit_noon.py upper
node --test research/ranked-levels/guard.test.ts
runs/portfolio-venv/bin/python -m unittest discover -s research/portfolio -p '*_test.py'
node --test --test-concurrency=1 research/portfolio/*.test.ts
npx tsc --noEmit -p research/portfolio/tsconfig.json
```

Audits require the retained raw runs and frozen bundle. Follow `research/portfolio/README.md` for pinned environment setup if missing. Its original launch instructions and statements about tests before live runs describe the original freeze; the completed reports supersede them. Do not run its world-creation example merely to inspect results. No experiment or ranking is launched by this handoff.
