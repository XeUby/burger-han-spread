import { readFile, writeFile } from 'node:fs/promises'
import { Client } from '../../vendor/typescript/spread.ts'

const name = 'bundle-payment-ablation-v1'
const result = JSON.parse(await readFile(`docs/${name}-runs.json`, 'utf8'))
const client = new Client()
const inventory = await client.worlds()
const rows = []
for (const row of result.cases.filter((c: any) => c.status === 'failed' && c.worldId)) {
  const official = inventory.find(w => w.worldId === row.worldId)
  if (!official || official.kind !== 'practice' || official.season !== null || official.boardRun !== null) throw new Error('Administrative closure is restricted to this study’s failed unranked worlds')
  if (official.ended) throw new Error('World already ended; inspect the existing closure before repeating')
  const world = client.world(row.worldId)
  const snapshot = await world.snapshot()
  const score = await world.score()
  await writeFile(`runs/${row.worldId}.interruption-snapshot.json`, JSON.stringify(snapshot))
  await writeFile(`runs/${row.worldId}.interruption-score.json`, JSON.stringify(score))
  rows.push({ worldId: row.worldId, trial: row.trial, error: row.error, interruptedAt: snapshot.now, endsAt: snapshot.endsAt, partialScore: score })
}
await writeFile(`docs/${name}-interruption.json`, JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Four policy runs failed on HTTP502. Before-state retained. Administrative closure performs no more dispatch and is not a completed-policy score or replacement attempt.', rows }, null, 2) + '\n')
for (const row of rows) {
  const world = client.world(row.worldId)
  const advanced = await world.advance({ to: row.endsAt, actions: [] })
  const snapshot = await world.snapshot(), score = await world.score()
  await writeFile(`runs/${row.worldId}.administrative-events.json`, JSON.stringify(advanced.events))
  await writeFile(`runs/${row.worldId}.administrative-snapshot.json`, JSON.stringify(snapshot))
  await writeFile(`runs/${row.worldId}.administrative-score.json`, JSON.stringify(score))
  Object.assign(row, { administrativeScore: score, administrativeFinishedAt: snapshot.now })
  await writeFile(`docs/${name}-interruption.json`, JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Policy failures remain failures. End scores below include abandonment after HTTP502 and must not be used as full-policy evaluation.', rows }, null, 2) + '\n')
}
console.log(JSON.stringify({ closed: rows.map(r => r.worldId), unfinishedTeam: (await client.worlds()).filter(w => !w.ended) }))
