import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const path = 'experiments/level8-estimate-v1.json'
const plan = JSON.parse(await readFile(path, 'utf8'))
const lock = 'runs/team-world-creation.lock'
const owner = JSON.parse(await readFile(`${lock}/owner.json`, 'utf8'))
if (owner.purpose !== 'drain original estimator before user-authorized eight-worker continuation') throw new Error('Drain lock not held')
for (const [file, hash] of Object.entries(plan.files)) {
  if (createHash('sha256').update(await readFile(resolve(plan.bundle, file))).digest('hex') !== hash) throw new Error(`Changed source: ${file}`)
}
const { Client } = await import(pathToFileURL(resolve(plan.bundle, 'vendor/typescript/spread.ts')).href)
const { practice } = await import(pathToFileURL(resolve(plan.bundle, 'src/run.ts')).href)
const client = new Client()
const attempts = (await readFile(plan.attempts, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
const key = (row: any) => `${row.level}:${row.seed}:${row.label}`
const started = new Set(attempts.filter(a => a.event === 'created').map(key))
const remaining = plan.trials.filter((t: any) => !started.has(key(t)))
const log = (row: object) => appendFile(plan.attempts, JSON.stringify({ ...row, at: new Date().toISOString() }) + '\n')
await writeFile(`${lock}/owner.json`, JSON.stringify({ ...owner, pid: process.pid, plan: path, remaining: remaining.map(key) }))
await writeFile('experiments/level8-estimate-v1-concurrency-amendment.json', JSON.stringify({ at: new Date().toISOString(), instruction: 'submit more worlds and get it done faster without doing anything else yet', maximumUnfinishedTeamWorlds: 8, originalWorkersBlockedBySharedLock: true, remaining: remaining.map(key), policyAndSeedsUnchanged: true, note: 'The shared creation lock stays held until the original workers drain and are stopped; this controller creates sequentially within that lock. All outcomes append to the original inventory.' }, null, 2) + '\n')
const jobs: Promise<void>[] = []
let stopped = false
for (const trial of remaining) {
  if (stopped) break
  const unfinished = (await client.worlds()).filter((w: any) => !w.ended)
  await log({ event: 'occupancy', unfinished: unfinished.map((w: any) => w.worldId), controller: 'continuation' })
  if (unfinished.length >= 8) throw new Error('Team capacity full; retain unstarted cases')
  await log({ event: 'creating', ...trial, controller: 'continuation' })
  const world = await client.create(trial.level, { seed: trial.seed })
  await log({ event: 'created', ...trial, worldId: world.id, controller: 'continuation' })
  jobs.push((async () => {
    try {
      const score = await practice(client, { ...trial, worldId: world.id })
      await log({ event: 'completed', ...trial, worldId: world.id, score })
    } catch (error) {
      stopped = true
      process.exitCode = 1
      await log({ event: 'failed', ...trial, worldId: world.id, error: String(error) })
    }
  })())
}
await Promise.all(jobs)
console.log('Continuation finished; original case ledger retains all results.')
