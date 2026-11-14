# Note reader: quote the requests whose notes we used to decline

Owner: Boris (Claude). 14 November 2026. Level 8 practice weeks. The base is `idea/early-climb` (`codex/standalone-dispatcher` at `d15dfd6` plus the early fee climb) with its default settings.

## The idea

Until now the dispatcher declined a request when its note held a word outside a short list of harmless phrases. That was 17% of all requests: 100 a week that no reader understood, and 50 a week whose readers were switched off.

`src/note-reader.ts` reads the whole note and returns what it means:

| The note says | What the dispatcher does with it |
| --- | --- |
| A tighter deadline: "perillä huomenna klo 14 mennessä" | Plans, quotes and raises fees against that deadline |
| The car is ready later, or handed over after payment | Posts the pickup from that time |
| Hours of the pickup site or of the delivery site | Posts each stop inside those hours |
| Manual gearbox, no plates | Manual-licence audience, pickup with plates |
| Summer tyres | Declines for now: the dispatcher does not plan around snow |
| Nothing that matters (keys, tyres in the boot, weak battery) | Nothing |

It follows the rules for notes: days count from the arrival day, a weekday name is 2 to 6 days ahead, an hour in words is a working hour, "half three" is 14:30, a correction counts and a denied time does not. One slip of the keyboard in a word is put right when only one known word is that near. A note with a word that the reader does not know, or with two statements that disagree, is still declined.

The setting is `noteReader`, off by default.

## How well it reads

| Check | Result |
| --- | --- |
| Notes understood, of the 368,289 noted requests in 838 practice weeks of the team (18,994 distinct texts) | 100% |
| Won orders with one car where the reveal says what was true | 7,235 |
| Of these, read right | 7,235 |
| Of these, with a real restriction in the truth | 881 |
| Failed visits in 16 weeks played with the reader | 0 |

The phrases were collected from these same weeks, so the 100% is not a forecast for new weeks. The comparison with the truth is a real test: the reveal was not used to write the phrases. The truth is thin for deadlines (88 orders) and for handover after payment (about 10).

## The effect

Sixteen weeks, the same for both versions: `bh-robust-20261114-03`, `-06`, `-09`, `-20`, `bh-unseen1-20261114-01` to `-04`, `formal-unseen-20261113-09` to `-16`.

| | Base | Readers of the trunk switched on (`noteSpelling`, `timedNotes`, `readiness`) | Note reader |
| --- | ---: | ---: | ---: |
| Mean margin a week | €9,810 | €10,106 | €10,378 |
| Paired difference to base | | +€296 (standard error €172) | +€568 (standard error €149) |
| Orders a week | 303 | 326 | 355 |
| Weeks up / down | | 11 / 5 | 14 / 2 |
| Ranked weeks | 16 of 16 | 16 of 16 | 16 of 16 |
| Late orders, share of all orders | 2.72% | 2.99% | 3.61% |
| Lowest on-time share | 94.4% | 92.3% | 92.0% |

The gate (`analysis/gate.py`) would not pass this: the lowest on-time share is under 94%.

## Why on-time share falls

Not because notes are misread: orders with times in the note were late 1.0% of the time, against 4.0% for orders without a note. The week gets about 50 more orders, and the same drivers must move them. The fee paid for an order without a note rose from €68 to €71, and its late share from 2.2% to 4.0%.

## What did not work

Each on the first weeks of the same sixteen, with the note reader on, against the note reader alone. Both were stopped early.

| Variant | Weeks | Mean difference | Lowest on-time share | What happened |
| --- | ---: | ---: | ---: | --- |
| Count a route under 50 km as 1.3 times dearer when pricing (`shortCost`) | 6 | −€305 (standard error €278) | 90.7% | No gain. Such routes cost 1.58 times the typical fee and earn €9 an order against €34, but pricing them out did not free drivers for better orders |
| The same, and count routes over 100 km as 0.85 times as dear (`longCost`) | 5 | −€3,249 | 87.8%, 2 of 5 weeks not ranked | Lower prices on long routes win more orders than the drivers can move |

## What we do not know

- How the reader does on a week with phrases it has never seen. It declines what it does not understand, so the risk is lost orders, not failed visits.
- Whether the extra orders are worth more with a stricter limit on open work. Not tried.
