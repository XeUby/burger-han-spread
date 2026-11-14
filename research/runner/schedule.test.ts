import test from 'node:test'
import assert from 'node:assert/strict'
import { schedule } from './schedule.ts'
import type { Host, Inventory, Plan, Trial } from './schedule.ts'
import { deadlineFetch } from './deadline.ts'
import { setTimeout as sleep } from 'node:timers/promises'

function plan(mode: Plan['mode'] = 'ranked'): Plan {
  return { mode, season: mode === 'ranked' ? 6 : undefined, workers: 8, capacity: 8, createUntil: 10000, mutateUntil: 20000,
    trials: Array.from({ length: 3 }, (_, run) => [8, 7, 6].map(level => ({ id: `${level}-${run + 1}`, level, settings: {}, ...(mode === 'ranked' ? { run: run + 1 } : { seed: `s${run}` }) }))).flat() }
}
class FakeServer implements Host {
  tick = 0
  inventory: Inventory[] = []
  journal: any[] = []
  held = false
  lockedElsewhere = false
  lostCreateResponse = false
  finishes: { at: number; world: Inventory; done: () => void }[] = []
  peak = 0
  onWait?: () => void
  now = () => this.tick
  worlds = async () => structuredClone(this.inventory)
  season = async () => 6
  record = (event: object) => { this.journal.push(structuredClone(event)) }
  acquire = async () => {
    assert(!this.held)
    if (this.lockedElsewhere) return undefined
    this.held = true
    return async () => { assert(this.held); this.held = false }
  }
  create = async (trial: Trial, mode: Plan['mode']) => {
    assert(this.held, 'creation must happen under the shared lock')
    const open = this.inventory.filter(w => !w.ended)
    assert(open.length < 8)
    if (mode === 'ranked') assert(!open.some(w => w.boardRun !== null && w.level === trial.level), 'server refuses a second ranked world at one level')
    const world = { worldId: `w${this.inventory.length}`, kind: 'practice', level: trial.level, season: mode === 'ranked' ? 6 : null, boardRun: mode === 'ranked' ? trial.run! : null, ended: false }
    this.inventory.push(world)
    this.peak = Math.max(this.peak, open.length + 1)
    if (this.lostCreateResponse) throw new Error('Response timed out after server committed creation')
    return world.worldId
  }
  play = async (_trial: Trial, id: string) => {
    const world = this.inventory.find(w => w.worldId === id)!
    await new Promise<void>(done => this.finishes.push({ at: this.tick + 5, world, done }))
    return { marginCents: -100, qualified: false }
  }
  wait = async () => {
    this.tick++
    this.onWait?.()
    for (const finish of this.finishes.filter(f => f.at <= this.tick)) { finish.world.ended = true; finish.done() }
    this.finishes = this.finishes.filter(f => f.at > this.tick)
    await new Promise<void>(resolve => setImmediate(resolve))
  }
}

test('actual scheduling path runs across levels and never concurrently within a ranked level', async () => {
  const host = new FakeServer(), result = await schedule(plan(), host)
  assert(result.cases.every(c => c.status === 'completed'))
  assert(host.peak > 1 && host.peak <= 3)
  assert.equal(result.cases.length, 9)
  assert(result.cases.every(c => (c.score as any).qualified === false))
  assert.equal(host.journal.filter(e => e.event === 'created').length, 9)
  assert.equal(host.journal.filter(e => e.event === 'completed').length, 9)
})

test('shared practice occupancy and a pre-existing ranked world block creation until they end', async () => {
  const host = new FakeServer(), p = plan()
  host.inventory = Array.from({ length: 8 }, (_, i) => ({ worldId: `external${i}`, kind: 'practice', level: 8, season: i === 0 ? 6 : null, boardRun: i === 0 ? 1 : null, ended: false }))
  p.trials = [{ id: '8-2', level: 8, run: 2, settings: {} }, { id: '7-1', level: 7, run: 1, settings: {} }]
  host.onWait = () => {
    if (host.tick === 2) host.inventory[1]!.ended = true
    if (host.tick === 4) host.inventory[0]!.ended = true
  }
  const result = await schedule(p, host)
  assert(result.cases.every(c => c.status === 'completed'))
  const created = host.journal.filter(e => e.event === 'created')
  assert.equal(created[0].case.trial.level, 7)
  assert(created[1].at >= 4)
  assert(host.peak <= 8)
})

test('cancelling workers waiting on another runner lock accounts for every planned case', async () => {
  const host = new FakeServer(), cancel = new AbortController()
  host.lockedElsewhere = true
  host.onWait = () => { if (host.tick === 2) cancel.abort() }
  const result = await schedule(plan(), host, cancel.signal)
  assert.equal(host.inventory.length, 0)
  assert.equal(result.cases.length, 9)
  assert(result.cases.every(c => c.status === 'not_started'))
  assert.equal(host.journal.filter(e => e.event === 'not_started').length, 9)
})

test('creation cutoff does not dequeue or lose waiting cases', async () => {
  const host = new FakeServer(), p = plan()
  host.lockedElsewhere = true; p.createUntil = 2
  const result = await schedule(p, host)
  assert(result.cases.every(c => c.status === 'not_started'))
  assert.equal(host.inventory.length, 0)
})

test('uncertain creation is retained and never retried or silently replaced', async () => {
  const host = new FakeServer()
  host.lostCreateResponse = true
  const result = await schedule(plan('practice'), host)
  assert.equal(result.cases[0]!.status, 'creation_unknown')
  assert(result.cases.slice(1).every(c => c.status === 'not_started'))
  assert.equal(host.inventory.length, 1)
  assert.equal(host.inventory[0]!.ended, false)
})

test('journal failure prevents further creation', async () => {
  const host = new FakeServer()
  host.record = () => { throw new Error('Disk full') }
  const result = await schedule(plan(), host)
  assert(result.journalError?.includes('Disk full'))
  assert.equal(host.inventory.length, 0)
  assert(result.cases.every(c => c.status === 'not_started'))
})

test('transport guard blocks late mutations including Request objects but permits reads', async () => {
  const requests: string[] = []
  const fetcher: typeof fetch = async (input, init) => { requests.push(init?.method ?? (input instanceof Request ? input.method : 'GET')); return new Response('{}') }
  const guarded = deadlineFetch(fetcher, 100, () => 100)
  await assert.rejects(guarded('http://fake/worlds', { method: 'POST' }), /deadline/)
  await assert.rejects(guarded(new Request('http://fake/worlds', { method: 'DELETE' })), /deadline/)
  await guarded('http://fake/worlds')
  assert.deepEqual(requests, ['GET'])
})

test('transport aborts an in-flight mutation at its deadline without claiming rollback', async () => {
  let entered = false
  const fetcher: typeof fetch = async (_input, init) => {
    entered = true
    return new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
  }
  const guarded = deadlineFetch(fetcher, Date.now() + 20)
  const keepAlive = sleep(60)
  await assert.rejects(guarded('http://fake/worlds', { method: 'POST' }), /aborted/)
  assert(entered)
  await keepAlive
})

test('cancelling creation lets an already running world finish and preserves all waiting cases', async () => {
  const host = new FakeServer(), cancel = new AbortController()
  host.play = async (_trial, id) => {
    await sleep(10)
    host.inventory.find(w => w.worldId === id)!.ended = true
    return { marginCents: -99, qualified: false }
  }
  host.onWait = () => cancel.abort()
  const result = await schedule(plan('practice'), host, cancel.signal)
  assert.equal(result.cases.filter(c => c.status === 'completed').length, 1)
  assert.equal(result.cases.filter(c => c.status === 'not_started').length, 8)
  assert(host.inventory.every(w => w.ended))
})
