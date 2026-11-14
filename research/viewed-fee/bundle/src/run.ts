import { parseArgs } from "node:util"
import { mkdir, writeFile, appendFile, readFile, readdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"
import { Client, SpreadError, Unreachable } from "../vendor/typescript/spread.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { Action, ActionResult, Advance, DeskEvent, DeskEventKind, DeskSnapshot, DriverProfile, Score, WorldMap } from "../vendor/typescript/types.ts"
import { Dispatcher, validateSettings } from "./policy.ts"
import type { Settings } from "./policy.ts"

const WAKE: DeskEventKind[] = ["price_request", "order_won", "order_lost", "order_changed", "order_cancelled", "visit_failed", "gig_expired", "deadline_close", "gig_dropped", "no_show", "delivered"]
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function practice(client: Client, options: { level?: number; seed?: string; worldId?: string; board?: boolean; settings?: Partial<Settings>; label?: string } = {}): Promise<Score> {
  validateSettings(options.settings ?? {})
  const level = options.level ?? 8
  const world = options.worldId ? client.world(options.worldId) : await createPractice(client, level, options)
  console.log(`Practice ${world.id}, level ${level}, seed ${options.seed ?? "server-selected"}`)
  await mkdir("runs", { recursive: true })
  const [map, drivers, snapshot, history] = await retryReads(() => Promise.all([client.map(), world.roster(), world.snapshot(), world.events()]))
  let desk: Dispatcher
  const submitted = new Map<string, SubmittedBid>()
  const connection = trackPractice(world, () => desk, submitted)
  desk = new Dispatcher(connection, level, snapshot.now, map, drivers, options.settings)
  const events: DeskEvent[] = []
  const recorded = new Set<number>()
  const record = (event: DeskEvent) => {
    if (recorded.has(event.seq)) return
    recorded.add(event.seq)
    events.push(structuredClone(event))
  }
  history.forEach(record)
  await desk.rejoin(snapshot, history)
  let recoveryUntil = 0
  const recoveries: { at: number; message: string; resumedAt: number; lastSeq: number }[] = []
  const hash = createHash("sha256")
  const sourceFiles = (await readdir(new URL(".", import.meta.url))).filter(file => file.endsWith(".ts")).sort()
  const sources = await Promise.all(sourceFiles.map(async name => ({ name, text: await readFile(new URL(name, import.meta.url), "utf8") })))
  for (const file of sources) hash.update(file.name).update(file.text)
  const revision = hash.digest("hex")
  await mkdir(`runs/sources/${revision}`, { recursive: true })
  await Promise.all(sources.map(file => writeFile(`runs/sources/${revision}/${file.name}`, file.text)))
  await writeFile(`runs/${world.id}.meta.json`, JSON.stringify({ worldId: world.id, level, seed: options.seed, label: options.label, settings: desk.settings, revision }, null, 2))
  await writeFile(`runs/${world.id}.drivers.json`, JSON.stringify(drivers))
  try {
    while (desk.now < snapshot.endsAt) {
      try {
        const day = Math.floor(desk.now / 1440)
        await desk.tick()
        const actions = desk.takeActions()
        const step = await connection.advance({ untilEvent: WAKE, max: Math.min(snapshot.endsAt, desk.nextDecisionAt()), actions })
        desk.readResults(actions, step.results)
        desk.now = step.now
        for (const event of step.events) {
          record(event)
          if (event.seq <= desk.lastSeq) continue
          await desk.handle(event)
          if (event.kind === "order_won") submitted.delete(event.order.id)
          if (event.kind === "order_lost") submitted.delete(event.requestId)
        }
        if (Math.floor(desk.now / 1440) > day) report(world.id, await world.score())
        recoveryUntil = 0
      } catch (error) {
        if (!(error instanceof Unreachable) || desk.settings.viewedFee) throw error
        const at = desk.now
        if (!recoveryUntil) recoveryUntil = Date.now() + 60_000
        else await sleep(Math.max(0, Math.min(1000, recoveryUntil - Date.now())))
        console.error(`${world.id}: ${error.message}; recovering from server state for up to 60 seconds`)
        const state = await retryReads(async () => {
          const history = await world.events()
          const snapshot = await world.snapshot()
          return { history, snapshot }
        }, recoveryUntil)
        state.history.forEach(record)
        desk = await rebuildPractice(desk, connection, map, drivers, state.snapshot, state.history, submitted)
        recoveries.push({ at, message: error.message, resumedAt: desk.now, lastSeq: desk.lastSeq })
      }
    }
  } catch (error) {
    console.error(`World ${world.id} retained. Resume with --world ${world.id}; the practice clock is paused.`)
    throw error
  } finally {
    await writeFile(`runs/${world.id}.viewed-fee.json`, JSON.stringify({ reservedCents: desk.reservedCents, exposures: desk.exposures }, null, 2))
    await writeFile(`runs/${world.id}.events.json`, JSON.stringify(events.sort((a, b) => a.seq - b.seq)))
    await writeFile(`runs/${world.id}.errors.json`, JSON.stringify(desk.failures, null, 2))
    await writeFile(`runs/${world.id}.recoveries.json`, JSON.stringify(recoveries, null, 2))
  }
  const score = await retryReads(() => world.score())
  await writeFile(`runs/${world.id}.score.json`, JSON.stringify(score, null, 2))
  await writeFile(`runs/${world.id}.snapshot.json`, JSON.stringify(await retryReads(() => world.snapshot())))
  if (!options.board) await writeFile(`runs/${world.id}.reveal.json`, JSON.stringify(await retryReads(() => world.reveal())))
  await appendFile("runs/results.jsonl", JSON.stringify({ worldId: world.id, seed: options.seed, label: options.label, settings: desk.settings, revision, ...score }) + "\n")
  report("End " + world.id, score)
  return score
}

type SubmittedBid = { bid: NonNullable<ReturnType<Dispatcher["bids"]["get"]>>; prices: Record<string, number>; confirmed: boolean }

function trackPractice(world: World, desk: () => Dispatcher, submitted: Map<string, SubmittedBid>): World {
  const sent = (actions: readonly Action[]) => {
    for (const action of actions) if (action.type === "quote") {
      const bid = desk().bids.get(action.requestId)
      if (bid && Object.values(action.prices).some(price => price! < 100_000_000)) submitted.set(action.requestId, { bid, prices: action.prices as Record<string, number>, confirmed: false })
      else submitted.delete(action.requestId)
    }
  }
  const answered = (actions: readonly Action[], results: ActionResult[]) => {
    actions.forEach((action, i) => {
      if (action.type !== "quote") return
      const bid = submitted.get(action.requestId)
      if (results[i]?.ok && bid) bid.confirmed = true
      else submitted.delete(action.requestId)
    })
  }
  return new Proxy(world, { get(target, key) {
    if (key === "act") return async (actions: readonly Action[]) => {
      sent(actions)
      const results = await target.act(actions)
      answered(actions, results)
      return results
    }
    if (key === "advance") return async (input: Advance) => {
      const actions = input.actions ?? []
      sent(actions)
      const step = await target.advance(input)
      answered(actions, step.results)
      return step
    }
    const value = Reflect.get(target, key, target)
    return typeof value === "function" ? value.bind(target) : value
  } })
}

async function rebuildPractice(previous: Dispatcher, world: World, map: WorldMap, drivers: DriverProfile[], snapshot: DeskSnapshot, history: DeskEvent[], submitted: Map<string, SubmittedBid>): Promise<Dispatcher> {
  for (const event of history) {
    if (event.kind !== "order_won" && event.kind !== "order_lost") continue
    const id = event.kind === "order_won" ? event.order.id : event.requestId
    const quote = submitted.get(id)
    if (!quote) continue
    const won = event.kind === "order_won"
    const proven = event.kind === "order_won" && quote.prices[event.order.option] === event.order.priceCents
    // A lost response cannot tell us whether an unacknowledged quote was ever submitted.
    if (previous.bids.has(id) && (quote.confirmed || proven)) previous.market.observe(quote.bid.features, quote.bid.ratio, won)
    previous.bids.delete(id)
    submitted.delete(id)
  }
  const desk = new Dispatcher(world, previous.level, snapshot.now, map, drivers, previous.settings)
  desk.market = previous.market
  desk.failures.push(...previous.failures)
  await desk.rejoin(snapshot, history)
  for (const [key, count] of previous.offerCount) desk.offerCount.set(key, Math.max(count, desk.offerCount.get(key) ?? 0))
  for (const [gig, offers] of previous.offers) desk.offers.set(gig, offers.filter(offer => offer.until > snapshot.now))
  for (const [gig, drivers] of previous.offeredDrivers) desk.offeredDrivers.set(gig, new Set([...(desk.offeredDrivers.get(gig) ?? []), ...drivers]))
  for (const [gig, count] of previous.homeOffersSent) desk.homeOffersSent.set(gig, Math.max(count, desk.homeOffersSent.get(gig) ?? 0))
  for (const [gig, at] of previous.lastOffer) desk.lastOffer.set(gig, at)
  for (const [gig, at] of previous.raised) desk.raised.set(gig, at)
  for (const orderId of previous.relisted) desk.relisted.add(orderId)
  for (const event of history) {
    if (event.kind === "gig_viewed") desk.viewedAt.set(event.driverId, event.at)
    if (event.kind === "gig_booked") desk.gigDriver.set(event.gigId, event.driverId)
    if (event.kind === "picked_up" || event.kind === "delivered") {
      const driver = desk.gigDriver.get(event.gigId)
      if (driver) desk.driverPlace.set(driver, { place: event.placeId, at: event.at })
    }
  }
  return desk
}

async function retryReads<T>(read: () => Promise<T>, until = Date.now() + 60_000): Promise<T> {
  let delay = 250
  for (;;) {
    const remaining = until - Date.now()
    if (remaining <= 0) throw new Unreachable(0, "Practice recovery exceeded 60 seconds")
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([read(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Unreachable(0, "Practice recovery exceeded 60 seconds")), remaining)
      })])
    } catch (error) {
      if (!(error instanceof Unreachable) || Date.now() >= until) throw error
      await sleep(Math.min(delay, until - Date.now()))
      delay = Math.min(5000, delay * 2)
    } finally {
      clearTimeout(timer)
    }
  }
}

async function createPractice(client: Client, level: number, options: { board?: boolean; seed?: string }): Promise<World> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.create(level as 8, options.board ? { board: true } : { seed: options.seed })
    } catch (error) {
      if (options.board || !(error instanceof SpreadError) || error.status !== 409 || !error.message.includes("practice worlds") || attempt >= 119) throw error
      if (!attempt) console.log(`Waiting for a practice slot: ${options.seed}`)
      await sleep(5000)
    }
  }
}

export async function live(client: Client, settings: Partial<Settings>): Promise<void> {
  validateSettings(settings)
  let world: World | undefined
  let market: Dispatcher["market"] | undefined
  for (;;) {
    try {
      if (!world) {
        const final = await client.final().catch(error => {
          if (error instanceof SpreadError && error.status === 404) return null
          throw error
        })
        const state = final ? await client.world(final.worldId).snapshot() : null
        if (!final || !state || state.now >= state.endsAt) {
          await sleep(5000)
          continue
        }
        world = client.world(final.worldId)
        console.log(`Final ${world.id}; starts ${final.startsAt}`)
      }
      const [map, drivers] = await Promise.all([client.map(), world.roster()])
      const history = await world.events()
      const snapshot = await world.snapshot()
      const desk = new Dispatcher(world, 8, snapshot.now, map, drivers, settings)
      if (market) desk.market = market
      market = desk.market
      await desk.rejoin(snapshot, history)
      let lastClock = 0
      while (desk.now < snapshot.endsAt) {
        const day = Math.floor(desk.now / 1440)
        const events = await world.events(desk.lastSeq)
        if (Date.now() - lastClock > 1000) {
          desk.now = Math.max(desk.now, (await client.final()).now)
          lastClock = Date.now()
        }
        for (const event of events) {
          desk.now = Math.max(desk.now, event.at)
          await desk.handle(event)
        }
        await desk.tick()
        await desk.send()
        if (Math.floor(desk.now / 1440) > day) report(world.id, await world.score())
        await sleep(150)
      }
      report("Final", await world.score())
      return
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error
      console.error(`${error.message}; rebuilding from server state in 5 seconds`)
      await sleep(5000)
    }
  }
}

function report(label: string, score: Score): void {
  console.log(`${label}: €${(score.marginCents / 100).toFixed(2)} margin, ${score.wonOrders} orders, ${(score.onTimeShare * 100).toFixed(1)}% on time, ${score.ranked ? "qualified" : "not qualified"}`)
}

async function main(): Promise<void> {
  const { values: args } = parseArgs({ options: {
    level: { type: "string", default: "8" }, seed: { type: "string", default: "spread-1" }, world: { type: "string" }, board: { type: "boolean" }, final: { type: "boolean" }, config: { type: "string" }, help: { type: "boolean" },
  } })
  if (args.help) {
    console.log("node --env-file=.env src/run.ts [--level 1-8] [--seed TEXT] [--world ID] [--config JSON] [--board | --final]")
    return
  }
  const level = Number(args.level)
  if (!Number.isInteger(level) || level < 1 || level > 8) throw new Error("level must be 1–8")
  if (args.board && args.final) throw new Error("Choose --board or --final")
  const settings = args.config ? JSON.parse(args.config) as Partial<Settings> : {}
  validateSettings(settings)
  const client = new Client({ url: process.env.SPREAD_URL ?? "https://spread.bahnexpress.com" })
  if (args.final) await live(client, settings)
  else await practice(client, { level, seed: args.seed, worldId: args.world, board: args.board, settings })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
}
