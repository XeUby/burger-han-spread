# Flexible-deadline admission exposure

The ready-day capacity and backlog gates reject 346 requests across six old development weeks even though a later delivery option has a feasible pickup-and-delivery window on a later day. That is 57.67 requests per week: 197 rejected first by daily capacity and 149 by backlog.

The frozen market model estimates 26.85 additional wins and €518.99 additional margin per week if those later options are quoted. These are model outputs, not measured profit or a global bound. They omit competition for future drivers, future arrivals, changed pickup costs, booking behavior, trust and downstream admissions. The remaining option menu also differs from the menus on which demand was learned.

The replay reproduced 3,474 actual commercial quotes, covering 5,807 option prices, with zero cent differences. It also found zero commercial quotes inconsistent with the reconstructed admission gates. A bundle shortened by a later cancellation initially caused one membership discrepancy; the final reconstruction restores original membership from public cancellation events and applies cancellation only at its actual time.

The screen requires pickup and delivery within one day strictly after both the current day and the original ready day, with at least two hours of pickup slack. It preserves the frozen policy's note, equipment, charging, road-distance, local-supply and site-hours checks. Each request counts once regardless of its number of feasible options or days. No hypothetical win changes the replayed state.

Of the 346 requests, 120 arrived on Friday and 206 can use the last Monday. This suggests evaluating capacity across service days rather than simply widening the ready-day quota. It does not prove that those days have spare driver capacity.

The follow-up [capacity screen](flexible-admission-capacity.json) protects booked commitments on every feasible service day and assigns each known unbooked job once by integral max flow. It reserves a full unit for each earlier hypothetical admission, regardless of win probability. Nearby jobs receive a full unit even where the incumbent normally charges half, and quotas are rounded down. Existing over-reservations leave zero room on that day rather than invalidating unrelated future days.

Only 64 requests survive across six weeks: 10.67 requests and 4.17 modeled wins per week, with €84.15/week of modeled contribution. That is insufficient to prioritize a live trial. This does not rule out a less conservative calendar policy: driver schedules remain hidden, and the proxy does not model displacement of future work or booking spillovers. The max-flow solver matches exhaustive assignment on 4,096 small calendars, but that verifies the abstract allocation algorithm, not the economic assumptions.

No admission change or extra play has been launched; the independent payout evaluation remains frozen. Exact worlds, source revision, request records and reconstruction checks are in the [exposure audit](flexible-admission-screen.json).
