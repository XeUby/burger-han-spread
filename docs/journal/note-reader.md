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

Eight fresh weeks that the reader was not built on (`bh-reader-20261114-01` to `-08`), played once with each version:

| | Base | Note reader |
| --- | ---: | ---: |
| Mean margin a week | €8,854 | €9,797 |
| Paired difference | | +€943 (standard error €167); 8 weeks up, 0 down |
| Late orders, share of all orders | 1.48% | 1.78% |
| Lowest on-time share | 96.9% | 96.1% |
| Notes understood | | 3,502 of 3,504 |
| Failed visits | | 0 |

On all 24 weeks the reader gains €693 a week, and every week is ranked.

## Why on-time share falls

Not because notes are misread: orders with times in the note were late 1.0% of the time, against 4.0% for orders without a note. The week gets about 50 more orders, and the same drivers must move them. The fee paid for an order without a note rose from €68 to €71, and its late share from 2.2% to 4.0%.

The extra late orders are orders that found no driver before their last pickup time: 9.9 a week against 5.6. Most are routes of 250 km or more. A higher fee does not find them a driver: they are booked minutes after the last pickup time has passed, at 1.2 times the fee, when the gig no longer has to fit a driver's day before the deadline. A long route from a town with other long gigs still open is stuck more often: 2.1% with none open, 7.3% with five or more. From Oulu 8.3% of long routes are stuck.

## What did not work

Each on the first weeks of the same sixteen, with the note reader on, against the note reader alone. The first two were stopped early.

| Variant | Weeks | Mean difference | Lowest on-time share | What happened |
| --- | ---: | ---: | ---: | --- |
| Count a route under 50 km as 1.3 times dearer when pricing (`shortCost`) | 6 | −€305 (standard error €278) | 90.7% | No gain. Such routes cost 1.58 times the typical fee and earn €9 an order against €34, but pricing them out did not free drivers for better orders |
| The same, and count routes over 100 km as 0.85 times as dear (`longCost`) | 5 | −€3,249 | 87.8%, 2 of 5 weeks not ranked | Lower prices on long routes win more orders than the drivers can move |
| Count every route as 1.09 times dearer (`costRatio` 1.25) | 8 | +€127 (standard error €308) | 92.7% | Noise |
| Stricter limit on open work near the pickup (`capacity` 0.30) | 8 | +€151 (standard error €137) | 92.0% | Noise; no fewer late orders |

## What we do not know

- Whether a week exists where the extra orders push the on-time share under 90%. The lowest of 24 weeks was 92.0%, on the week where the base had 94.4%.
- How to keep long routes from towns with few drivers on time. Declining them when four long gigs are open there would cost about 15 orders a week at €60 each.
