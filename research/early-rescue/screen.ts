import fs from "node:fs"
import { Dispatcher } from "../../experiments/frontier/late-rescue/src/policy.ts"
import { intervals } from "../../experiments/frontier/late-rescue/src/planning.ts"
import type { World } from "../../experiments/frontier/late-rescue/vendor/typescript/spread.ts"
import type { DeskEvent, Gig, Order } from "../../experiments/frontier/late-rescue/vendor/typescript/types.ts"

const worlds = ["w9092313fc502252b79ab", "w47c0ea9c41007983b01e", "w488ffad22efd5faf742a", "w3faccc007c8c0bd5ff41", "w6893e7d9cdd984154dfe", "wa7bcf5d1654b6d337c61"]
const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const weeks = [], details = []
for (const worldId of worlds) {
  const meta = read(`runs/${worldId}.meta.json`), snapshot = read(`runs/${worldId}.snapshot.json`)
  const desk = new Dispatcher({} as World, 8, 0, read("docs/map.json"), read(`runs/${worldId}.drivers.json`), meta.settings)
  const events: DeskEvent[] = read(`runs/${worldId}.events.json`)
  const gigs: Gig[] = snapshot.gigs.toSorted((a: Gig, b: Gig) => a.postedAt - b.postedAt)
  const byGig = new Map(gigs.map(gig => [gig.id, gig]))
  const first = new Map<string, Gig>()
  for (const gig of gigs) for (const stop of gig.stops) if (!first.has(stop.orderId)) first.set(stop.orderId, gig)
  const shortened = new Set(events.flatMap(event => event.kind === "order_cancelled" ? event.gigs.filter(gig => gig.outcome === "shortened").map(gig => gig.gigId) : []))
  const excluded = new Set<string>()
  const selected = new Map<string, { at: number; gigId: string; openingCents: number; views: number }>()
  const views = new Map<string, number>()
  let cursor = 0
  for (let now = 480; now < 5 * 1440; now += 15) {
    desk.now = now
    while (cursor < events.length && events[cursor]!.at <= now) {
      const event = events[cursor++]!
      if (event.kind === "price_request") desk.requests.set(event.request.id, event.request)
      if (event.kind === "order_won") desk.orders.set(event.order.id, structuredClone(event.order))
      if (event.kind === "order_changed") excluded.add(event.order.id)
      if (event.kind === "order_cancelled" || event.kind === "deadline_close") excluded.add(event.orderId)
      if (event.kind === "gig_viewed") views.set(event.gigId, (views.get(event.gigId) ?? 0) + 1)
      if (event.kind === "gig_booked" || event.kind === "gig_expired") for (const stop of byGig.get(event.gigId)?.stops ?? []) excluded.add(stop.orderId)
    }
    if (now % 1440 < 480 || now % 1440 >= 960) continue
    for (const [id, order] of desk.orders) {
      const gig = first.get(id), request = desk.requests.get(id)
      if (!gig || !request || shortened.has(gig.id) || excluded.has(id) || selected.has(id) || gig.postedAt > now - 60 || order.legs.length !== 1 || gig.stops.length !== 2) continue
      const rules = desk.noteRules(request), leg = order.legs[0]!
      if (!rules.safe || leg.pickup.privateAddress || leg.delivery.privateAddress || leg.pickup.window.from > now || desk.pickupBy(order) < now + 360 || !intervals(leg.pickup, now, now).length) continue
      selected.set(id, { at: now, gigId: gig.id, openingCents: desk.feesFor(order, 1)[0]!.feeCents, views: views.get(gig.id) ?? 0 })
    }
  }
  const rows = [...selected].map(([id, selection]) => {
    const order = (snapshot.orders as Order[]).find(order => order.id === id)!
    let driverFees = 0, refunds = 0, sharedFees = false
    for (const event of events) if (event.kind === "ledger") {
      const line = event.line
      if (line.orderId === id && line.kind === "late_refund") refunds -= line.cents
      if (line.kind === "driver_fee" && line.gigId) {
        const members = new Set(byGig.get(line.gigId)?.stops.map(stop => stop.orderId))
        if (members.has(id)) {
          if (members.size === 1) driverFees -= line.cents
          else sharedFees = true
        }
      }
    }
    const cancelled = order.status === "cancelled"
    return { worldId, seed: meta.seed, orderId: id, ...selection, cancelled, late: !cancelled && order.deliveredAt.some(at => at === null || at > order.deadline), driverFeesCents: driverFees, lateRefundCents: refunds, sharedFees, hypotheticalFlat125DifferenceCents: !cancelled && !sharedFees && driverFees > 0 ? driverFees - Math.round(1.25 * selection.openingCents) : null }
  })
  details.push(...rows)
  weeks.push({ worldId, seed: meta.seed, selected: rows.length, active: rows.filter(row => !row.cancelled).length, late: rows.filter(row => row.late).length, noViews: rows.filter(row => row.views === 0).length, sumHypotheticalFlat125DifferenceCents: rows.reduce((sum, row) => sum + (row.hypotheticalFlat125DifferenceCents ?? 0), 0) })
}
const summary = { weeks: weeks.length, orders: details.length, ordersPerWeek: details.length / weeks.length, late: details.filter(row => row.late).length, noViews: details.filter(row => row.views === 0).length, meanHypotheticalFlat125DifferenceEuros: weeks.reduce((sum, row) => sum + row.sumHypotheticalFlat125DifferenceCents, 0) / weeks.length / 100 }
fs.writeFileSync("docs/early-rescue-screen.json", JSON.stringify({
  scope: "Six explicit old development weeks of the frozen late-rescue baseline. No new plays or fresh evaluation data.",
  hypothesis: "An earlier moderate increase for ready, persistently unbooked work could prevent expensive deadline rescue. Check exposure before testing a policy.",
  criterion: "Every15minutes,08:00-16:00: safe public first single-car listing,unbooked for60minutes,car ready,pickup open now,at least360minutes to last feasible pickup. Exclude orders already booked,expired,warned,changed or cancelled. Select each order once.",
  limitations: ["This is a retrospective exposure screen, not a causal saving estimate or rigorous bound. Actual driver costs, views, bookings, drops and trust can change with early repricing.", "The hypothetical difference subtracts1.25times canonical opening fee from the actual full driver spend, including negative differences. It assumes eventual fulfillment at that fixed price, which may be impossible. Refunds are reported separately, not credited as avoided costs.", "Final public gig records reconstruct appearance and membership. Any gig shortened anywhere in the week is excluded conservatively because its original stops are missing; this forensic exclusion uses future history and is not a deployable rule.", "Later observed outcomes label exposure; they do not enter the selection rule. Shared driver fees are excluded rather than allocated arbitrarily."],
  summary, weeks, details,
}, null, 2) + "\n")
console.log(JSON.stringify({ summary, weeks }, null, 2))
