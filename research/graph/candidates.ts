import { intervals, needsCharge } from '../../src/planning.ts'
import type { Network } from '../../src/planning.ts'
import { interpret } from './constraints.ts'
import type { Constraints } from './constraints.ts'
import type { Audience, PriceRequest, StopPlace, StopRef } from '../../vendor/typescript/types.ts'

export type Visit = { stop: StopPlace; ref: StopRef }
export type Route = {
  visits: Visit[]
  gaps: number[]
  drivingMinutes: number
  audience: Audience
  earliestDelivery: number
  latestStart: number
}
export type Option = { id: string; requestId: string; kind: PriceRequest['options'][number]['kind']; listPriceCents: number; deadline: number; constraints: Constraints; route: Route }
export type Pair = { first: string; second: string; route: Route; fallback: [Route, Route] }
export type Graph = { options: Option[]; pairs: Pair[]; omitted: { requestId: string; reason: string; option?: string }[] }
export type Limits = { requests: number; pairRoutes: number; bookingMinutes: number; maxDrivingMinutes: number }
const defaults: Limits = { requests: 12, pairRoutes: 500, bookingMinutes: 30, maxDrivingMinutes: 720 }

export function buildGraph(requests: readonly PriceRequest[], now: number, level: number, network: Network, overrides: Partial<Limits> = {}): Graph {
  const limits = { ...defaults, ...overrides }
  if (!Object.values(limits).every(Number.isSafeInteger) || limits.requests < 1 || limits.requests > 30 || limits.pairRoutes < 0 || limits.pairRoutes > 5000 || limits.bookingMinutes < 0 || limits.maxDrivingMinutes < 1 || limits.maxDrivingMinutes > 720) throw new Error('Invalid graph limits')
  if (new Set(requests.map(r => r.id)).size !== requests.length) throw new Error('Duplicate request')
  if (requests.some(r => r.arrivedAt > now)) throw new Error('Future request cannot enter a decision')
  const graph: Graph = { options: [], pairs: [], omitted: [] }
  const sorted = [...requests].sort((a, b) => a.respondBy - b.respondBy || a.arrivedAt - b.arrivedAt)
  for (const [index, request] of sorted.entries()) {
    if (index >= limits.requests) { graph.omitted.push({ requestId: request.id, reason: 'request_budget' }); continue }
    const parsed = interpret(request, now, level)
    if (!parsed.ok) { graph.omitted.push({ requestId: request.id, reason: parsed.reason }); continue }
    for (const option of parsed.value.options) {
      const route = solo(parsed.value, option.deadline, request.respondBy + limits.bookingMinutes, network)
      if (!route || parsed.value.legs.length > 1 && route.drivingMinutes > limits.maxDrivingMinutes) {
        graph.omitted.push({ requestId: request.id, option: option.kind, reason: 'no_route_inside_windows' }); continue
      }
      graph.options.push({ id: `${request.id}:${option.kind}`, requestId: request.id, kind: option.kind, listPriceCents: option.listPriceCents, deadline: option.deadline, constraints: parsed.value, route })
    }
  }
  if (level < 3) return graph
  for (let a = 0; a < graph.options.length; a++) for (let b = a + 1; b < graph.options.length; b++) {
    const first = graph.options[a]!, second = graph.options[b]!
    if (first.requestId === second.requestId) continue
    const start = Math.max(requests.find(r => r.id === first.requestId)!.respondBy, requests.find(r => r.id === second.requestId)!.respondBy) + limits.bookingMinutes
    for (const [left, right] of [[first, second], [second, first]] as [Option, Option][]) {
      const connector = network.minutes(left.route.visits.at(-1)!.stop.placeId, right.route.visits[0]!.stop.placeId)
      const drivingMinutes = left.route.drivingMinutes + connector + right.route.drivingMinutes
      if (drivingMinutes > limits.maxDrivingMinutes) continue
      const route = fit([...left.route.visits, ...right.route.visits], [...left.route.gaps, Math.ceil(connector * 1.15) + 10, ...right.route.gaps], start, drivingMinutes, { experienced: left.route.audience.experienced || right.route.audience.experienced, manualLicence: left.route.audience.manualLicence || right.route.audience.manualLicence })
      if (!route) continue
      if (graph.pairs.length >= limits.pairRoutes) { graph.omitted.push({ requestId: left.requestId, option: `${left.kind}+${right.id}`, reason: 'pair_budget' }); continue }
      graph.pairs.push({ first: left.id, second: right.id, route, fallback: [left.route, right.route] })
    }
  }
  return graph
}

function solo(c: Constraints, deadline: number, start: number, network: Network): Route | null {
  const visits: Visit[] = [], gaps: number[] = []
  let drivingMinutes = 0
  for (const [i, leg] of c.legs.entries()) {
    if (i) {
      const connector = network.minutes(c.legs[i - 1]!.delivery.placeId, leg.pickup.placeId)
      gaps.push(Math.ceil(connector * 1.15) + 10)
      drivingMinutes += connector
    }
    const drive = network.minutes(leg.pickup.placeId, leg.delivery.placeId)
    drivingMinutes += drive
    const charging = needsCharge(leg, network)
    for (const kind of ['pickup', 'delivery'] as const) {
      const stop = structuredClone(leg[kind])
      stop.window.to = Math.min(stop.window.to, deadline)
      visits.push({ stop, ref: { orderId: c.requestId, leg: i, kind, ...(kind === 'pickup' ? { withPlates: c.plates, withCharging: charging } : {}) } })
    }
    gaps.push(Math.ceil(drive * 1.15) + 20 + (charging ? 40 : 0) + (c.plates ? 30 : 0))
  }
  return fit(visits, gaps, start, drivingMinutes, { experienced: c.legs.some(l => l.car.premium), manualLicence: c.manual })
}

function fit(visits: Visit[], gaps: number[], start: number, drivingMinutes: number, audience: Audience): Route | null {
  let at = start
  for (const [i, { stop }] of visits.entries()) {
    at = intervals(stop, at, stop.window.to)[0]?.from ?? Infinity
    if (!Number.isFinite(at)) return null
    if (i < gaps.length) at += gaps[i]!
  }
  const earliestDelivery = at
  for (let i = visits.length - 1; i >= 0; i--) {
    const stop = visits[i]!.stop
    at = intervals(stop, stop.window.from, i === visits.length - 1 ? stop.window.to : at).at(-1)?.to ?? -Infinity
    if (!Number.isFinite(at)) return null
    if (i > 0) at -= gaps[i - 1]!
  }
  return at >= start ? { visits, gaps, drivingMinutes, audience, earliestDelivery, latestStart: at } : null
}
