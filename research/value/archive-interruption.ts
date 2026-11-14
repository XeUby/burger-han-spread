import { appendFile, readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { Client } from "../../vendor/typescript/spread.ts"

const plan=JSON.parse(await readFile("experiments/value-development-v1.json","utf8"))
const attempts=(await readFile(plan.attempts,"utf8")).trim().split("\n").map(line=>JSON.parse(line))
const starts=attempts.filter(a=>a.event==="created")
const unfinished=starts.filter(a=>!attempts.some(b=>["completed","failed"].includes(b.event)&&b.worldId===a.worldId))
const client=new Client()
const inventory=await client.worlds()
const records=[]
for(const attempt of unfinished) {
  const info=inventory.find(w=>w.worldId===attempt.worldId)
  if(!info || info.kind!=="practice" || info.boardRun!==null || info.parent!==null) throw new Error("Only this panel's own ordinary practice worlds may be archived")
  const meta=JSON.parse(await readFile(`runs/${attempt.worldId}.meta.json`,"utf8"))
  if(meta.seed!==attempt.seed || meta.label!==attempt.label) throw new Error("World ownership mismatch")
  const world=client.world(attempt.worldId)
  const snapshot=await world.snapshot(),events=await world.events(),score=await world.score()
  for(const [kind,value] of Object.entries({snapshot,events,score})) await writeFile(`runs/${world.id}.interrupted.${kind}.json`,JSON.stringify(value))
  const reason="Unplanned operational interruption: CPU-bound repeated supply scans in return-offer selection. No favorable profit stopping. All active worlds on this process are censored, including the companion worker."
  await appendFile(plan.attempts,JSON.stringify({...attempt,event:"failed",at:new Date().toISOString(),error:reason,interruptedAt:snapshot.now})+"\n")
  // No more dispatch decisions: close the retained practice copy to release its team slot.
  if(snapshot.now<snapshot.endsAt) await world.advance({to:snapshot.endsAt})
  const administrative={snapshot:await world.snapshot(),events:await world.events(),score:await world.score(),reveal:await world.reveal()}
  for(const [kind,value] of Object.entries(administrative)) await writeFile(`runs/${world.id}.administrative.${kind}.json`,JSON.stringify(value))
  records.push({worldId:world.id,seed:attempt.seed,level:attempt.level,label:attempt.label,reason,interruptedAt:snapshot.now,endsAt:snapshot.endsAt,observedScore:score,administrativeScore:administrative.score,eventsSha256:createHash("sha256").update(JSON.stringify(events)).digest("hex"),interpretation:"Administrative completion used no further dispatcher actions. Its score is not a full-week policy estimate. The pre-interruption state/events are retained. Decision telemetry held in memory was lost on process termination; later runner revisions journal it after every step."})
}
const report={at:new Date().toISOString(),plan:"experiments/value-development-v1.json",operationalFailure:true,stoppingRuleDeviation:"No per-world wall-time cutoff was declared. This was an unplanned operational interruption prompted by measured CPU saturation and profiling, so no result from this panel can promote a policy.",completedBeforeInterruption:attempts.filter(a=>a.event==="completed").length,interrupted:records,unfinishedTeamWorlds:(await client.worlds()).filter(w=>!w.ended)}
await writeFile("docs/value-development-interruption.json",JSON.stringify(report,null,2)+"\n")
console.log(JSON.stringify(report,null,2))
