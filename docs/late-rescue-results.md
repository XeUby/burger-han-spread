# Late-rescue fee reset: development screen

Once a public single-car job's last pickup has passed, an unbooked gig can no longer buy on-time delivery under the current public windows. The incumbent still offers up to 2.5 times its opening fee. The experiment resets that fee to 1.2, then raises it to 1.45, 1.9 and 2.5 at 120, 240 and 360 minutes after the fixed cutoff. Repricing and reconnecting cannot restart the clock. Booked gigs, shared gigs and private addresses are excluded.

Six old development weeks showed €1,098.63/week in paid fees above the normal opening fee for bookings after the public last-pickup time. This is expenditure, not an achievable-saving bound: lower offers can increase delay, refunds and non-delivery risk.

The predeclared screening weeks had high exposure to those costs. Identical frozen source ran with the feature off and on:

| Development seed | Control | Reset | Gain | On-time, control / reset |
|---|---:|---:|---:|---:|
| 10 | €13,173.80 | €14,065.59 | €891.79 | 95.63% / 96.14% |
| 15 | €9,096.26 | €10,369.66 | €1,273.40 | 93.62% / 93.62% |

Mean gain is €1,082.60 on this deliberately enriched panel. Both treatments qualified, all cars were delivered, and no actions were rejected. Driver fees fell €1,102.25 and €1,197.48. The full gain includes revenue, refund and release-fee differences; it is not just the lower fee subtotal. The controls reproduced the archived incumbent results to the cent.

[Machine-readable evidence](late-rescue-results.json) includes every planned world, ledger components, late-booking events, viewed fees, exact settings and source hashes. The feature remains disabled in the independently validated incumbent. A broader four-week development confirmation includes two no-exposure weeks and must pass its [predeclared criteria](../experiments/late-rescue-confirmation-protocol.json) before any fresh validation. No ranking submission was used.
