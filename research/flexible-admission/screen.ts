import fs from "node:fs"
import { Dispatcher } from "../../experiments/frontier/late-rescue/src/policy.ts"
import { requestFeasibility } from "../../experiments/frontier/late-rescue/src/admission.ts"
import { intervals } from "../../experiments/frontier/late-rescue/src/planning.ts"
import type { World } from "../../experiments/frontier/late-rescue/vendor/typescript/spread.ts"
import type { DeskEvent, Order, PriceRequest } from "../../experiments/frontier/late-rescue/vendor/typescript/types.ts"

const worlds = ["w9092313fc502252b79ab", "w47c0ea9c41007983b01e", "w488ffad22efd5faf742a", "w3faccc007c8c0bd5ff41", "w6893e7d9cdd984154dfe", "wa7bcf5d1654b6d337c61"]
const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const revision = "16d908dd8e96325d972aa45529f69d6ca82910be212b68857e7cf3f0677530ef"
const weeks = [], opportunities = [], mismatches = [], priceMismatches = []
let replayedQuotes = 0, replayedOptionPrices = 0
for (const worldId of worlds) {
  const meta = read(`runs/${worldId}.meta.json`), snapshot = read(`runs/${worldId}.snapshot.json`)
  if (snapshot.now !== snapshot.endsAt || meta.revision !== revision || meta.settings.timedNotes || meta.settings.auction) throw new Error("Expected a complete frozen baseline week without delayed bidding")
  const desk = new Dispatcher({} as World, 8, 0, read("docs/map.json"), read(`runs/${worldId}.drivers.json`), meta.settings)
  const requests = new Map<string, PriceRequest>(), orders = new Map<string, Order>(), pending = new Set<string>()
  const gigs = new Map<string, { stops: { orderId: string; leg: number }[] }>(snapshot.gigs.map((gig: any) => [gig.id, gig]))
  const events: DeskEvent[] = read(`runs/${worldId}.events.json`)
  const members = new Map([...gigs].map(([id, gig]) => [id, new Set(gig.stops.map(stop => stop.orderId))]))
  for (const event of events) if (event.kind === "order_cancelled") for (const gig of event.gigs) members.get(gig.gigId)?.add(event.orderId)
  const booked = new Map<string, Set<string>>()
  const delivered = new Set<string>()
  const quotes = new Map<string, Record<string, number>>(read(`runs/${worldId}.reveal.json`).requests.map((row: any) => [row.request.id, row.quote ?? {}]))
  const counts: Record<string, number> = {}, quotedCounts: Record<string, number> = {}
  const count = (key: string, commercial: boolean) => {
    counts[key] = (counts[key] ?? 0) + 1
    if (commercial) quotedCounts[key] = (quotedCounts[key] ?? 0) + 1
  }
  for (const event of events) {
    desk.now = event.at
    if (event.kind === "order_won" || event.kind === "order_lost") {
      const id = event.kind === "order_won" ? event.order.id : event.requestId
      const bid = desk.bids.get(id)
      if (bid) desk.market.observe(bid.features, bid.ratio, event.kind === "order_won")
      desk.bids.delete(id)
    }
    if (event.kind === "order_lost") pending.delete(event.requestId)
    if (event.kind === "order_won" || event.kind === "order_changed") {
      const order = structuredClone(event.order), previous = orders.get(order.id)
      // Derive delivery state from events rather than final order payloads.
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
      booked.set(event.gigId, new Set(members.get(event.gigId)))
    }
    if (event.kind === "gig_dropped" || event.kind === "no_show" || event.kind === "gig_expired") booked.delete(event.gigId)
    if (event.kind === "visit_failed") booked.get(event.gigId)?.delete(event.orderId)
    if (event.kind === "delivered") {
      const order = orders.get(event.orderId)
      if (!order) throw new Error(`Missing delivered order ${event.orderId}`)
      order.deliveredAt[event.leg] = event.at
      if (order.deliveredAt.every(at => at !== null)) {
        order.status = "delivered"
        if (!delivered.has(order.id)) {
          delivered.add(order.id)
          const count = desk.trust.get(order.dealerId) ?? 0
          const onTime = order.legs.every((leg, i) => order.deliveredAt[i]! <= Math.min(order.deadline, leg.delivery.privateAddress ? leg.delivery.window.to + 30 : Infinity))
          desk.trust.set(order.dealerId, onTime ? Math.min(25, count + 1) : Math.floor(count / 2))
        }
      }
      booked.get(event.gigId)?.delete(event.orderId)
    }
    if (event.kind !== "price_request") continue
    const request = event.request, leg = request.legs[0]!, day = Math.floor(leg.pickup.window.from / 1440)
    const commercial = Object.values(quotes.get(request.id) ?? {}).some(price => price < 100_000_000)
    const fee = desk.baseFee(request)
    const trust = 1 + desk.settings.trustStep * Math.min(25, desk.trust.get(request.dealerId) ?? 0)
    const choose = (listPriceCents: number) => desk.market.optimize(desk.features(request), { costCents: fee * desk.settings.costRatio, listPriceCents, trust, minPrice: Math.ceil(fee / (1 - desk.settings.margin) + desk.settings.priceFloor) })
    if (commercial) {
      replayedQuotes++
      const actual = quotes.get(request.id)!
      const offered = request.options.filter(option => actual[option.kind] !== undefined && actual[option.kind]! < 100_000_000)
      const choice = choose(Math.min(...offered.map(option => option.listPriceCents)))
      desk.bids.set(request.id, { features: desk.features(request), ratio: choice.ratio })
      for (const option of offered) {
        replayedOptionPrices++
        const expected = Math.ceil(option.listPriceCents * trust * choice.ratio)
        if (expected !== actual[option.kind]) priceMismatches.push({ worldId, requestId: request.id, option: option.kind, expected, actual: actual[option.kind] })
      }
    }
    const supply = desk.supply(request), road = desk.network.road(leg.pickup.placeId, leg.delivery.placeId)
    let load = 0, unbooked = 0
    for (const other of requests.values()) {
      const order = orders.get(other.id)
      if (!pending.has(other.id) && !order) continue
      const first = other.legs[0]!
      if (Math.floor(first.pickup.window.from / 1440) !== day) continue
      const km = desk.network.km(leg.pickup.placeId, first.pickup.placeId)
      const weight = km <= 30 ? 1 : km <= 70 ? 0.5 : 0
      load += weight
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
    if (commercial && reason !== "passes_gates") mismatches.push({ worldId, requestId: request.id, at: event.at, reason, load, unbooked, capacityLimit, backlogLimit })
    if (!commercial && (reason === "daily_capacity" || reason === "backlog")) {
      const later = request.options.filter(option => option.kind !== "same_day").flatMap(option => {
        const days = []
        const firstDay = Math.max(Math.floor(event.at / 1440) + 1, day + 1)
        for (let futureDay = firstDay; futureDay <= Math.floor(option.deadline / 1440); futureDay++) {
          const from = Math.max(leg.pickup.window.from, futureDay * 1440)
          const end = futureDay * 1440 + 1439
          const future: PriceRequest = { ...request, legs: request.legs.map(car => ({ ...car, pickup: { ...car.pickup, window: { from: Math.max(car.pickup.window.from, from), to: Math.min(car.pickup.window.to, end) } }, delivery: { ...car.delivery, window: { from: Math.max(car.delivery.window.from, futureDay * 1440), to: Math.min(car.delivery.window.to, end) } } })) }
          const trip = requestFeasibility(future, Math.min(option.deadline, end), desk.network, desk.settings)
          const firstOpen = intervals(future.legs[0]!.pickup, from, end)[0]?.from ?? Infinity
          if (trip && trip.latestPickupAt >= firstOpen + 120) days.push(futureDay)
        }
        return days.length ? [{ kind: option.kind, listPriceCents: option.listPriceCents, feasiblePickupDays: days }] : []
      })
      if (later.length) {
        const choice = choose(Math.min(...later.map(option => option.listPriceCents)))
        opportunities.push({ worldId, seed: meta.seed, requestId: request.id, at: event.at, readyDay: day, origin: leg.pickup.placeId, destination: leg.delivery.placeId, roadKm: road.km, supply, load, unbooked, capacityLimit, backlogLimit, reason, openingFeeCents: fee, later, modeledQuote: choice })
      }
    }
    requests.set(request.id, request)
    if (commercial) pending.add(request.id)
  }
  weeks.push({ worldId, seed: meta.seed, counts, quotedCounts })
}
const summary = {
  weeks: worlds.length, commerciallyQuotedGateMismatches: mismatches.length,
  flexibleRejectedRequests: opportunities.length,
  flexibleRejectedRequestsPerWeek: opportunities.length / worlds.length,
  dailyCapacityRejected: opportunities.filter(row => row.reason === "daily_capacity").length,
  backlogRejected: opportunities.filter(row => row.reason === "backlog").length,
  quotePriceMismatches: priceMismatches.length,
  replayedQuotes, replayedOptionPrices,
  meanModeledAdditionalWins: opportunities.reduce((sum, row) => sum + row.modeledQuote.probability, 0) / worlds.length,
  meanModeledAdditionalMarginEuros: opportunities.reduce((sum, row) => sum + row.modeledQuote.expectedProfitCents, 0) / worlds.length / 100,
}
const report = {
  scope: "Six explicit old development weeks. No fresh evaluation outcomes.",
  revision,
  hypothesis: "Current admission charges work to the car's ready day, even when a later quote option allows pickup and delivery on another business day. Time-aware capacity allocation may admit profitable flexible work without crowding urgent cars.",
  method: "Replay public events and actual commercial quotes from six frozen late-rescue development weeks. Among requests first rejected by daily capacity or backlog, count later delivery options that remain feasible entirely within at least one day strictly after both today and the original ready day, with120minutes of pickup slack after the first open pickup minute. Respect notes, distance, supply, equipment, charging and site hours through the frozen feasibility helper.",
  pricingMethod: "Replay the frozen online market model using only preceding actual quoted wins/losses and delivered-order trust. Recompute each actual commercial quote and count cent mismatches. For rejected flexible work, optimize only the remaining later options at the original canonical cost estimate; do not feed hypothetical wins back into the model.",
  limitations: ["This is a model-based exposure screen, not a capacity allocation or identified profit estimate. Future drivers, work days, existing obligations and future arrivals compete for those windows. Deferred pickup may change costs and booking behavior.", "Each request is counted once even if it has several later options or days. No extra orders are inserted into the baseline trace, so interactions between hypothetical wins are not simulated.", "Booking membership uses final gig stops plus public cancellation records to restore members removed by shortening. This forensic reconstruction restores what the original post exposed; the future cancellation outcome is not an admission feature. Commercial-quote gate mismatches check reconstruction errors but cannot prove exact state for every rejected request.", "Price-request event times approximate quote decision times. Actual quotes identify baseline pending work and preceding market observations; no hidden future outcomes determine candidate eligibility. Demand and cost estimates on historically rejected work are unvalidated."],
  summary, weeks, opportunities, mismatches, priceMismatches,
}
fs.writeFileSync("docs/flexible-admission-screen.json", JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify({ summary, weeks }, null, 2))
