# Cap the fee of the last two hours

Owner: Boris (Claude). 15 November 2026. Base: candidate 1 with pairing after three hours.

## Why

On forty weeks of the base, orders finally paid 1.9 times the full fee earned −€22 each and were late 28% of the time; at 2.5 times, −€75 and 47% late (`gentle-climb.md`). A fee raised that late rarely finds a driver in time, and when it does the car loses money.

## The idea

Two hours before the last pickup the fee goes to 1.6 times the full fee instead of 1.9, and one hour before to 1.8 instead of 2.5. Settings `rescue2` and `rescue1`.

## The effect

24 weeks, the same for both: the sixteen weeks of the earlier notes and the fresh weeks `bh-reader-20261114-01` to `-08`.

| | Mean difference | Weeks up / down | Lowest on-time share, base / cap |
| --- | ---: | ---: | ---: |
| Cap 1.6 and 1.8 | +€138 a week (standard error €45) | 20 / 1 | 93.2% / 92.9% |
| Cap 1.5 and 1.6, eight weeks | +€186 (standard error €93) | 5 / 0 | |

Late orders are the same, 4.2% on the eight weeks where both were played. The 1.6 and 1.8 cap is now the default.
