import { readFile, writeFile, appendFile, readdir, mkdir, rmdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Client } from '../../runs/frozen/portfolio-development-v1/vendor/typescript/spread.ts'
import type { Score } from '../../runs/frozen/portfolio-development-v1/vendor/typescript/types.ts'
import { practice } from '../../runs/frozen/portfolio-development-v1/src/run.ts'
import { allowMutation, nextAvailable } from './guard.ts'

const mode = 'noon-ranked'
const protocol = JSON.parse(await readFile('experiments/levels-noon-protocol.json','utf8'))
if (protocol.authorization?.approved !== true) throw new Error('The concrete frozen ranking plan still needs explicit user authorization')
if (protocol.maximumUnfinishedTeamWorlds !== 8 || JSON.stringify(protocol.levels) !== '[1,2,3,4]') throw new Error('Only levels 1–4 and eight unfinished team worlds are in scope')
for (const [file, expected] of Object.entries(protocol.sourceFiles)) if (createHash('sha256').update(await readFile(file)).digest('hex') !== expected) throw new Error(`Frozen source changed: ${file}`)
if (createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex') !== protocol.launcherSha256) throw new Error('Frozen ranking launcher changed')
try { await readFile(`experiments/levels-${mode}-attempts.jsonl`); throw new Error('Previous ranking attempts exist; reconcile them before any continuation') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
const source = createHash('sha256')
for (const name of (await readdir('runs/frozen/portfolio-development-v1/src')).filter(n=>n.endsWith('.ts')).sort()) source.update(name).update(await readFile(`runs/frozen/portfolio-development-v1/src/${name}`))
if (source.digest('hex') !== protocol.revision) throw new Error('Frozen policy hash mismatch')
const ranked = true
const deadline = Date.parse(protocol.stopRankedRequestsAt)
const createDeadline = Date.parse(protocol.stopNewRankedAt)
const nativeFetch = globalThis.fetch
const abort = new AbortController()
const timer = ranked ? setTimeout(()=>abort.abort(new Error('Ranked deadline reached')), Math.max(0,deadline-Date.now())) : undefined
timer?.unref()
globalThis.fetch = async (input, init) => {
  const method = init?.method ?? 'GET'
  if (ranked && !allowMutation(Date.now(),deadline,method)) throw new Error('Ranked deadline reached: mutation blocked')
  return nativeFetch(input, ranked && method !== 'GET' ? {...init,signal:AbortSignal.any([abort.signal,...(init?.signal?[init.signal]:[])])} : init)
}
const lock = 'runs/levels-ranking.lock'
await mkdir(lock)
const client = new Client()
const attempts = `experiments/levels-${mode}-attempts.jsonl`
const results: any[] = []
let stopped = false
const active = new Set<number>()
let gate = Promise.resolve()
const log = async (row: object) => appendFile(attempts,JSON.stringify({...row,at:new Date().toISOString()})+'\n')
const queue: {level:number;run:number}[] = []
try {
  const worlds = await client.worlds()
  if (worlds.some(w=>!w.ended && w.boardRun)) throw new Error('An unfinished ranked world exists; reconcile before creating more')
  for (const level of protocol.levels) {
    const board = await client.board(level)
    if (board.current?.season !== protocol.season) throw new Error('Ranking season changed')
  }
  for (let run=1;run<=(ranked?5:1);run++) for (const level of protocol.levels) {
    if (worlds.some(w=>w.level===level && w.season===protocol.season && w.boardRun===run && w.ended)) continue
    queue.push({level,run})
  }
  async function create(task: {level:number;run:number}) {
    const previous = gate
    let unlock!:()=>void
    gate = new Promise(resolve=>{unlock=resolve})
    await previous
    try {
      while (!stopped) {
        if (ranked && Date.now()>=createDeadline) throw new Error('Too close to ranked deadline to start another week')
        const creationLock = 'runs/team-world-creation.lock'
        try { await mkdir(creationLock) } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
          await new Promise(resolve=>setTimeout(resolve,1000))
          continue
        }
        try {
        await writeFile(`${creationLock}/owner.json`,JSON.stringify({pid:process.pid,plan:'experiments/levels-noon-protocol.json',at:new Date().toISOString()}))
        const worlds = await client.worlds()
        await log({event:'occupancy',unfinished:worlds.filter(w=>!w.ended).map(w=>w.worldId)})
        if (worlds.filter(w=>!w.ended).length<8) {
          if (ranked) {
            const board=await client.board(task.level as 1)
            if(board.current?.season!==protocol.season) throw new Error('Ranking season changed')
            if(worlds.some(w=>w.level===task.level && w.season===protocol.season && w.boardRun===task.run)) throw new Error('Another runner already created this ranked attempt')
          }
          await log({event:'creating',mode,...task})
          const world=await client.create(task.level as 1,ranked?{board:true}:{seed:protocol.compatibilitySeed})
          await log({event:'created',mode,...task,worldId:world.id})
          return world
        }
        } finally { await rm(creationLock,{recursive:true}) }
        await new Promise(resolve=>setTimeout(resolve,1000))
      }
      return undefined
    } finally { unlock() }
  }
  await Promise.all(Array.from({length:4},async()=>{
    while(!stopped) {
      const task=nextAvailable(queue,active)
      if(!task) {
        if(!queue.length) return
        await new Promise(resolve=>setTimeout(resolve,100))
        continue
      }
      active.add(task.level)
      let worldId: string | undefined
      try {
        const world=await create(task)
        if(!world) return
        worldId=world.id
        const score:Score=await practice(client,{worldId,level:task.level,board:ranked,settings:protocol.policies[String(task.level)],label:`levels-${mode}-${task.level}-${task.run}`,...(!ranked?{seed:protocol.compatibilitySeed}:{})})
        const errors=JSON.parse(await readFile(`runs/${worldId}.errors.json`,'utf8'))
        const recoveries=JSON.parse(await readFile(`runs/${worldId}.recoveries.json`,'utf8'))
        const result={...task,worldId,score,errors,recoveries,completedAt:new Date().toISOString()}
        results.push(result)
        await log({event:'completed',...result})
      } catch(error) {
        stopped=true
        const result={...task,worldId,error:String(error)}
        results.push(result)
        await log({event:'failed',...result})
        console.error(result)
        process.exitCode=1
      } finally {active.delete(task.level)}
    }
  }))
} finally {
  clearTimeout(timer)
  globalThis.fetch=nativeFetch
  await writeFile(`docs/levels-${mode}.json`,JSON.stringify({mode,revision:protocol.revision,season:protocol.season,finishedAt:new Date().toISOString(),stopped,remaining:queue,results:results.sort((a,b)=>a.level-b.level||a.run-b.run)},null,2)+'\n')
  await rmdir(lock)
}
