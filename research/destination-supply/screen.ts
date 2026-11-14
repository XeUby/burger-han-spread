import fs from "node:fs"
import { Dispatcher } from "../../experiments/frontier/late-rescue/src/policy.ts"
import { requestFeasibility } from "../../experiments/frontier/late-rescue/src/admission.ts"
import type { World } from "../../experiments/frontier/late-rescue/vendor/typescript/spread.ts"
import type { DeskEvent, PriceRequest } from "../../experiments/frontier/late-rescue/vendor/typescript/types.ts"

const worlds = ["w9092313fc502252b79ab", "w47c0ea9c41007983b01e", "w488ffad22efd5faf742a", "w3faccc007c8c0bd5ff41", "w6893e7d9cdd984154dfe", "wa7bcf5d1654b6d337c61"]
const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const weeks = [], opportunities = []
for (const worldId of worlds) {
  const meta = read(`runs/${worldId}.meta.json`)
  const desk = new Dispatcher({} as World, 8, 0, read("docs/map.json"), read(`runs/${worldId}.drivers.json`), meta.settings)
  const requests = (read(`runs/${worldId}.events.json`) as DeskEvent[]).flatMap(event => event.kind === "price_request" ? [event.request] : [])
  let originRejected = 0, destinationBacked = 0
  for (const request of requests) {
    desk.now = request.arrivedAt
    const rules = desk.noteRules(request), leg = request.legs[0]!
    if (!rules.safe || request.legs.length !== 1 || leg.pickup.privateAddress || leg.delivery.privateAddress) continue
    const road = desk.network.road(leg.pickup.placeId, leg.delivery.placeId)
    const originSupply = desk.supply(request)
    if (road.km > 700 || originSupply >= 8) continue
    originRejected++
    const reverse: PriceRequest = { ...request, legs: [{ ...leg, pickup: leg.delivery, delivery: leg.pickup }] }
    const destinationSupply = desk.supply(reverse)
    if (destinationSupply < 50) continue
    const options = request.options.filter(option => {
      if (option.kind === "same_day") return false
      const plan = requestFeasibility(request, option.deadline, desk.network, desk.settings)
      return plan && plan.latestPickupAt >= request.respondBy + 1440
    })
    if (!options.length) continue
    destinationBacked++
    opportunities.push({ worldId, seed: meta.seed, requestId: request.id, arrivedAt: request.arrivedAt, origin: leg.pickup.placeId, destination: leg.delivery.placeId, roadKm: road.km, originSupply, destinationSupply, openingFeeCents: desk.baseFee(request), options })
  }
  weeks.push({ worldId, seed: meta.seed, originRejected, destinationBacked })
}
const report = {
  scope: "Six explicit old development weeks. No fresh evaluation data or new plays.",
  hypothesis: "Origin-only supply gates reject trips ending near many eligible drivers. With at least a day of pickup flexibility, destination-home drivers could travel out ahead and drive home, as described in the handbook.",
  criterion: "Safe public single-car request,<=700road km,<8weighted eligible origin drivers,>=50weighted eligible destination drivers,non-same-day option with last feasible pickup at least24h after respondBy.",
  limitations: ["Static exposure only. No counterfactual bookings, willingness to travel, demand, capacity displacement or profit is estimated.", "Destination-home supply is shared across remote origins; counting each lane independently would overstate available capacity.", "Driver notifications target the pickup neighborhood. Destination-home drivers may never view these remote pickups even when they could serve them economically."],
  summary: { weeks: worlds.length, requests: opportunities.length, requestsPerWeek: opportunities.length / worlds.length }, weeks, opportunities,
}
fs.writeFileSync("docs/destination-supply-screen.json", JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify({ summary: report.summary, weeks }, null, 2))
