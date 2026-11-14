# Gentler early climb: the same drivers for less

Owner: Boris (Claude). 14 November 2026. Level 8 practice weeks. The base is `idea/early-climb` with its default settings.

## What we saw

On forty weeks of the base, by the fee that an order was finally paid at, in full fees (orders under the €20 minimum fee left out):

| Paid about | Orders a week | Margin an order | Late |
| --- | ---: | ---: | ---: |
| 0.85, the opening fee | 149 | €48 | 0.6% |
| 1.0 | 14 | €45 | 0.5% |
| 1.2 | 20 | €23 | 5.4% |
| 1.45 to 1.5 | 36 | €8 | 3.7% |
| 1.9 | 3 | −€22 | 28% |
| 2.5 | 2 | −€75 | 47% |

The early climb jumps from 0.85 to 1.2 a day before the last pickup and to 1.45 half a day before. 56 orders a week are booked on these two steps, and only 11% to 20% of them within ten minutes of the raise. So most of these drivers did not wait for the raise: they came when they came, and would have taken less.

## The idea

Raise in smaller steps: 1.1 times the full fee a day before the last pickup, 1.25 times half a day before. The last four hours stay as they are: 1.45, 1.9 and 2.5 times. Settings `climbDay` and `climbHalfDay`; the defaults are still 1.2 and 1.45.

## The effect

Sixteen weeks, the same for both versions (the sixteen weeks of `docs/journal/note-reader.md`):

| | Climb 1.2 and 1.45 | Climb 1.1 and 1.25 |
| --- | ---: | ---: |
| Mean margin a week | €9,810 | €10,341 |
| Paired difference | | +€531 (standard error €162); 12 weeks up, 4 down |
| Late orders, share of all orders | 2.72% | 2.86% |
| Lowest on-time share | 94.4% | 94.1% |
| Ranked weeks | 16 of 16 | 16 of 16 |

## What did not work

A softer climb still, 1.0 and 1.2 times, on eight of these weeks: +€696 a week (standard error €221) against +€611 for the gentler climb on the same eight, but 4.04% of orders late against 3.29%, and a lowest on-time share of 91.8%. More late orders for no clear gain.

## What we do not know

Whether the last three steps (1.45, 1.9, 2.5 times) can be lower as well. Few orders are booked there, and half of those arrive late anyway.
