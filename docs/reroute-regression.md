# Reroute regression: R00809

The corrected dispatcher delivers the previously stranded order on time.

## Scope

A targeted same-seed regression after a bug was discovered in round-one validation. This seed is now development data. No fresh formal-unseen-20261113-09 through -16 outcomes are read or included.

Read only the two explicitly allowlisted completed worlds, compare R00809 and their terminal ledger/score, and assert identical settings and original request/quote/outcome. Whole-week changes also include effects on other rerouted jobs and downstream driver/trust interactions.

## Failure and correction

Order `R00809` was won for €35.64 as a local Jyväskylä trip: 12 km and 25 map minutes. At minute 5364, the dealer changed delivery to Kuopio: 145.5 km and 106 map minutes. Its deadline remained Fri 20:00 (minute 6960).

The original dispatcher continued pricing the gig from the local request, with a €20 opening floor and €50 maximum rescue fee. No driver booked it, and the week ended with a €71.28 penalty.

The correction scales fees by `(45 + changed road minutes) / (45 + original road minutes)`, never below one, and evaluates supply at the current pickup. Here the multiplier is `(45 + 106) / (45 + 25) = 2.157143`. The customer quote remains unchanged.

## Result

| Measure | Before correction | After correction |
|---|---:|---:|
| Status | waiting | delivered |
| Delivery | Not delivered | Fri 19:19 (minute 6919) |
| On time | No | Yes |
| Customer price | €35.64 | €35.64 |
| Driver fees | €0.00 | €43.14 |
| Undelivered penalty | €71.28 | €0.00 |
| Order net margin | −€71.28 | −€7.50 |
| Whole-week margin | €10,362.10 | €10,490.61 |
| Whole-week on-time share | 99.34% | 100.00% |
| Whole-week undelivered share | 0.33% | 0.00% |
| Qualified | Yes | Yes |

The order contribution changes by **€63.78**. The full-week margin changes by **€128.51**; this broader difference also reflects other affected orders and dispatch interactions.

The corrected job booked for €43.14, below the old €50 rescue ceiling. The useful change was making a suitable fee available while the car could still be moved on time, rather than only increasing the eventual maximum.

## Corrected event trace

- Thu 15:24 (minute 5244): Order won for €35.64.
- Thu 17:24 (minute 5364): Delivery changed from Jyväskylä to Kuopio.
- Fri 08:55 (minute 6295): Driver 0wov-0083 booked gig g258 for €43.14.
- Fri 15:42 (minute 6702): Driver left for gig g258.
- Fri 17:26 (minute 6806): Car picked up in jyvaskyla.
- Fri 19:19 (minute 6919): Car delivered in kuopio.
- Fri 19:19 (minute 6919): revenue: €35.64.
- Fri 19:19 (minute 6919): driver_fee: −€43.14.

## Provenance and reproduction

- Before: `w8e1fd9795d32b6d0de92`, source `0b8d200ce7c85d4c04aac9411fb884e1382f2e5337a43916163c41bac4d9cd26`.
- After: `w6fb9cdd546c36f5fa418`, source `f8a730aaed7e169b0e8df8fd1dee9cc5543a69ccaf93ea1780fb78d31747befb`.
- Seed: `formal-unseen-20261113-08`; identical policy settings and original request/quote were checked.
- Both processes used their respective frozen sources; this report does not certify any broader mutable development runs.

The machine-readable report includes terminal scores, complete order ledgers, fee observations and relevant events. Reproduce without API calls:

```bash
python3 analysis/reroute_regression.py
```

This is an outcome report for a known regression. It is not used to retune admission or prices, and it does not replace the separate fresh validation panel.
