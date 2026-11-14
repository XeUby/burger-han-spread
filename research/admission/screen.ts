import fs from "node:fs"
import { Dispatcher } from "../../src/policy.ts"
import { requestFeasibility } from "../../src/admission.ts"
import type { World } from "../../vendor/typescript/spread.ts"
import type { DeskEvent, Order, PriceRequest } from "../../vendor/typescript/types.ts"

const worlds = ["w14d6b0034235af787311", "w0c6ce51dfdf6d4cc3970", "wf5eaeba5a1ba7b164ded", "w9a4b2d98037747387f31", "w9d5670b3d63668d52477", "wde70f6509f014550a4a8"]
const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const weeks = [], opportunities = [], mismatches = []
for (const worldId of worlds) {
  const meta = read(`runs/${worldId}.meta.json`), snapshot = read(`runs/${worldId}.snapshot.json`)
  if (snapshot.now !== snapshot.endsAt || meta.settings.timedNotes || meta.settings.auction) throw new Error("Expected a complete baseline week without delayed bidding")
  const desk = new Dispatcher({} as World, 8, 0, read("docs/map.json"), read(`runs/${worldId}.drivers.json`), meta.settings)
  const requests = new Map<string, PriceRequest>(), orders = new Map<string, Order>(), pending = new Set<string>()
  const gigs = new Map<string, { stops: { orderId: string; leg: number }[] }>(snapshot.gigs.map((gig: any) => [gig.id, gig]))
  const booked = new Map<string, Set<string>>()
  const quotes = new Map<string, Record<string, number>>(read(`runs/${worldId}.reveal.json`).requests.map((row: any) => [row.request.id, row.quote ?? {}]))
  const counts: Record<string, number> = {}, quotedCounts: Record<string, number> = {}
  const count = (key: string, commercial: boolean) => {
    counts[key] = (counts[key] ?? 0) + 1
    if (commercial) quotedCounts[key] = (quotedCounts[key] ?? 0) + 1
  }
  for (const event of read(`runs/${worldId}.events.json`) as DeskEvent[]) {
    desk.now = event.at
    if (event.kind === "order_lost") pending.delete(event.requestId)
    if (event.kind === "order_won" || event.kind === "order_changed") {
      const order = structuredClone(event.order), previous = orders.get(order.id)
      // Older recordings share objects with the live dispatcher; derive delivery state from events.
      order.deliveredAt = previous?.deliveredAt ?? order.legs.map(() => null)
      order.status = order.deliveredAt.every(at => at !== null) ? "delivered" : "waiting"
      orders.set(order.id, order)
      pending.delete(order.id)
    }
    if (event.kind === "order_cancelled") {
      orders.delete(event.orderId)
      for (const gig of event.gigs) if (["withdrawn", "released"].includes(gig.outcome)) booked.delete(gig.gigId)
    }
    if (event.kind === "gig_booked") {
      const gig = gigs.get(event.gigId)
      if (!gig) throw new Error(`Missing booked gig ${event.gigId}`)
      booked.set(event.gigId, new Set(gig.stops.map(stop => stop.orderId)))
    }
    if (event.kind === "gig_dropped" || event.kind === "no_show" || event.kind === "gig_expired") booked.delete(event.gigId)
    if (event.kind === "visit_failed") booked.get(event.gigId)?.delete(event.orderId)
    if (event.kind === "delivered") {
      const order = orders.get(event.orderId)
      if (!order) throw new Error(`Missing delivered order ${event.orderId}`)
      order.deliveredAt[event.leg] = event.at
      if (order.deliveredAt.every(at => at !== null)) order.status = "delivered"
      booked.get(event.gigId)?.delete(event.orderId)
    }
    if (event.kind !== "price_request") continue
    const request = event.request, leg = request.legs[0]!, day = Math.floor(leg.pickup.window.from / 1440)
    const commercial = Object.values(quotes.get(request.id) ?? {}).some(price => price < 100_000_000)
    const supply = desk.supply(request), road = desk.network.road(leg.pickup.placeId, leg.delivery.placeId)
    let load = 0, unbooked = 0, completed = 0
    for (const other of requests.values()) {
      const order = orders.get(other.id)
      if (!pending.has(other.id) && !order) continue
      const first = other.legs[0]!
      if (Math.floor(first.pickup.window.from / 1440) !== day) continue
      const km = desk.network.km(leg.pickup.placeId, first.pickup.placeId)
      const weight = km <= 30 ? 1 : km <= 70 ? 0.5 : 0
      load += weight
      if (order?.status === "delivered") completed += weight
      if (pending.has(other.id) || (order?.status !== "delivered" && ![...booked.values()].some(ids => ids.has(other.id)))) unbooked += weight
    }
    const capacityLimit = Math.max(1, supply * desk.settings.capacity), backlogLimit = Math.max(2, supply * desk.settings.backlog)
    const options = request.options.filter(option => {
      if (option.kind === "same_day" && (supply < 15 || day === Math.floor(event.at / 1440) && unbooked >= desk.settings.sameDayBacklog)) return false
      const trip = requestFeasibility(request, option.deadline, desk.network, desk.settings)
      const buffer = supply < 30 || road.km > 300 ? 300 : 210
      return trip && trip.latestPickupAt >= Math.max(event.at + buffer, leg.pickup.window.from + 120)
    })
    const reason = !desk.noteRules(request).safe ? "note" : road.km > desk.settings.maxKm ? "distance" : supply < desk.settings.minDrivers ? "supply" : load >= capacityLimit ? "daily_capacity" : unbooked >= backlogLimit ? "backlog" : !options.length ? "option_feasibility" : "passes_gates"
    count(reason, commercial)
    if (commercial && reason !== "passes_gates") mismatches.push({ worldId, requestId: request.id, at: event.at, reason, load, unbooked, completed, capacityLimit, backlogLimit })
    if (reason === "daily_capacity" && unbooked < backlogLimit && options.length) {
      opportunities.push({ worldId, seed: meta.seed, requestId: request.id, at: event.at, supply, load, unbooked, completed, capacityLimit, clearedByCompletedCredit: load - completed < capacityLimit, listLessOpeningCents: Math.max(...options.map(option => option.listPriceCents)) - desk.baseFee(request) })
    }
    requests.set(request.id, request)
    if (commercial) pending.add(request.id)
  }
  weeks.push({ worldId, seed: meta.seed, counts, quotedCounts })
}
const summary = {
  weeks: worlds.length, commerciallyQuotedGateMismatches: mismatches.length,
  capacityOnlyRequests: opportunities.length,
  clearedByCompletedCredit: opportunities.filter(row => row.clearedByCompletedCredit).length,
  meanCapacityOnlyListLessOpeningEuros: opportunities.reduce((sum, row) => sum + row.listLessOpeningCents, 0) / worlds.length / 100,
  meanCompletedCreditListLessOpeningEuros: opportunities.filter(row => row.clearedByCompletedCredit).reduce((sum, row) => sum + row.listLessOpeningCents, 0) / worlds.length / 100,
}
const report = {
  scope: "Six explicit old development weeks. No fresh evaluation outcomes.",
  method: "Replay actual commercially quoted requests and public order/booking/delivery events. Classify the first admission gate. Count requests blocked only by the daily quota while backlog and at least one option remain feasible. Test whether crediting already delivered work removes that gate.",
  limitations: ["No counterfactual demand, congestion or delivery simulation. List price less opening fee is descriptive exposure, not expected profit or a savings bound.", "Booking membership uses final gig stop records; commercial-quote gate mismatches check reconstruction errors but cannot prove exact state for every rejected request.", "Price-request event times approximate quote decision times. This screen deliberately does not fit or replay demand learning."],
  summary, weeks, opportunities, mismatches,
}
fs.writeFileSync("docs/admission-screen.json", JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify({ summary, weeks }, null, 2))
