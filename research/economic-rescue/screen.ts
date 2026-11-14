import fs from "node:fs"
import { Dispatcher } from "../../src/policy.ts"
import type { World } from "../../vendor/typescript/spread.ts"
import type { DeskEvent, Order, PriceRequest } from "../../vendor/typescript/types.ts"

const worlds = ["w14d6b0034235af787311", "w0c6ce51dfdf6d4cc3970", "wf5eaeba5a1ba7b164ded", "w9a4b2d98037747387f31", "w9d5670b3d63668d52477", "wde70f6509f014550a4a8"]
const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const weeks = [], details = []
for (const worldId of worlds) {
  const meta = read(`runs/${worldId}.meta.json`), snapshot = read(`runs/${worldId}.snapshot.json`)
  if (snapshot.now !== snapshot.endsAt) throw new Error("Expected a complete week")
  const desk = new Dispatcher({} as World, 8, 0, read("docs/map.json"), read(`runs/${worldId}.drivers.json`), { ...meta.settings, lateRescue: false })
  const requests = new Map<string, PriceRequest>(), orders = new Map<string, Order>()
  const gigs = new Map<string, { stops: { orderId: string }[] }>(snapshot.gigs.map((gig: any) => [gig.id, gig]))
  const finalOrders = new Map<string, Order>(snapshot.orders.map((order: Order) => [order.id, order]))
  const paid = new Map<string, number>()
  const bookings = new Map<string, { orderId: string; bookedAt: number; lastPickupAt: number; deadline: number; priceCents: number; openingCents: number; feeCents: number }>()
  for (const event of read(`runs/${worldId}.events.json`) as DeskEvent[]) {
    if (event.kind === "price_request") requests.set(event.request.id, event.request)
    if (event.kind === "order_won" || event.kind === "order_changed") orders.set(event.order.id, event.order)
    if (event.kind === "ledger" && event.line.kind === "driver_fee" && event.line.gigId) paid.set(event.line.gigId, (paid.get(event.line.gigId) ?? 0) - event.line.cents)
    if (event.kind !== "gig_booked") continue
    const gig = gigs.get(event.gigId)
    if (!gig || gig.stops.length !== 2 || gig.stops[0]!.orderId !== gig.stops[1]!.orderId) continue
    const order = orders.get(gig.stops[0]!.orderId), request = requests.get(gig.stops[0]!.orderId)
    if (!order || !request || order.legs.length !== 1 || order.legs[0]!.pickup.privateAddress || order.legs[0]!.delivery.privateAddress) continue
    const duration = (legs: Order["legs"]) => 45 + legs.reduce((sum, leg) => sum + desk.network.minutes(leg.pickup.placeId, leg.delivery.placeId), 0)
    const openingCents = desk.baseFee({ ...request, legs: order.legs }) * Math.max(1, duration(order.legs) / duration(request.legs))
    bookings.set(event.gigId, { orderId: order.id, bookedAt: event.at, lastPickupAt: order.lastPickupAt, deadline: order.deadline, priceCents: order.priceCents, openingCents, feeCents: event.feeCents })
  }
  const rows = [...bookings].flatMap(([gigId, booking]) => {
    const order = finalOrders.get(booking.orderId)!, payment = paid.get(gigId) ?? 0
    if (order.status === "cancelled" || order.deliveredAt.some(at => at === null || at > order.deadline) || booking.bookedAt < booking.lastPickupAt - 120 || booking.bookedAt > booking.lastPickupAt || payment <= 0) return []
    const laterFee = Math.round(1.2 * booking.openingCents), refund = Math.ceil(.25 * booking.priceCents)
    return [{ worldId, seed: meta.seed, gigId, ...booking, paidCents: payment, assumedLaterFeeCents: laterFee, assumedRefundCents: refund, optimisticNetCents: payment - laterFee - refund }]
  })
  const active = snapshot.orders.filter((order: Order) => order.status !== "cancelled").length
  const budget = Math.floor(.03 * active)
  const profitable = rows.filter(row => row.optimisticNetCents > 0).sort((a, b) => b.optimisticNetCents - a.optimisticNetCents)
  const chosen = profitable.slice(0, budget)
  details.push(...rows)
  weeks.push({ worldId, seed: meta.seed, activeOrders: active, maximumSelectedOrders: budget, onTimeFinalTwoHourBookings: rows.length, positiveOpportunities: profitable.length, selected: chosen.length, optimisticNetEuros: chosen.reduce((sum, row) => sum + row.optimisticNetCents, 0) / 100 })
}
const summary = { weeks: weeks.length, meanSelectedOrders: weeks.reduce((sum, week) => sum + week.selected, 0) / weeks.length, meanOptimisticNetEuros: weeks.reduce((sum, week) => sum + week.optimisticNetEuros, 0) / weeks.length }
fs.writeFileSync("docs/economic-rescue-screen.json", JSON.stringify({
  scope: "Six explicit old development weeks; no fresh evaluation outcomes.",
  hypothesis: "A small lateness budget may save more in emergency driver fees than it costs in refunds. Screen only expensive bookings that still delivered on time, to avoid re-counting the validated post-cutoff reset.",
  method: "Keep each paid single-car gig's final booking. On final on-time orders booked within120 minutes before lastPickupAt, compare actual paid fee with1.2 times route-adjusted opening plus a25% price refund. With hindsight, select at most3% of the week's noncancelled orders with positive differences.",
  limitations: ["Optimistic descriptive screen, not a policy, causal estimate or rigorous global bound. Hindsight selects the best cases and uses the final week's order count.", "A cheaper later driver may not exist. Added waiting can change drops, refunds, trust, demand and other drivers' work. None of those spillovers is modeled.", "A25% refund assumes delivery no more than24 hours late; longer delays can cost substantially more. Future dealer trust loss is omitted.", "A3% selected-order cap does not bound other late deliveries or guarantee qualification."],
  summary, weeks, details,
}, null, 2) + "\n")
console.log(JSON.stringify({ summary, weeks }, null, 2))
