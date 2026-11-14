import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Dispatcher } from '../../runs/frozen/private-coverage-development-v2/coverage/src/policy.ts'
import { PortfolioSolver } from '../../runs/frozen/private-coverage-development-v2/coverage/src/bridge.ts'

const world = 'wf488bd0523f1119e8cd7'
const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'))
const meta = await read(`runs/${world}.meta.json`)
const events = await read(`runs/${world}.events.json`)
const snapshot = await read(`runs/${world}.interruption-snapshot.json`)
const connection = { act: async () => { throw new Error('Offline replay cannot act on a world') } }
const desk = new Dispatcher(connection as never, 8, events[0].at, await read('docs/map.json'), await read(`runs/${world}.drivers.json`), meta.settings)
for (const event of events) { desk.now = event.at; await desk.handle(event) }
if (desk.now !== snapshot.now || desk.orders.size || desk.telemetry.some(row => row.kind === 'private_randomized')) throw new Error('Unexpected interrupted state')
const frame = desk.buildFrame().input
const attempts = await Promise.all(Array.from({length: 4}, async (_, index) => {
  const started = performance.now()
  const solver = new PortfolioSolver()
  try {
    const result = await solver.solve(frame)
    return { index, coldStartPlusSolveMs: performance.now() - started, result }
  } catch (error) {
    return { index, coldStartPlusSolveMs: performance.now() - started, error: String(error) }
  } finally { solver.close() }
}))
const report = { checkedAt: new Date().toISOString(), worldId: world, scope: 'Four concurrent local solver replays; no world advances, quotes or new worlds.', reconstruction: 'First public request and forecast replayed through the unchanged frozen policy using retained events and roster plus the map. This reconstructs the input; the failed solve did not log its original input.', originalState: { now: snapshot.now, orders: snapshot.orders.length, gigs: snapshot.gigs.length, privateAssignments: 0 }, frameSha256: createHash('sha256').update(JSON.stringify(frame)).digest('hex'), frame, attempts, limitation: 'Successful local replays cannot establish why the historical response exceeded three seconds. The existing response timer includes Python process startup and OR-Tools import, not just CP-SAT search.' }
await writeFile('docs/private-coverage-solver-replay.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ alternatives: frame.alternatives.length, scenarios: frame.weights.length, privateAssignments: 0, attempts: attempts.map(({result, ...row}: any) => ({...row, status: result?.status, solverWallSeconds: result?.wallSeconds})) }))
