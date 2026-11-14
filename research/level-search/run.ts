import {readFile,writeFile,appendFile,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
const planPath=process.argv[2]!
const plan=JSON.parse(await readFile(planPath,'utf8'))
const bundle=plan.bundle ?? 'research/ranked-levels/bundle'
const hash=createHash('sha256')
for(const name of (await readdir(resolve(bundle,'src'))).filter(n=>n.endsWith('.ts')).sort()) hash.update(name).update(await readFile(resolve(bundle,'src',name)))
if(hash.digest('hex')!==plan.revision) throw new Error('Frozen source hash mismatch')
for(const task of plan.trials) if(!task.seed || 'board' in task || 'worldId' in task) throw new Error('Only new seeded unranked trials allowed')
const {practice}=await import(pathToFileURL(resolve(bundle,'src/run.ts')).href)
const {Client}=await import(pathToFileURL(resolve(bundle,'vendor/typescript/spread.ts')).href)
const jobs=plan.jobs ?? 4
const capacity=plan.maximumConcurrentWorlds ?? 4
if(!Number.isInteger(jobs)||jobs<1||jobs>4||!Number.isInteger(capacity)||capacity<jobs||capacity>4) throw new Error('At most four unfinished team worlds; historical eight-slot plans are no longer authorized')
const client=new Client()
let next=0,stopped=false,gate=Promise.resolve()
const results:any[]=[]
async function create(task:any){
 const previous=gate;let unlock!:()=>void;gate=new Promise(r=>{unlock=r});await previous
 try{
  while(!stopped){
   if((await client.worlds()).filter((w:{ended:boolean})=>!w.ended).length<capacity){
    const world=await client.create(task.level,{seed:task.seed})
    await appendFile(plan.attempts,JSON.stringify({event:'created',...task,worldId:world.id,at:new Date().toISOString()})+'\n');return world
   }
   await new Promise(r=>setTimeout(r,1000))
  }
 }finally{unlock()}
}
await Promise.all(Array.from({length:jobs},async()=>{
 while(!stopped&&next<plan.trials.length){
  const task=plan.trials[next++]
  let worldId:string|undefined
  try{
   const world=await create(task);if(!world)return;worldId=world.id
   const score=await practice(client,{...task,worldId})
   const row={...task,worldId,score,completedAt:new Date().toISOString()};results.push(row)
   await appendFile(plan.attempts,JSON.stringify({event:'completed',...row})+'\n')
  }catch(e){stopped=true;const row={...task,worldId,error:String(e)};results.push(row);await appendFile(plan.attempts,JSON.stringify({event:'failed',...row})+'\n');console.error(row);process.exitCode=1}
 }
}))
await writeFile(plan.report,JSON.stringify({plan:planPath,results,stopped},null,2)+'\n')
