import fs from "node:fs"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { Dispatcher } from "./policy.ts"
import { Dispatcher as Control } from "../../src/policy.ts"
import type { Action, DeskEvent } from "../../vendor/typescript/types.ts"
import type { World } from "../../vendor/typescript/spread.ts"

const read = (path: string) => JSON.parse(fs.readFileSync(path,"utf8"))
const rows=[]
for(const worldId of ["wccca731d04dbfacbaba0","w7b412da927edcef0081e","w2464fa0a1a5ce6878d47"]) {
  function host() {
    let next=0
    const sent: Action[]=[]
    return { sent, world:{act:async(actions:Action[])=>{sent.push(...structuredClone(actions));return actions.map(a=>({ok:true as const,id:a.type==="post"?`g${++next}`:"ack"}))}} }
  }
  const a=host(),b=host(),map=read("docs/map.json"),drivers=read(`runs/${worldId}.drivers.json`)
  const current=new Dispatcher(a.world as World,8,0,map,drivers)
  const control=new Control(b.world as World,8,0,map,drivers)
  const events:DeskEvent[]=read(`runs/${worldId}.events.json`)
  const end=read(`runs/${worldId}.snapshot.json`).endsAt
  let now=0,cursor=0,count=0,frames=0
  while(now<=end) {
    current.now=control.now=now
    while(cursor<events.length && events[cursor]!.at<=now) { const e=events[cursor++]!;await current.handle(structuredClone(e));await control.handle(structuredClone(e)) }
    await current.tick();await control.tick()
    const aa=current.takeActions(),bb=control.takeActions()
    current.readResults(aa,await a.world.act(aa));control.readResults(bb,await b.world.act(bb))
    assert.deepEqual(a.sent,b.sent,`${worldId}:${now}`)
    assert.equal(current.nextDecisionAt(),control.nextDecisionAt())
    count+=a.sent.length;frames++;a.sent.length=b.sent.length=0
    if(now===end) break
    now=Math.min(end,events[cursor]?.at ?? end,current.nextDecisionAt())
    assert(now>current.now)
  }
  rows.push({worldId,seed:read(`runs/${worldId}.meta.json`).seed,identicalActions:count,identicalDecisionFrames:frames})
}
const sha256=createHash("sha256").update(fs.readFileSync("research/portfolio/policy.ts")).digest("hex")
fs.writeFileSync("docs/portfolio-control-conformance.json",JSON.stringify({scope:"Disabled research policy versus current validated control on recorded inputs; not a counterfactual profit estimate",policySha256:sha256,rows},null,2)+"\n")
console.log(JSON.stringify(rows))
