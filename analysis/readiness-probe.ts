import fs from "node:fs/promises"
import { Client, SpreadError } from "../vendor/typescript/spread.ts"
import { readReadiness } from "../src/readiness.ts"
import type { Action, DeskEvent, Order, PriceRequest } from "../vendor/typescript/types.ts"

const seed = "formal-unseen-20261113-16"
const targets = new Set(["R00059", "R00289", "R00307"])
const client = new Client({ url: process.env.SPREAD_URL ?? "https://spread.bahnexpress.com" })
const deadline = Date.now() + 10 * 60_000
let attempts = 0
const world = await (async () => {
  for (;;) {
    try { return await client.create(8, { seed }) } catch (error) {
      if (!(error instanceof SpreadError) || error.status !== 409 || Date.now() >= deadline) throw error
      if (!attempts++) console.log("Waiting for one free ordinary practice slot")
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }
})()
const snapshot = await world.snapshot()
console.log(JSON.stringify({ purpose: "readiness deadline mechanism probe, not policy profitability", worldId: world.id, seed }))
const events: DeskEvent[] = []
const requests = new Map<string, PriceRequest>()
const orders = new Map<string, Order>()
const failures: unknown[] = []
let actions: Action[] = []
let now = snapshot.now
while (now < snapshot.endsAt && orders.size < targets.size) {
  const step = await world.advance({ untilEvent: ["price_request", "order_won", "order_lost"], max: snapshot.endsAt, actions })
  failures.push(...step.results.filter(result => !result.ok))
  actions = []
  now = step.now
  events.push(...step.events)
  for (const event of step.events) {
    if (event.kind === "price_request" && targets.has(event.request.id)) {
      const request = event.request
      const parsed = readReadiness(request.note, request.arrivedAt)
      if (!parsed || !request.options.some(option => option.kind === "same_day")) throw new Error(`Probe target changed: ${request.id}`)
      requests.set(request.id, request)
      actions.push({ type: "quote", requestId: request.id, prices: { same_day: 100 } })
    }
    if (event.kind === "order_won" && targets.has(event.order.id)) orders.set(event.order.id, event.order)
  }
}
if (now < snapshot.endsAt) events.push(...(await world.advance({ to: snapshot.endsAt })).events)
const reveal = await world.reveal()
const cases = [...requests.values()].map(request => {
  const parsed = readReadiness(request.note, request.arrivedAt)!
  const order = orders.get(request.id)
  const truth = reveal.orders.find(order => order.orderId === request.id)?.legs[0]
  const quoted = request.options.find(option => option.kind === "same_day")!
  return { requestId: request.id, text: request.note!.text, arrivedAt: request.arrivedAt, statedReadyAt: request.legs[0]!.pickup.window.from, parsedReadyAt: parsed.readyAt, actualReadyAt: truth?.readyAt, quotedDeadline: quoted.deadline, wonDeadline: order?.deadline, observedExtension: order ? order.deadline - quoted.deadline : null, readyDelay: parsed.readyAt - request.legs[0]!.pickup.window.from, calendarDays: Math.floor(parsed.readyAt / 1440) - Math.floor(request.legs[0]!.pickup.window.from / 1440), elapsedDays: Math.floor((parsed.readyAt - request.legs[0]!.pickup.window.from) / 1440), truth }
})
const report = { purpose: "Mechanism probe only: three one-euro quotes and deliberately no dispatch. Score is not a candidate performance result.", worldId: world.id, seed, failures, cases }
await fs.writeFile(`runs/${world.id}.readiness-mechanism.json`, JSON.stringify(report, null, 2))
await fs.writeFile(`runs/${world.id}.readiness-events.json`, JSON.stringify(events))
await fs.writeFile(`runs/${world.id}.readiness-reveal.json`, JSON.stringify(reveal))
console.log(JSON.stringify(report, null, 2))
