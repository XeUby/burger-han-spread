import fs from "node:fs"
import crypto from "node:crypto"
import { readNote as originalNote } from "../experiments/baseline/src/notes.ts"
import { readNote as currentNote } from "../src/notes.ts"
import { Network, lastPickup } from "../experiments/baseline/src/planning.ts"

const read = (p: string) => JSON.parse(fs.readFileSync(p,"utf8"))
const network = new Network(read("docs/map.json"))
const finalIds = ["w7ae145e3ea74526ee4bf", "w1937eaf885387948933b", "w65288bae5e4a8c3d8f5e"]
const rows: any[] = []
for (const world of finalIds) {
  const reveal = read(`runs/${world}.reveal.json`)
  for (const {request:r} of reveal.requests) {
    if (r.legs.length!==1) continue
    const leg=r.legs[0]
    if (leg.pickup.privateAddress || leg.delivery.privateAddress) continue
    const km=network.km(leg.pickup.placeId,leg.delivery.placeId)
    if(km<=400 || km>600) continue
    const rules=currentNote(r.note)
    const old=originalNote(r.note)
    const options=r.options.filter((o:any)=>lastPickup(leg,o.deadline,network,rules.plates)>=Math.max(r.arrivedAt+300,leg.pickup.window.from+120))
    rows.push({world,id:r.id,from:leg.pickup.placeId,to:leg.delivery.placeId,km,oldSafe:old.safe,newSafe:rules.safe,timeFeasible:options.length>0,premium:leg.car.premium,manual:rules.manual,listPrice:options.length?Math.max(...options.map((o:any)=>o.listPriceCents)):null,reference:r.referenceFeeCents})
  }
}
const candidates=rows.filter(r=>r.newSafe&&r.timeFeasible)
const cohort=(rs:any[])=>({requests:rs.length,originalNotes:rs.filter(r=>r.oldSafe).length,expandedNotes:rs.filter(r=>r.newSafe).length,premium:rs.filter(r=>r.premium).length,manual:rs.filter(r=>r.manual).length})
const history:any[]=[]
for(const world of ["w23dc3ed7976dc481981f","w815d24fedae64f9f5cf4","w27f9f6d54106931d0f1d"]){
 const reveal=read(`runs/${world}.reveal.json`),snap=read(`runs/${world}.snapshot.json`),events=read(`runs/${world}.events.json`)
 const requests=new Map(reveal.requests.map((r:any)=>[r.request.id,r.request]))
 for(const o of snap.orders){
  if(o.status==="cancelled")continue
  const r:any=requests.get(o.id),leg=r.legs[0],km=network.km(leg.pickup.placeId,leg.delivery.placeId)
  if(km<=400)continue
  const lines=events.filter((e:any)=>e.kind==="ledger"&&e.line.orderId===o.id).map((e:any)=>e.line)
  history.push({world,id:o.id,from:leg.pickup.placeId,to:leg.delivery.placeId,km,premium:leg.car.premium,late:o.deliveredAt.some((t:any)=>t===null||t>o.deadline),profit:lines.reduce((n:number,l:any)=>n+l.cents,0)/100})
 }
}
const lanes=[...new Set(history.map(r=>`${r.from} → ${r.to}`))].map(lane=>{
 const rs=history.filter(r=>`${r.from} → ${r.to}`===lane)
 return {lane,km:rs[0].km,orders:rs.length,late:rs.filter(r=>r.late).length,profitEuros:Math.round(rs.reduce((n,r)=>n+r.profit,0)*100)/100,premium:rs.filter(r=>r.premium).length}
}).sort((a,b)=>b.profitEuros-a.profitEuros)
const report={notesSha256:crypto.createHash("sha256").update(fs.readFileSync("src/notes.ts")).digest("hex"),limitation:"Supply rosters were not saved. Candidates satisfy note, geometry and time gates only; minDrivers, dynamic backlog and actual win probability still need live evaluation. Historical accepted long routes passed the old >=8 weighted-driver gate, not today's >=12 gate. No historical dispatched route exceeded 500 km.",finalLongRequests:cohort(rows),timeFeasibleCandidates:cohort(candidates),byDistance:Object.fromEntries([500,550,600].map(k=>[String(k),cohort(candidates.filter(r=>r.km<=k && r.km>(k===500?400:k===550?500:550)))])),byPickup:Object.fromEntries([...new Set(candidates.map(r=>r.from))].sort().map(k=>[k,cohort(candidates.filter(r=>r.from===k))])),historicalLanes:lanes,historicalOrders:history}
fs.writeFileSync("docs/diagnosis-long.json",JSON.stringify(report,null,2)+"\n")
console.log(JSON.stringify({...report,historicalOrders:undefined},null,2))
