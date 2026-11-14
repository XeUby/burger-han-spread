import fs from "node:fs"
import { Network } from "../../experiments/frontier/late-rescue/src/planning.ts"
import { requestFeasibility } from "../../experiments/frontier/late-rescue/src/admission.ts"
import { canSchedule } from "./calendar.ts"
import type { CalendarJob } from "./calendar.ts"
import type { DeskEvent, Gig, Order, PriceRequest } from "../../experiments/frontier/late-rescue/vendor/typescript/types.ts"

type Opportunity = { worldId: string; seed: string; requestId: string; origin: string; capacityLimit: number; backlogLimit: number; later: { feasiblePickupDays: number[] }[]; modeledQuote: { probability: number; expectedProfitCents: number } }
const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const source = read("docs/flexible-admission-screen.json")
if (source.summary.commerciallyQuotedGateMismatches || source.summary.quotePriceMismatches) throw new Error("Exposure replay must match the baseline")
const network = new Network(read("docs/map.json"))
type WeekResult = { worldId: string; seed: string; candidates: number; admitted: number; modeledWins: number; modeledMarginCents: number }
const weeks: WeekResult[] = [], details = []
for (const week of source.weeks) {
  const worldId: string = week.worldId
  const candidates = new Map<string, Opportunity>((source.opportunities as Opportunity[]).filter(row => row.worldId === worldId).map(row => [row.requestId, row]))
  const events: DeskEvent[] = read(`runs/${worldId}.events.json`)
  const gigs: Gig[] = read(`runs/${worldId}.snapshot.json`).gigs
  const endsAt: number = read(`runs/${worldId}.snapshot.json`).endsAt
  const members = new Map(gigs.map(gig => [gig.id, new Set(gig.stops.map(stop => stop.orderId))]))
  for (const event of events) if (event.kind === "order_cancelled") for (const gig of event.gigs) members.get(gig.gigId)?.add(event.orderId)
  const quotes = new Map<string, Record<string, number>>(read(`runs/${worldId}.reveal.json`).requests.map((row: { request: PriceRequest; quote?: Record<string, number> }) => [row.request.id, row.quote ?? {}]))
  const commercial = new Set([...quotes].filter(([, quote]) => Object.values(quote).some(price => price < 100_000_000)).map(([id]) => id))
  const requests = new Map<string, PriceRequest>(), orders = new Map<string, Order>()
  const pending = new Set<string>(), booked = new Map<string, Set<string>>()
  const pickedDays = new Map<string, number>()
  const reservations: { requestId: string; origin: string; day: number }[] = []
  const rows = []
  for (const event of events) {
    if (event.kind === "order_lost") pending.delete(event.requestId)
    if (event.kind === "order_won" || event.kind === "order_changed") {
      const order = structuredClone(event.order)
      order.deliveredAt = orders.get(order.id)?.deliveredAt ?? order.legs.map(() => null)
      orders.set(order.id, order)
      pending.delete(order.id)
    }
    if (event.kind === "order_cancelled") {
      orders.delete(event.orderId)
      for (const gig of event.gigs) if (["withdrawn", "released"].includes(gig.outcome)) booked.delete(gig.gigId)
    }
    if (event.kind === "gig_booked") booked.set(event.gigId, new Set(members.get(event.gigId)))
    if (event.kind === "gig_dropped" || event.kind === "no_show" || event.kind === "gig_expired") booked.delete(event.gigId)
    if (event.kind === "visit_failed") booked.get(event.gigId)?.delete(event.orderId)
    if (event.kind === "picked_up") pickedDays.set(event.orderId, Math.floor(event.at / 1440))
    if (event.kind === "delivered") {
      orders.get(event.orderId)!.deliveredAt[event.leg] = event.at
      booked.get(event.gigId)?.delete(event.orderId)
    }
    if (event.kind !== "price_request") continue
    const opportunity = candidates.get(event.request.id)
    if (opportunity) {
      const nearby = (origin: string) => network.km(opportunity.origin, origin) <= 70
      const today = Math.floor(event.at / 1440)
      const days = [...new Set(opportunity.later[0]!.feasiblePickupDays)].filter(day => opportunity.later.every(option => option.feasiblePickupDays.includes(day))).sort((a, b) => a - b)
      const known: CalendarJob[] = []
      let alreadyLate = 0
      for (const [id, request] of requests) {
        const order = orders.get(id)
        if (!pending.has(id) && !order) continue
        const legs = order?.legs ?? request.legs
        if (!nearby(legs[0]!.pickup.placeId)) continue
        const picked = pickedDays.get(id)
        if (picked !== undefined) {
          if (picked === today) known.push({ days: [today], unbooked: false })
          continue
        }
        if (order?.deliveredAt.every(at => at !== null)) continue
        const deadline = order?.deadline ?? Math.min(...request.options.filter(option => (quotes.get(id)?.[option.kind] ?? Infinity) < 100_000_000).map(option => option.deadline))
        let feasible = serviceDays({ ...request, legs }, deadline, event.at)
        if (!feasible.length && order) {
          const extended = { ...request, legs: legs.map(leg => ({ ...leg, pickup: { ...leg.pickup, window: { ...leg.pickup.window, to: endsAt } }, delivery: { ...leg.delivery, window: { ...leg.delivery.window, to: endsAt } } })) }
          feasible = serviceDays(extended, endsAt, event.at).slice(0, 1)
          alreadyLate++
        }
        known.push({ days: feasible, unbooked: pending.has(id) || ![...booked.values()].some(ids => ids.has(id)) })
      }
      const previous = reservations.filter(row => row.day >= today && nearby(row.origin)).map(row => ({ days: [row.day], unbooked: true }))
      const horizon = Array.from({ length: Math.floor(endsAt / 1440) - today + 1 }, (_, i) => today + i)
      const unsupportedKnownJobs = known.filter(job => !job.days.length).length
      const overReservedDays = horizon.filter(day => known.filter(job => !job.unbooked && job.days.includes(day)).length > Math.floor(opportunity.capacityLimit)).length
      const limits = new Map(horizon.map(day => [day, {
        total: Math.max(0, Math.floor(opportunity.capacityLimit) - known.filter(job => !job.unbooked && job.days.includes(day)).length),
        unbooked: Math.floor(opportunity.backlogLimit),
      }]))
      const jobs = [...known.filter(job => job.unbooked), ...previous]
      const checks = days.map(day => ({ day, fits: unsupportedKnownJobs === 0 && canSchedule([...jobs, { days: [day], unbooked: true }], limits) }))
      const selected = checks.find(check => check.fits)
      if (selected) reservations.push({ requestId: opportunity.requestId, origin: opportunity.origin, day: selected.day })
      rows.push({ ...opportunity, at: event.at, serviceDay: selected?.day ?? null, knownJobs: known.length, unsupportedKnownJobs, overReservedDays, alreadyLate, priorReservations: previous.length, checks })
    }
    requests.set(event.request.id, event.request)
    if (commercial.has(event.request.id)) pending.add(event.request.id)
  }
  if (rows.length !== candidates.size) throw new Error("Every exposure request must be assessed once")
  const admitted = rows.filter(row => row.serviceDay !== null)
  weeks.push({ worldId, seed: week.seed, candidates: candidates.size, admitted: admitted.length, modeledWins: admitted.reduce((sum, row) => sum + row.modeledQuote.probability, 0), modeledMarginCents: admitted.reduce((sum, row) => sum + row.modeledQuote.expectedProfitCents, 0) })
  details.push(...rows)
}
const summary = { weeks: weeks.length, candidates: details.length, admitted: details.filter(row => row.serviceDay !== null).length, meanAdmittedRequests: weeks.reduce((sum, row) => sum + row.admitted, 0) / weeks.length, meanModeledWins: weeks.reduce((sum, row) => sum + row.modeledWins, 0) / weeks.length, meanModeledMarginEuros: weeks.reduce((sum, row) => sum + row.modeledMarginCents, 0) / weeks.length / 100 }
fs.writeFileSync("docs/flexible-admission-capacity.json", JSON.stringify({
  source: "docs/flexible-admission-screen.json", scope: "Same six old development worlds; no new plays or independent evaluation data.",
  method: "In chronological order, choose the earliest later day feasible for every retained quote option. Protect booked commitments by subtracting one unit on every feasible service day, clipping residual daily capacity at zero; this deliberately over-reserves uncertain booked plans. Assign each known nearby unbooked obligation once using integral max flow under residual total and backlog quotas. Each job costs one full unit within70km, including those normally weighted0.5; quotas are rounded down. Each earlier hypothetical admission reserves one full unit on its fixed selected day regardless of win probability. Observed pickups consume their actual pickup day. Already-infeasible uncollected orders use their first feasible late service day with public windows extended.",
  limitations: ["This is a model stress screen, not a policy rollout or guaranteed capacity bound. Real driver availability is hidden; geographic quotas remain proxies. Saturday driver supply is not separately modeled.", "Integer flow gives exact feasibility only for the residual unit-job model. It does not schedule individual drivers, move existing bookings, or establish that existing commitments satisfy those quotas. Days over-reserved by booked commitments have zero room for added work rather than invalidating unrelated future days.", "A known job with no same-day route even after the late-window extension rejects the whole candidate calendar; this can reflect a multi-day reroute outside this model, not actual impossible service. Such jobs are counted as unsupported.", "Later baseline arrivals can use the same future capacity, displacing hypothetical admissions or being displaced by them. Their counterfactual profits and delivery effects are not simulated.", "Extra jobs are assumed to use only their assigned day; failed completion or unbooked spillover is not simulated. Demand, fees, dealer trust and pickup-window effects retain the exposure screen's limitations."],
  summary, weeks, details,
}, null, 2) + "\n")
console.log(JSON.stringify({ summary, weeks }, null, 2))

function serviceDays(request: PriceRequest, deadline: number, now: number): number[] {
  const days = []
  for (let day = Math.floor(now / 1440); day <= Math.floor(deadline / 1440); day++) {
    const from = Math.max(now, day * 1440), to = Math.min(deadline, day * 1440 + 1439)
    const future = { ...request, legs: request.legs.map(leg => ({ ...leg, pickup: { ...leg.pickup, window: { from: Math.max(leg.pickup.window.from, from), to: Math.min(leg.pickup.window.to, to) } }, delivery: { ...leg.delivery, window: { from: Math.max(leg.delivery.window.from, from), to: Math.min(leg.delivery.window.to, to) } } })) }
    const trip = requestFeasibility(future, to, network)
    if (trip && trip.latestPickupAt >= from) days.push(day)
  }
  return days
}
