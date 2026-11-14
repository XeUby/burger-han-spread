import { readFile, writeFile, appendFile, readdir, mkdir, rmdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Client } from './bundle/vendor/typescript/spread.ts'
import type { Score } from './bundle/vendor/typescript/types.ts'
import { practice } from './bundle/src/run.ts'
import { allowMutation, nextAvailable } from './guard.ts'

const mode = process.argv[2]
if (mode !== 'compatibility' && mode !== 'ranked') throw new Error('Choose compatibility or ranked')
const protocol = JSON.parse(await readFile('experiments/levels-ranking-protocol.json','utf8'))
const source = createHash('sha256')
for (const name of (await readdir('research/ranked-levels/bundle/src')).filter(n=>n.endsWith('.ts')).sort()) source.update(name).update(await readFile(`research/ranked-levels/bundle/src/${name}`))
if (source.digest('hex') !== protocol.revision) throw new Error('Frozen policy hash mismatch')
const ranked = mode === 'ranked'
const deadline = Date.parse(protocol.stopRankedRequestsAt)
const createDeadline = Date.parse(protocol.stopNewRankedAt)
if (ranked) {
  const check = JSON.parse(await readFile('docs/levels-compatibility.json','utf8'))
  if (check.results.length !== 7 || check.results.some((r:any)=>!r.score?.ranked || r.error)) throw new Error('Compatibility gate failed')
  const review = JSON.parse(await readFile('experiments/levels-compatibility-review.json','utf8'))
  const reportHash = createHash('sha256').update(await readFile('docs/levels-compatibility.json')).digest('hex')
  if (!review.approved || review.reportSha256 !== reportHash || review.revision !== protocol.revision) throw new Error('Compatibility review missing or mismatched')
}
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
  if (worlds.some(w=>!w.ended)) throw new Error('Other unfinished team worlds exist; coordinate before starting')
  for (const level of protocol.levels) {
    const board = await client.board(level)
    if (board.current?.season !== protocol.season) throw new Error('Ranking season changed')
  }
  for (let run=1;run<=(ranked?5:1);run++) for (const level of protocol.levels) {
    if (ranked && worlds.some(w=>w.level===level && w.season===protocol.season && w.boardRun===run)) throw new Error('Existing ranked attempt: reconcile before continuing')
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
        const worlds = await client.worlds()
        if (worlds.filter(w=>!w.ended).length<4) {
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
        const score:Score=await practice(client,{worldId,level:task.level,board:ranked,settings:protocol.settings,label:`levels-${mode}-${task.level}-${task.run}`,...(!ranked?{seed:protocol.compatibilitySeed}:{})})
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
