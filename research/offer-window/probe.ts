import fs from "node:fs"
import { Client } from "../../vendor/typescript/spread.ts"
import { Dispatcher } from "../../src/policy.ts"
import { needsCharge } from "../../src/planning.ts"
import type { DeskEvent, PostAction, PriceRequest } from "../../vendor/typescript/types.ts"

if (!process.argv.includes("--execute")) throw new Error("Pass --execute to run the bounded ordinary-practice mechanism probe")
const client = new Client(), seed = "mechanics-offer-window-01"
async function slot() {
  let announced = false
  while ((await client.worlds()).filter(world => !world.ended).length >= 4) {
    if (!announced) console.log("Waiting below the four-play cap")
    announced = true
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
}
await slot()
const base = await client.create(8, { seed })
const desk = new Dispatcher(base, 8, 0, await client.map(), await base.roster())
const report = { seed, baseWorld: base.id, startedAt: new Date().toISOString(), scope: "At most twelve isolated early same-day jobs before15:00, three deterministic forks per job. Compare normal public posting, normal posting plus three85%-fee direct offers, and a10-minute low-public-fee offer window followed by the normal public fee. This is a booking-mechanism probe, not whole-week profit or fulfillment evidence.", cases: [] as unknown[], baseDeleted: false }
const file = "runs/offer-window-probe.json"
const save = () => fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n")
save()
console.log(JSON.stringify({ baseWorld: base.id, seed }))
let now = 0
try {
  while (report.cases.length < 12 && now < 900) {
    const step = await base.advance({ untilEvent: ["price_request"], max: 900 })
    now = step.now
    const request = step.events.flatMap(event => event.kind === "price_request" ? [event.request] : []).find(eligible)
    if (!request) continue
    const outcome = await base.advance({ to: request.respondBy + 1, actions: [{ type: "quote", requestId: request.id, prices: { same_day: 100 } }] })
    now = outcome.now
    const event = outcome.events.find(event => event.kind === "order_won" && event.order.id === request.id)
    if (event?.kind !== "order_won") continue
    const order = event.order, leg = order.legs[0]!, rules = desk.noteRules(request)
    const opening = desk.baseFee(request), offered = Math.round(opening * .85)
    const recipients = desk.drivers.filter(driver => desk.network.km(driver.homePlaceId, leg.pickup.placeId) <= 35 && (!rules.manual || driver.licence === "manual") && (!leg.car.premium || driver.rating >= 4.8 && driver.completedGigs >= 50))
      .sort((a, b) => desk.network.km(a.homePlaceId, leg.pickup.placeId) - desk.network.km(b.homePlaceId, leg.pickup.placeId) || a.drops / Math.max(1, a.completedGigs) - b.drops / Math.max(1, b.completedGigs) || a.id.localeCompare(b.id)).slice(0, 3)
    const row = { request, order, openingFeeCents: opening, offeredFeeCents: offered, recipients: recipients.map(driver => driver.id), arms: [] as unknown[] }
    report.cases.push(row)
    save()
    for (const arm of ["public", "public-with-offers", "offer-window"]) {
      await slot()
      const fork = await base.fork()
      const trace: { arm: string; worldId: string; deleted: boolean; events: DeskEvent[]; results: unknown[]; snapshot?: unknown } = { arm, worldId: fork.id, deleted: false, events: [], results: [] }
      row.arms.push(trace)
      save()
      try {
        const post: PostAction = { type: "post", stops: [{ orderId: order.id, leg: 0, kind: "pickup", withPlates: rules.plates, withCharging: needsCharge(leg, desk.network) }, { orderId: order.id, leg: 0, kind: "delivery" }], audience: { experienced: leg.car.premium, manualLicence: rules.manual }, schedule: [{ at: now, feeCents: arm === "offer-window" ? 1 : opening }] }
        const posted = await fork.act([post])
        trace.results.push({ post, posted })
        const result = posted[0]
        if (!result?.ok) throw new Error(JSON.stringify(posted))
        const gigId = result.id
        if (arm !== "public") {
          const offers = recipients.map(driver => ({ type: "offer" as const, gigId, driverId: driver.id, feeCents: offered }))
          const answers = await fork.act(offers)
          trace.results.push({ offers, answers })
          if (answers.some(answer => !answer.ok)) throw new Error(JSON.stringify(answers))
        }
        const first = await fork.advance({ to: now + 10 })
        trace.events.push(...first.events)
        if (arm === "offer-window") {
          const gig = (await fork.snapshot()).gigs.find(gig => gig.id === gigId)
          if (gig?.status === "open") trace.results.push({ restored: await fork.act([{ type: "reprice", gigId, schedule: [{ at: now + 10, feeCents: opening }] }]) })
        }
        trace.events.push(...(await fork.advance({ to: now + 30 })).events)
        trace.snapshot = (await fork.snapshot()).gigs.find(gig => gig.id === gigId)
      } finally {
        save()
        await fork.delete()
        trace.deleted = true
        save()
      }
    }
    console.log(JSON.stringify({ requestId: order.id, completedCases: report.cases.length }))
  }
} finally {
  save()
  await base.delete()
  report.baseDeleted = true
  save()
}
console.log(JSON.stringify({ cases: report.cases.length, baseDeleted: report.baseDeleted, file }))

function eligible(request: PriceRequest): boolean {
  const leg = request.legs[0]!
  return request.legs.length === 1 && !leg.pickup.privateAddress && !leg.delivery.privateAddress && desk.noteRules(request).safe && request.options.some(option => option.kind === "same_day") && leg.pickup.window.from <= request.respondBy + 60 && desk.network.km(leg.pickup.placeId, leg.delivery.placeId) <= 300 && desk.supply(request) >= 20
}
