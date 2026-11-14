import { readFile, writeFile } from 'node:fs/promises'
import { appendFileSync, closeSync, openSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Client } from '../../vendor/typescript/spread.ts'
import { schedule, validatePlan } from './schedule.ts'
import type { Plan } from './schedule.ts'
import { spreadHost } from './spread.ts'
import type { Player } from './spread.ts'
import { deadlineFetch } from './deadline.ts'

const path = process.argv[2]
if (!path) throw new Error('Supply a frozen study manifest')
const manifest = JSON.parse(await readFile(path, 'utf8'))
const plan: Plan = manifest.schedule
validatePlan(plan)
if (plan.mode === 'ranked' && (manifest.authorization?.approved !== true || manifest.authorization?.season !== plan.season || !manifest.authorization?.instruction || plan.trials.some(t => !manifest.authorization.levels?.includes(t.level)))) throw new Error('Explicit authorization for this frozen policy and round is required')
if (Date.now() >= plan.createUntil) throw new Error('Frozen creation window expired')
for (const [file, expected] of Object.entries(manifest.files ?? {})) {
  if (createHash('sha256').update(await readFile(file)).digest('hex') !== expected) throw new Error(`Frozen file changed: ${file}`)
}
for (const file of ['research/runner/run.ts', 'research/runner/schedule.ts', 'research/runner/spread.ts', 'research/runner/deadline.ts', 'vendor/typescript/spread.ts']) if (!manifest.files?.[file]) throw new Error(`Missing launcher hash: ${file}`)
const entry = resolve(manifest.bundle, 'src/run.ts')
if (!manifest.files?.[entry] && !manifest.files?.[`${manifest.bundle}/src/run.ts`]) throw new Error('Missing policy entry hash')
if (!manifest.bundleFiles || !Object.keys(manifest.bundleFiles).length) throw new Error('Missing policy file inventory')
for (const [name, expected] of Object.entries(manifest.bundleFiles)) {
  if (manifest.files[`${manifest.bundle}/${name}`] !== expected) throw new Error(`Policy file missing from source freeze: ${name}`)
}
if (manifest.pythonVersions) {
  const installed = JSON.parse(execFileSync(manifest.pythonExecutable, ['-c', "import importlib.metadata,json; print(json.dumps({d.metadata['Name'].lower():d.version for d in importlib.metadata.distributions()}))"], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin' } }))
  for (const [name, version] of Object.entries(manifest.pythonVersions)) if (installed[name] !== version) throw new Error(`Dependency changed: ${name}`)
}
const { practice } = await import(pathToFileURL(entry).href) as { practice: Player }
const client = new Client()
closeSync(openSync(manifest.attempts, 'wx'))
const cancel = new AbortController()
const stopCreating = () => cancel.abort()
process.on('SIGINT', stopCreating)
process.on('SIGTERM', stopCreating)
const nativeFetch = globalThis.fetch
const bounded = deadlineFetch(nativeFetch, plan.mutateUntil)
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (method !== 'GET' && (method === 'DELETE' || url.pathname.includes('/final') || url.pathname.endsWith('/fork'))) throw new Error('Study scope excludes deletion, finals and forks')
  if (method === 'POST' && url.pathname === '/v1/worlds' && (cancel.signal.aborted || Date.now() >= plan.createUntil)) throw new Error('World creation closed')
  return bounded(input, init)
}
try {
  const host = spreadHost(client, practice, plan, 'runs/team-world-creation.lock', event => appendFileSync(manifest.attempts, JSON.stringify(event) + '\n'))
  const result = await schedule(plan, host, cancel.signal)
  const unfinished = (await client.worlds()).filter(w => !w.ended)
  await writeFile(manifest.report, JSON.stringify({ manifest: path, ...result, unfinished }, null, 2) + '\n')
  if (result.cases.some(row => row.status !== 'completed') || result.journalError) process.exitCode = 1
} finally {
  globalThis.fetch = nativeFetch
  process.removeListener('SIGINT', stopCreating)
  process.removeListener('SIGTERM', stopCreating)
}
