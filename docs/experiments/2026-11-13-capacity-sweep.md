# Capacity sweep — 13 November 2026, level 8 practice

Unvalidated in ranking/final. Same seeds, same code base as the "Selected policy" in docs/RESULTS.md;
variants applied by monkeypatching `pricing.prices_for` / `Policy` (no repo code changed).

## Diagnosis (from reveals of our runs)
- ~1,030 requests/week. Current policy declined ~45% only for having a note, ~20–30% via
  supply/open-order filters; quoted ~25–30%, won ~40–50% of quoted at 1.4–1.6× list.
- Ground truth from the starter's run (957 won orders): **74% of noted orders were harmless**.
- Gigs book at the opening fee (median paid = 1.25× reference fee): no escalation happens.
- **The binding cap was `max_open_orders=16`**, not price or notes.

## Safe-note filter
Keyword/regex blocklist (times, days, weekdays, plates, manual, summer tyres, deadlines, hours,
payment, ready/earliest, numbers-in-words). On the starter reveal: passes 154/290 harmless notes,
1/104 harmful (typo "smumer", now added). Tuned on one world; Yera's parser (#3) should replace it.

## Results (margin €, won orders, on-time)

| Variant | spread-1 | validation-1 | holdout-1 | holdout-2 | holdout-3 | holdout-4 |
|---|---|---|---|---|---|---|
| Current (open 16, no notes) | 1712 / 65 / 98.5% | 1990 / 69 / 100% | 2038 / 69 / 100% | 1726 / 57 / 98.2% | 1704 / 61 / 96.7% | 1930 / 66 / 100% |
| B safe notes only | 1421 / 65 / 96.9% | 2062 / 77 / 100% | | | | |
| C + open 40 | 3471 / 147 / 97.3% | 3448 / 130 / 100% | | | | |
| E + open unlimited | 4702 / 203 / 96.1% | 3448 / 130 / 100% | | | | |
| **F + min drivers 1** | 4702 / 203 / 96.1% | 3519 / 132 / 100% | 3690 / 128 / 100% | 2972 / 100 / 100% | 3823 / 133 / 97.0% | 5741 / 254 / **92.5%** |
| G + max drive 600 | 5141 / 217 / 94.0% | 4379 / 146 / 99.3% | 4318 / 143 / 99.3% | 3614 / 117 / 99.2% | 4733 / 144 / 95.1% | 5636 / 279 / **87.5% ✗** |
| H = G, price 1.30 | 5055 / 231 / 92.6% | 4053 / 148 / 97.3% | | | | |
| I = G, price 1.60 | 5217 / 187 / 94.7% | 4143 / 119 / 99.2% | | | | |
| J = G, fee 1.10 | 5893 / 292 / **87.3% ✗** | 5996 / 186 / 97.3% | | | | |
| K = G, margin floor 0 | 4040 / 301 / **88.7% ✗** | 4439 / 205 / 98.1% | | | | |

F over 6 seeds: mean €4,075/week vs €1,850 for current (≈2.2×), worst on-time 92.5%.
For scale: ranking-round leaders ≈ €12–14k/week (Juhus €69,954 / 5 weeks; House best €60,449 / 5).

## Takeaways
1. Volume was artificially capped. Lift the cap, but the real limit is now delivery capacity:
   every variant that wins more eventually breaks 90% on some seed.
2. Replace the fixed admission caps with a **dynamic capacity guard**: track own on-time rate,
   unbooked orders and `deadline_close` warnings live; stop/raise quotes when they worsen.
3. Price level 1.3–1.6 barely moves margin; selective pricing per lane/town supply and
   learning from early wins/losses (handbook) matters more than the global multiplier.
4. Fees: we pay the opening fee immediately; cheaper opening + rescue for urgent orders and
   direct offers to drivers finishing nearby are the next margin lever (#2).
