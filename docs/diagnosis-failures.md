# Why the broader policies missed more deadlines

Compared with the original `holdout-2` baseline, the additional late orders mainly come from same-day booking congestion. They do not come from misunderstood notes or a surge in dropped bookings.

| Policy | Won | Late | Late with expired gig | Late quoted and ready on the same day | Late with any drop/no-show |
|---|---:|---:|---:|---:|---:|
| Original baseline | 214 | 5 | 2 | 0 | 2 |
| Expanded harmless notes | 228 | 15 | 13 | 11 | 2 |
| Adaptive prices + expanded notes | 290 | 17 | 13 | 12 | 3 |

All late cars' revealed ready times equal their stated ready times. Neither broader run contains a failed visit or a `driver_late` event. The notes run has two no-shows and the adaptive run one, but most late orders were never successfully booked before their feasible pickup window ended.

The notes policy wins 42 orders absent from the baseline and loses 28 baseline wins, a net increase of 14. Twelve of its 15 late orders were on-time baseline winners. The adaptive policy adds 109 and loses 33; thirteen of its late orders were on-time baseline winners, one was already late, and three were newly won. This is evidence of changed dispatch interactions, not simply bad newly admitted cars.

## Queue buildup in the dense south

Helsinki, Espoo and Vantaa share an estimated 373.8 weighted eligible local drivers, yielding a current backlog allowance of 14.95. That roster does not measure who is free and willing to work during the remaining part of the day.

In the notes run, many Wednesday same-day orders were quoted while 6–11 weighted nearby cars were still unbooked. In the adaptive run, Wednesday's equivalent queue reached 10–13; another Friday cluster appeared at 3–7. Thirteen gigs in each run eventually expired. They then booked almost immediately at the rescue fee, often for the next day's work. Six late notes-run cars and nine late adaptive cars cost exactly €50, the €20 minimum opening fee multiplied by 2.5.

The late-order driver bill rose from €490.15 in the baseline to €1,604.16 with expanded notes and €1,391.23 with adaptive prices. Their net contributions were −€221.66, −€704.29 and −€387.83 respectively.

Older pickup-day work is a real omission in the admission calculation, but does not explain most of this cluster. At the quotes of the metropolitan Wednesday failures, older unbooked work was usually only 0–0.5 weighted cars, while current-day unbooked work was 5.5–13. One future-day Hyvinkää failure (`R00379`) did have 6 current-day plus 3 older-day unbooked cars against its 6.4 allowance. Carryover should count, but fixing only carryover leaves the main dense-area failures.

## Two falsifiable mitigations

**1. Limit the tightest delivery promise when the current queue is already large.** When pickup is ready on the request-arrival day and the weighted nearby unbooked queue—including older pickup-day cars—is at least six, omit `same_day` while preserving feasible later options. This is distinct from rejecting all requests or raising every price.

Applied as a predicate to the existing traces, the rule flags:

| Trace | Flagged won orders | Late among flagged | Their combined net margin |
|---|---:|---:|---:|
| Baseline | 1 | 0 | €12.63 |
| Expanded notes | 14 | 6 | €39.89 |
| Adaptive | 22 | 9 | €36.82 |

These are screening statistics, not simulated counterfactual outcomes. A new paired run must test whether other bookings and profits improve. Merely changing proportional backlog from 0.04 to 0.025 leaves the metropolitan allowance at 9.35 and misses much of the failure cluster. A hard cap on same-day exposure is the more selective experiment.

**2. Make the driver's pickup plan respect the travel buffer used in admission.** Five additional cases across the broader runs were only 10–26 minutes late. Examples include `R00365`, picked up at minute 3940 against `lastPickupAt=3942`, and `R00209`, picked up exactly at 2481, its map-time limit. Four of these five trips overlap announced snow at an endpoint. The current robust `lastPickup()` calculation is checked when quoting, but its conservative cutoff is not set in the posted pickup window.

Test explicit pickup cutoffs from that conservative planner, with a larger travel allowance during announced snow. Preserve late-delivery recovery once the conservative window has passed. This may exchange marginally late deliveries for missed bookings, so evaluate total lateness, total cost and margin, not just the five target cases. Queue control is the first priority because expired gigs account for most failures.

## Method

The analysis uses completed-world event histories, snapshots, revealed car facts and the saved deterministic driver roster. It reconstructs live pending quotes, booked gigs and undelivered orders at each request. Local backlog uses weight 1 within 30 km and 0.5 within 70 km; supply uses the dispatcher's 35 km/70 km weights and licence/premium filters. Historical fulfilled cars are excluded from active backlog. No hidden availability or competitor prices are inferred.

Worlds: `w7ae145e3ea74526ee4bf` (baseline), `wa91ce8c1daea7f4c9cc6` (expanded notes), `wb081cd387816513c47a1` (adaptive). Full order timelines are in [diagnosis-failures.json](diagnosis-failures.json). Reproduce locally:

```bash
python3 analysis/diagnosis_failures.py
```
