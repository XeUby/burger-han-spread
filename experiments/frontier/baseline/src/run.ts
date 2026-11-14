import { parseArgs } from "node:util"
import { mkdir, writeFile, appendFile, readFile, readdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"
import { Client, SpreadError, Unreachable } from "../vendor/typescript/spread.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { DeskEventKind, Score } from "../vendor/typescript/types.ts"
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
  const [map, drivers, snapshot, history] = await Promise.all([client.map(), world.roster(), world.snapshot(), world.events()])
  const desk = new Dispatcher(world, level, snapshot.now, map, drivers, options.settings)
  await desk.rejoin(snapshot, history)
  const events = [...history]
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
      const day = Math.floor(desk.now / 1440)
      await desk.tick()
      const actions = desk.outbox.splice(0)
      const step = await world.advance({ untilEvent: WAKE, max: Math.min(snapshot.endsAt, desk.now + 30), actions })
      desk.readResults(actions, step.results)
      desk.now = step.now
      for (const event of step.events) {
        if (event.seq <= desk.lastSeq) continue
        events.push(event)
        await desk.handle(event)
      }
      if (Math.floor(desk.now / 1440) > day) report(world.id, await world.score())
    }
  } catch (error) {
    console.error(`World ${world.id} retained. Resume with --world ${world.id}; the practice clock is paused.`)
    throw error
  } finally {
    await writeFile(`runs/${world.id}.events.json`, JSON.stringify(events))
    await writeFile(`runs/${world.id}.errors.json`, JSON.stringify(desk.failures, null, 2))
  }
  const score = await world.score()
  await writeFile(`runs/${world.id}.score.json`, JSON.stringify(score, null, 2))
  await writeFile(`runs/${world.id}.snapshot.json`, JSON.stringify(await world.snapshot()))
  if (!options.board) await writeFile(`runs/${world.id}.reveal.json`, JSON.stringify(await world.reveal()))
  await appendFile("runs/results.jsonl", JSON.stringify({ worldId: world.id, seed: options.seed, label: options.label, settings: desk.settings, revision, ...score }) + "\n")
  report("End " + world.id, score)
  return score
}

async function createPractice(client: Client, level: number, options: { board?: boolean; seed?: string }): Promise<World> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.create(level as 8, options.board ? { board: true } : { seed: options.seed })
    } catch (error) {
      if (options.board || !(error instanceof SpreadError) || error.status !== 409 || !error.message.includes("practice worlds") || attempt >= 59) throw error
      if (!attempt) console.log(`Waiting for a practice slot: ${options.seed}`)
      await sleep(10000)
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
  console.log(`${label}: €${(score.marginCents / 100).toFixed(2)} margin, ${score.wonOrders} orders, ${(score.onTimeShare * 100).toFixed(1)}% on time, ${score.ranked ? "ranked" : "not ranked"}`)
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
