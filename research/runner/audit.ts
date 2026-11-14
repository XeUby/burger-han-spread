import { readFile, writeFile } from 'node:fs/promises'
import { Client } from '../../vendor/typescript/spread.ts'

const path = process.argv[2]
if (!path) throw new Error('Supply the frozen manifest')
const plan = JSON.parse(await readFile(path, 'utf8'))
const result = JSON.parse(await readFile(plan.report, 'utf8'))
const attempts = (await readFile(plan.attempts, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
const worlds = await new Client().worlds()
if (result.cases.length !== plan.schedule.trials.length) throw new Error('Planned case lost')
const ids = new Set<string>()
const records = []
for (const trial of plan.schedule.trials) {
  const rows = result.cases.filter((c: any) => c.trial.id === trial.id)
  if (rows.length !== 1 || JSON.stringify(rows[0].trial) !== JSON.stringify(trial)) throw new Error('Case identity changed')
  const row = rows[0]
  if (!row.worldId) { records.push(row); continue }
  if (ids.has(row.worldId)) throw new Error('Duplicate world in inventory')
  ids.add(row.worldId)
  const world = worlds.find(w => w.worldId === row.worldId)
  if (!world || world.level !== trial.level || world.kind !== 'practice' || (plan.schedule.mode === 'practice' ? world.season !== null || world.boardRun !== null : world.season !== plan.schedule.season || world.boardRun !== trial.run)) throw new Error('Official provenance mismatch')
  if (row.status === 'completed' && !world.ended) throw new Error('Completed world still active')
  records.push({ ...row, official: world })
}
const snapshot = { checkedAt: new Date().toISOString(), manifest: path, cases: records, maximumObservedBeforeCreation: Math.max(0, ...attempts.filter(e => e.event === 'occupancy').map(e => e.worlds.length)), unfinishedTeamWorlds: worlds.filter(w => !w.ended), limitation: 'The shared lock serializes cooperating local creators. Server checks cannot guarantee external runners honor the same lock between observations.' }
const output = plan.report.replace(/-runs\.json$/, '-operations.json')
if (output === plan.report) throw new Error('Manifest report must end in -runs.json')
await writeFile(output, JSON.stringify(snapshot, null, 2) + '\n')
console.log(JSON.stringify({ planned: records.length, created: ids.size, completed: records.filter(c => c.status === 'completed').length, unfinished: snapshot.unfinishedTeamWorlds.length, maximumObservedBeforeCreation: snapshot.maximumObservedBeforeCreation }))
