import type { Leg, StopPlace, WorldMap, Road } from "../vendor/typescript/types.ts"

export class Network {
  roads: Map<string, Road>
  constructor(map: WorldMap) {
    this.roads = new Map(map.roads.map(road => [`${road.from}:${road.to}`, road]))
  }
  road(from: string, to: string): Road {
    const road = this.roads.get(`${from}:${to}`)
    if (!road) throw new Error(`Missing road ${from} -> ${to}`)
    return road
  }
  km(from: string, to: string): number { return this.road(from, to).km }
  minutes(from: string, to: string): number { return this.road(from, to).minutes }
}

export function intervals(stop: StopPlace, from: number, to: number): { from: number; to: number }[] {
  from = Math.max(from, stop.window.from)
  to = Math.min(to, stop.window.to)
  if (stop.privateAddress || !stop.hours) return from <= to ? [{ from, to }] : []
  const ranges = []
  for (let day = Math.floor(from / 1440); day <= Math.floor(to / 1440); day++) {
    const weekday = day % 7
    const hours = weekday === 5 ? stop.hours.saturday : stop.hours.weekdays.includes(weekday) ? stop.hours : null
    if (!hours) continue
    const start = Math.max(from, day * 1440 + hours.opens)
    const end = Math.min(to, day * 1440 + hours.closes - 1)
    if (start <= end) ranges.push({ from: start, to: end })
  }
  return ranges
}

export function lastPickup(leg: Leg, deadline: number, network: Network, plates = false): number {
  const road = network.road(leg.pickup.placeId, leg.delivery.placeId)
  const charge = needsCharge(leg, network) ? 40 : 0
  const travel = Math.ceil(road.minutes * 1.15) + charge + (plates ? 30 : 0) + 20
  let latest = -Infinity
  for (const pickup of intervals(leg.pickup, leg.pickup.window.from, deadline)) {
    for (const delivery of intervals(leg.delivery, leg.delivery.window.from, deadline)) {
      const end = Math.min(pickup.to, delivery.to - travel)
      if (end >= pickup.from) latest = Math.max(latest, end)
    }
  }
  return latest
}

export function needsCharge(leg: Leg, network: Network): boolean {
  return leg.car.electric && leg.car.chargePercent !== null && leg.car.chargePercent < 30 && network.km(leg.pickup.placeId, leg.delivery.placeId) > 200
}
