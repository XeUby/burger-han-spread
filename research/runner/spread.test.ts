import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '../../vendor/typescript/spread.ts'
import { schedule } from './schedule.ts'
import type { Inventory, Plan } from './schedule.ts'
import { spreadHost } from './spread.ts'
import { deadlineFetch } from './deadline.ts'

test('live Spread adapter and transport enforce ranked serialization against a fake HTTP server', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spread-runner-'))
  const nativeFetch = globalThis.fetch
  const worlds: Inventory[] = [], records: any[] = []
  let peak = 0
  const server: typeof fetch = async (input, init) => {
    const url = new URL(String(input)), method = init?.method ?? 'GET'
    let result: unknown
    if (url.pathname === '/v1/worlds' && method === 'GET') result = worlds
    else if (url.pathname === '/v1/leaderboards/practice') result = { current: { season: 6 } }
    else if (url.pathname === '/v1/worlds' && method === 'POST') {
      const body = JSON.parse(String(init?.body))
      assert.equal(body.board, true)
      assert(!worlds.some(w => w.level === body.level && !w.ended), 'HTTP409 condition must never occur')
      const world: Inventory = { worldId: `world${worlds.length}`, kind: 'practice', level: body.level, season: 6, boardRun: worlds.filter(w => w.level === body.level).length + 1, ended: false }
      worlds.push(world); result = { worldId: world.worldId }
      peak = Math.max(peak, worlds.filter(w => !w.ended).length)
    } else if (url.pathname.endsWith('/advance')) {
      await new Promise(resolve => setTimeout(resolve, 15))
      const world = worlds.find(w => url.pathname.includes(w.worldId))!
      world.ended = true
      result = { now: 100, events: [], results: [], more: false }
    } else throw new Error(`Unexpected fake endpoint: ${method} ${url.pathname}`)
    return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } })
  }
  const plan: Plan = { mode: 'ranked', season: 6, workers: 8, capacity: 8, createUntil: Date.now() + 10000, mutateUntil: Date.now() + 20000, trials: [1, 2].flatMap(run => [8, 7].map(level => ({ id: `${level}-${run}`, level, run, settings: {} }))) }
  globalThis.fetch = deadlineFetch(server, plan.mutateUntil)
  try {
    const client = new Client({ url: 'http://fake-spread', key: 'fake-test-key' })
    const host = spreadHost(client, async (c, options) => { await c.world(options.worldId).advance({ to: 100 }); return { marginCents: -123 } }, plan, join(root, 'shared.lock'), event => records.push(structuredClone(event)))
    host.wait = () => new Promise(resolve => setTimeout(resolve, 1))
    const result = await schedule(plan, host)
    assert(result.cases.every(row => row.status === 'completed'))
    assert.equal(worlds.length, 4)
    assert.equal(peak, 2)
    assert.equal(records.filter(e => e.event === 'created').length, 4)
    assert(result.cases.every(row => (row.score as any).marginCents === -123))
  } finally { globalThis.fetch = nativeFetch; await rm(root, { recursive: true }) }
})
