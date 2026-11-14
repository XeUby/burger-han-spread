# Final runbook — Sunday 15 Nov, 08:00 Helsinki

One page for the operator. The champion is `origin/idea/note-reader` at `7fa2d8a`, and the fleet-cost
work sits on `feature/fleet-cost` with its flag off; both trees play the identical week (checked below),
so it does not matter which checkout the operator opens, as long as it contains `7fa2d8a`.

## What runs

```
cd <checkout with the team .env>
node --env-file=.env src/run.ts --final
```

The runner waits for the organisers to set the final at 07:30 (`404` before that), joins it, plays, and
prints a line per world day plus the final score. It rebuilds its books from `world.snapshot()` and
`world.events()` after a server restart or an unreachable moment, and it keeps its demand model across
the rebuild. The world keeps running when the process stops; starting the same command again resumes
from the server's state.

## Timeline (local time is Helsinki + 0)

| When | What |
|---|---|
| 07:30 | organisers set the final; the runner starts waiting |
| 07:40 | pre-flight below, then start the runner and leave it waiting |
| 08:00 | the world starts by itself; the runner is already joined |
| 08:00–08:34 | the week plays; a weekday hour takes 18 real seconds |
| ~08:34 | `Final: €…margin, … orders, …% on time, qualified` |
| 10:00 | submission deadline |

## Pre-flight (07:40, on the machine that will run it)

1. `node --test test/*.test.ts` → 125 pass. If not, do not start; the tree is wrong.
2. `node --env-file=.env src/run.ts --help` → prints the usage, so `.env` and the key load.
3. `Get-Content runs/results.jsonl -Tail 3` → the last practice week is there, so the directory is writable.
4. Confirm nobody else is starting `--final` on the same team key. One client only.
5. Do not run practice worlds, sweeps or `--board` while the final runs: the server's token budget is
   shared and drops to 20 actions and 50 reads a second once a final is live.

## During the week

- Watch the per-day report lines. They should arrive roughly every 1.5 real minutes, margin rising.
- `{"at":…,"action":"withdraw|reprice","reason":"Gig gN is not open"}` is a refused action, not a crash:
  the gig closed (booked or expired) between deciding and sending. The runner carries on.
- If the process dies: start the same command again. It rejoins, rebuilds from the server, and
  continues; gigs keep their schedules meanwhile.
- If the score line shows under 90% on time at the end, the week is not ranked whatever the margin.

## After

- Keep `runs/<worldId>.score.json`, `.snapshot.json`, `.events.json`, `.errors.json`, `.recoveries.json`.
- `reveal` opens when the final ends. Read it before writing anything up.
- Do not delete the final world, and do not print the key from `.env` anywhere.

## Known limits

- The final is one week: a single unlucky draw can miss the 90% minimum even for a policy that averages
  95%. The selected policy qualified on 24 of 24 practice weeks; the on-time shares in
  [experiments.md](experiments.md) run from 92.3% to 98.8%, so the margin is real but not guaranteed.
- Admission, pricing and the fee schedule are frozen at `7fa2d8a`. Do not retune during the final.
