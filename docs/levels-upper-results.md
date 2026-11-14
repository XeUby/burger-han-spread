# Upper-level deadline outcome

The authorized levels 5–8 submission was incomplete. Only level 8 run 1 completed, at 11:57:46 Helsinki on 14 November 2026. No ranked runner remained active at 11:58:37, and the official API check at 11:59:02 showed no unfinished team worlds. No ranked actions were taken after that check or after noon. The retained launcher also had a hard mutation cutoff of 11:59:55.

| Level | Completed / planned | Qualified weeks | Net profit | Team ranking complete |
|---|---:|---:|---:|---|
| 8 | 1 / 5 | 1 | €7,850.21 | No |
| 7 | 0 / 5 | — | — | No |
| 6 | 0 / 5 | — | — | No |
| 5 | 0 / 5 | — | — | No |

The completed level 8 week delivered all 259 orders, with 97.30% on time. Driver payments were €15,956.62 and refunds €441.01. There were no failed visits, fines, action errors or recoveries within the world. One qualifying week does not complete the five-run team entry: the official team record remained unranked with a null rank. Its one-sided 95% exact binomial qualification lower bound is only 5%, under IID-week assumptions.

## Operational failure

The upper launcher replaced the previously tested one-active-world-per-level scheduler with a plain priority queue and eight workers. The server permits only one unfinished ranked run at each level. Two attempted concurrent level 8 creations returned HTTP 409 while run 1 was active; the launcher stopped new work. These rejections created no worlds and consumed no official run numbers. Run 1 was allowed to finish normally.

This was an avoidable scheduling error introduced by the assistant, not a policy-quality failure or a server outage. The error was not handled in time to recover the remaining submission before the deadline. The initial report's `remaining` queue omitted tasks already removed by workers waiting for the creation lock; the audited twenty-case inventory records all nineteen uncreated worlds, including the two rejected requests. No failed attempt was removed or replaced.

The frozen faulty launcher is retained exactly as executed for reproducibility. It must not be reused. A future authorized launcher must preserve the existing `nextAvailable` scheduler, permit concurrency only across levels, stop waiting workers cleanly, and reconcile the full planned inventory against server-created worlds. No further ranking is authorized by the expired noon window.

## Policy and evidence

The user explicitly lifted the earlier pause before levels 5–8 and requested level 8 first. The frozen upper protocol retained the validated control for levels 8 and 7 and the earlier development-selected economics policy for levels 6 and 5. The global portfolio candidate had not passed its development promotion screen. No setting was changed in response to ranked results.

The single completed week supports no claim of parity with the leaderboard, general reliability, or fresh 24-pair validation. Levels 1–4 had already completed all twenty weeks before this attempt; their material matched leader gaps remain in the separate report.

Records: [full audit](levels-upper-ranked-audit.json), [official snapshot](levels-upper-server.json), [frozen protocol](../experiments/levels-upper-protocol.json), [all creation attempts](../experiments/levels-upper-ranked-attempts.jsonl), [levels 1–4 outcome](levels-noon-results.md).
