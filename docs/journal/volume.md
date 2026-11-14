# Volume: where the top teams are ahead

Owner: Boris (Claude). 14 November 2026.

## What the practice rankings show

Level 8, round "Saturday 09:00", teams with five ranked weeks:

| Team | Margin a week | Orders a week | Margin an order | On-time share |
| --- | ---: | ---: | ---: | ---: |
| 1st, DaVinci's Night Shift | €15,515 | 397 | €39.0 | 97.2% |
| 10th, AppleJuice | €13,744 | 374 | €36.7 | 97.0% |
| House best | €10,132 | 292 | €34.7 | 96.9% |

The ten best teams earn about what House best earns on an order. They win 28% to 42% more orders. Our dispatcher earns €32 an order on our forty practice weeks and wins 303 orders a week, so our gap is orders, not margin an order.

## Which requests we do not quote

Forty practice weeks, 1,035 requests a week, readers as of `d15dfd6`:

| Requests | A week | Share | Quoted by default |
| --- | ---: | ---: | --- |
| Public addresses, no note | 524 | 50.7% | yes |
| Note read as harmless | 207 | 20.0% | yes |
| Note harmless after spelling correction | 24 | 2.3% | no (`noteSpelling`) |
| Note with opening hours | 43 | 4.1% | no (`timedNotes`) |
| Note with a later ready time | 9 | 0.9% | no (`readiness`) |
| Note that no reader understands | 100 | 9.7% | no |
| Private address | 107 | 10.3% | no (`allowPrivate`) |
| Trade-in | 22 | 2.1% | no (`tradeIns`) |

`analysis/notes-not-understood.json` lists the 1,850 notes of the sixth row with their counts. The most frequent kinds: a delivery deadline ("perillä huomenna klo 14 mennessä"), release after payment ("Released after payment, not before 14:30"), a later ready time, a manual gearbox, missing plates, summer tyres, and the car's condition ("Low on fuel").

## What the existing switches give, on top of the early climb

Sixteen practice weeks, six of them the weakest of forty. Each row against the default with the early climb (mean €9,810 a week, 303 orders, lowest on-time share 94.4%).

| Switches | Mean difference | Weeks up / down | Orders a week | Lowest on-time share | Ranked weeks |
| --- | ---: | ---: | ---: | ---: | ---: |
| `noteSpelling`, `timedNotes`, `readiness` | +€296 (standard error €172) | 11 / 5 | 326 | 92.3% | 16 of 16 |
| The same and `tradeIns` | +€403 (standard error €202) | 9 / 7 | 330 | 92.7% | 16 of 16 |
| The same and `allowPrivate` instead | +€318 (standard error €302) | 10 / 6 | 355 | 87.1% | 15 of 16 |

Private addresses as they are now cost a ranked week. The note switches add 8% more orders for about €300 a week and two points of the lowest on-time share. None of the three is made the default here.

## What we do not know

Whether the ten best teams read notes, take private addresses or do something else: the rankings show only their totals. The request counts say that 29% of requests are not quoted, and that is the largest amount of work we leave to the competitor.
