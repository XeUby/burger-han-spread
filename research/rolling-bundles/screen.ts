import fs from "node:fs"
import { Dispatcher } from "../../experiments/frontier/late-rescue/src/policy.ts"
import { planBundles } from "../../experiments/frontier/late-rescue/src/bundles.ts"
import type { BundleCandidate } from "../../experiments/frontier/late-rescue/src/bundles.ts"
import type { World } from "../../experiments/frontier/late-rescue/vendor/typescript/spread.ts"
import type { DeskEvent, Gig } from "../../experiments/frontier/late-rescue/vendor/typescript/types.ts"

const worlds = ["w9092313fc502252b79ab", "w47c0ea9c41007983b01e", "w488ffad22efd5faf742a", "w3faccc007c8c0bd5ff41", "w6893e7d9cdd984154dfe", "wa7bcf5d1654b6d337c61"]
const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const weeks = [], details = []
for (const worldId of worlds) {
  const meta = read(`runs/${worldId}.meta.json`)
  const desk = new Dispatcher({} as World, 8, 0, read("docs/map.json"), read(`runs/${worldId}.drivers.json`), meta.settings)
  const events: DeskEvent[] = read(`runs/${worldId}.events.json`)
  const gigs: Gig[] = read(`runs/${worldId}.snapshot.json`).gigs.toSorted((a: Gig, b: Gig) => a.postedAt - b.postedAt)
  const shortened = new Set(events.flatMap(event => event.kind === "order_cancelled" ? event.gigs.filter(gig => gig.outcome === "shortened").map(gig => gig.gigId) : []))
  const first = new Map<string, Gig>()
  for (const gig of gigs) for (const stop of gig.stops) if (!first.has(stop.orderId)) first.set(stop.orderId, gig)
  const excluded = new Set<string>(), matched = new Set<string>(), seen = new Set<string>()
  let cursor = 0, pairs = 0, savings = 0
  for (let now = 480; now <= 5 * 1440; now += 15) {
    desk.now = now
    while (cursor < events.length && events[cursor]!.at <= now) {
      const event = events[cursor++]!
      if (event.kind === "price_request") desk.requests.set(event.request.id, event.request)
      if (event.kind === "order_won") desk.orders.set(event.order.id, structuredClone(event.order))
      if (event.kind === "order_changed") excluded.add(event.order.id)
      if (event.kind === "order_cancelled" || event.kind === "deadline_close") excluded.add(event.orderId)
      if (event.kind === "gig_booked" || event.kind === "gig_expired") {
        const gig = gigs.find(gig => gig.id === event.gigId)
        for (const stop of gig?.stops ?? []) excluded.add(stop.orderId)
      }
    }
    if (now % 1440 < 480 || now % 1440 >= 1080) continue
    const candidates: BundleCandidate[] = []
    for (const [id, order] of desk.orders) {
      const gig = first.get(id), request = desk.requests.get(id)
      if (!gig || !request || shortened.has(gig.id) || excluded.has(id) || matched.has(id) || gig.postedAt > now - 30 || order.legs.length !== 1 || gig.stops.length !== 2) continue
      const rules = desk.noteRules(request), leg = order.legs[0]!
      if (!rules.safe || leg.pickup.privateAddress || leg.delivery.privateAddress || leg.pickup.window.from > now + 180 || desk.pickupBy(order) < now + 360) continue
      seen.add(id)
      candidates.push({ order, noteSafe: true, post: { type: "post", stops: structuredClone(gig.stops), audience: gig.audience, schedule: desk.feesFor(order, 1) } })
    }
    for (const plan of planBundles(now, candidates, desk.network)) {
      for (const id of plan.orderIds) matched.add(id)
      pairs++
      savings += plan.feeSavingCents
      details.push({ worldId, seed: meta.seed, at: now, orderIds: plan.orderIds, ages: plan.orderIds.map(id => now - first.get(id)!.postedAt), feeSavingCents: plan.feeSavingCents, savedWorkMinutes: plan.savedWorkMinutes, drivingMinutes: plan.drivingMinutes, latestPickupAt: plan.latestPickupAt })
    }
  }
  weeks.push({ worldId, seed: meta.seed, eligibleWaitingSingles: seen.size, pairs, modeledFeeSavingsCents: savings })
}
const summary = { weeks: weeks.length, pairs: weeks.reduce((sum, week) => sum + week.pairs, 0), meanModeledFeeSavingEuros: weeks.reduce((sum, week) => sum + week.modeledFeeSavingsCents, 0) / weeks.length / 100 }
fs.writeFileSync("docs/rolling-bundles-screen.json", JSON.stringify({
  scope: "Six explicit old development weeks with the validated late-rescue baseline. No fresh evaluation data or new plays.",
  hypothesis: "Merge compatible unbooked public singles already waiting on the board, without delaying every newly won car for a longer initial batching window.",
  method: "At 15-minute intervals from 08:00 to 18:00, consider original single-car listings aged at least 30 minutes, ready within 180 minutes, with at least 360 minutes to last feasible pickup. Exclude any order already booked, expired, warned, changed or cancelled at that time. Use the frozen bundle helper and canonical fees. Count an order only in its first selected pair.",
  limitations: ["Retrospective opportunity screen with fixed baseline arrivals and bookings. Counterfactual driver behavior, trust, congestion and later admissions are not simulated.", "Fee savings are the helper's opening-fee discount, not expected realized profit or a bound. Removing two listings to create a bundle can lose viewers or fail to book.", "Gig appearance times and stop references are reconstructed from the final public snapshot. Conservatively exclude any gig shortened by a cancellation anywhere in the week because its original stops are missing. This forensic exclusion uses future history and is not a deployable admission rule. No final booking fee or private revealed driver state is used.", "Once a hypothetical pair is selected, its orders are excluded from later matching; interactions with all other orders remain those of the baseline."],
  summary, weeks, details,
}, null, 2) + "\n")
console.log(JSON.stringify({ summary, weeks }, null, 2))
