import fs from "node:fs"
import { Dispatcher } from "../../src/policy.ts"
import type { World } from "../../vendor/typescript/spread.ts"
import type { DeskEvent, Order, PriceRequest } from "../../vendor/typescript/types.ts"

const worlds = ["w14d6b0034235af787311", "w795d29e846e3829728f4", "wf5eaeba5a1ba7b164ded", "w9a4b2d98037747387f31", "w9d5670b3d63668d52477", "w5b49acb1da9497bc29c9"]
const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const weeks = [], details = []
for (const worldId of worlds) {
  const meta = read(`runs/${worldId}.meta.json`), snapshot = read(`runs/${worldId}.snapshot.json`)
  if (snapshot.now < snapshot.endsAt) throw new Error("Screen requires a completed week")
  const desk = new Dispatcher({} as World, 8, 0, read("docs/map.json"), read(`runs/${worldId}.drivers.json`), meta.settings)
  const events: DeskEvent[] = read(`runs/${worldId}.events.json`)
  const requests = new Map<string, PriceRequest>(), orders = new Map<string, Order>()
  const gigs = new Map<string, any>(snapshot.gigs.map((gig: any) => [gig.id, gig]))
  const bookings = new Map<string, { at: number; orderId: string; feeCents: number; opening: number; deadline: number; lastPickup: number; priceCents: number }>()
  const paid = new Map<string, number>()
  for (const event of events) {
    if (event.kind === "price_request") requests.set(event.request.id, event.request)
    if (event.kind === "order_won" || event.kind === "order_changed") orders.set(event.order.id, event.order)
    if (event.kind === "ledger" && event.line.kind === "driver_fee" && event.line.gigId) paid.set(event.line.gigId, (paid.get(event.line.gigId) ?? 0) - event.line.cents)
    if (event.kind !== "gig_booked") continue
    const gig = gigs.get(event.gigId)
    if (!gig || gig.stops.length !== 2 || gig.stops[0].orderId !== gig.stops[1].orderId) continue
    const order = orders.get(gig.stops[0].orderId), request = requests.get(gig.stops[0].orderId)
    if (!order || !request || order.legs.length !== 1) continue
    const duration = (legs: Order["legs"]) => 45 + legs.reduce((sum, leg) => sum + desk.network.minutes(leg.pickup.placeId, leg.delivery.placeId), 0)
    const opening = desk.baseFee({ ...request, legs: order.legs }) * Math.max(1, duration(order.legs) / duration(request.legs))
    bookings.set(event.gigId, { at: event.at, orderId: order.id, feeCents: event.feeCents, opening, deadline: order.deadline, lastPickup: order.lastPickupAt, priceCents: order.priceCents })
  }
  const rows = [...bookings].filter(([gigId]) => (paid.get(gigId) ?? 0) > 0).map(([gigId, booking]) => ({ worldId, seed: meta.seed, gigId, ...booking, paidCents: paid.get(gigId)!, excessOverOpeningCents: Math.max(0, paid.get(gigId)! - booking.opening), afterLastPickup: booking.at > booking.lastPickup, afterTwoHourRefundBoundary: booking.at > booking.deadline + 120 }))
  const late = rows.filter(row => row.afterLastPickup), boundary = rows.filter(row => row.afterTwoHourRefundBoundary)
  const sum = (values: typeof rows, key: "paidCents" | "excessOverOpeningCents") => values.reduce((total, row) => total + row[key], 0)
  weeks.push({ worldId, seed: meta.seed, paidSingleGigs: rows.length, afterLastPickup: late.length, afterLastPickupPaidEuros: sum(late, "paidCents") / 100, afterLastPickupExcessEuros: sum(late, "excessOverOpeningCents") / 100, afterTwoHourBoundary: boundary.length, afterTwoHourBoundaryPaidEuros: sum(boundary, "paidCents") / 100, afterTwoHourBoundaryExcessEuros: sum(boundary, "excessOverOpeningCents") / 100 })
  details.push(...late)
}
const summary = { weeks: weeks.length, meanLateBookings: weeks.reduce((sum, row) => sum + row.afterLastPickup, 0) / weeks.length, meanLateBookingSpendEuros: weeks.reduce((sum, row) => sum + row.afterLastPickupPaidEuros, 0) / weeks.length, meanLateExcessOverOpeningEuros: weeks.reduce((sum, row) => sum + row.afterLastPickupExcessEuros, 0) / weeks.length, meanPostTwoHourBoundaryBookings: weeks.reduce((sum, row) => sum + row.afterTwoHourBoundary, 0) / weeks.length, meanPostBoundaryExcessEuros: weeks.reduce((sum, row) => sum + row.afterTwoHourBoundaryExcessEuros, 0) / weeks.length }
fs.writeFileSync("docs/late-rescue-screen.json", JSON.stringify({ scope: "Six explicit old development weeks using the selected volume-plus-bundles settings. No fresh evaluation outcomes.", method: "Reconstruct order deadlines and lastPickupAt at each booking. Keep each single-car gig's final booking and paid driver fees. Compare paid fees with the policy's route-adjusted opening fee. Separate bookings after the public last pickup and after the deadline plus120 minutes.", limitations: ["Descriptive expenditure screen, not a predicted saving or a global upper bound. Reducing a fee can change acceptance, drops, delivery time and refunds.", "Already-booked or started expensive work cannot be repriced; shared gigs are excluded.", "The final observed booking and ledger payment identify expenditure. A lower fee would not necessarily retain that driver or refund bracket."], summary, weeks, details }, null, 2) + "\n")
console.log(JSON.stringify(summary, null, 2))
