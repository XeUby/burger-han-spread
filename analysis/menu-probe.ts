import { writeFile, mkdir } from "node:fs/promises"
import { parseArgs } from "node:util"
import { Client } from "../vendor/typescript/spread.ts"
import type { DeliveryOption, PriceRequest, QuoteAction } from "../vendor/typescript/types.ts"

const { values } = parseArgs({ options: { seed: { type: "string", default: "mechanics-menu-01" }, count: { type: "string", default: "6" } } })
const seed = values.seed!
const count = Number(values.count)
if (!Number.isInteger(count) || count < 1 || count > 30) throw new Error("count must be 1–30")
const client = new Client()
const base = await client.create(8, { seed })
const report: { seed: string; base: string; rows: unknown[] } = { seed, base: base.id, rows: [] }
await mkdir("runs", { recursive: true })
const save = () => writeFile(`runs/menu-probe-${seed}.json`, JSON.stringify(report, null, 2))
console.log(`Probe base ${base.id}, seed ${seed}`)
let now = 0
try {
  while (report.rows.length < count && now < 1080) {
    const step = await base.advance({ untilEvent: ["price_request"], max: 1080 })
    now = step.now
    const event = step.events.find(event => event.kind === "price_request" && event.request.options.length > 1 && event.request.legs.length === 1)
    if (!event || event.kind !== "price_request") continue
    const request = event.request
    const probes: { prices: QuoteAction["prices"]; outcome: string; option?: string; priceCents?: number }[] = []
    async function probe(prices: QuoteAction["prices"]): Promise<string | undefined> {
      const fork = await base.fork()
      try {
        const result = await fork.advance({ to: request.respondBy + 1, actions: [{ type: "quote", requestId: request.id, prices }] })
        if (result.results.some(result => !result.ok)) throw new Error(JSON.stringify(result.results))
        const won = result.events.find(event => event.kind === "order_won" && event.order.id === request.id)
        const option = won?.kind === "order_won" ? won.order.option : undefined
        probes.push({ prices, outcome: option ? "won" : "lost", ...(option ? { option, priceCents: won!.kind === "order_won" ? won!.order.priceCents : undefined } : {}) })
        return option
      } finally {
        await fork.delete()
      }
    }
    const prices = (options: DeliveryOption[], ratio: number) => Object.fromEntries(options.map(option => [option.kind, Math.round(option.listPriceCents * ratio)]))
    const thresholds: Record<string, { win: number; lose: number }> = {}
    for (const option of request.options) {
      let low = 0.6, high = 2.6
      for (let i = 0; i < 6; i++) {
        const middle = (low + high) / 2
        if (await probe(prices([option], middle))) low = middle
        else high = middle
      }
      thresholds[option.kind] = { win: low, lose: high }
    }
    const maximum = Math.max(...Object.values(thresholds).map(value => value.win))
    const minimum = Math.min(...Object.values(thresholds).map(value => value.win))
    await probe(prices(request.options, minimum))
    await probe(prices(request.options, maximum))
    await probe(prices(request.options, maximum + 0.04))
    for (const option of request.options) {
      const menu = prices(request.options, 100)
      menu[option.kind] = Math.round(option.listPriceCents * (thresholds[option.kind]!.win - 0.01))
      await probe(menu)
    }
    report.rows.push({ request, thresholds, probes })
    await save()
    console.log(JSON.stringify({ request: request.id, thresholds, menu: probes.slice(-3 - request.options.length) }))
    const onward = await base.advance({ to: request.respondBy + 1 })
    now = onward.now
  }
} finally {
  await save()
  await base.delete()
}
console.log(`Completed ${report.rows.length} request response surfaces`)
