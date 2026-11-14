import fs from "node:fs"
import { chooseChainOffer } from "../src/chain-offers.ts"
import { Network } from "../src/planning.ts"
import type { ChainGig } from "../src/chain-offers.ts"
import type { DeskEvent, DriverProfile, Order, PostAction } from "../vendor/typescript/types.ts"

const worlds = ["w09f7d47c59507d4e46cb", "w5e573ada5fed0a67a4a8", "w679c0fd4b18e923880c6", "w6ffd0c010757c76f97d8", "w2f96a475ae718d1589d9", "w8b85572a9b6fc286e4ec", "w735d87d8fe1b99845667", "wce13500dc9c2829611d1"]
const read = (path: string) => JSON.parse(fs.readFileSync(path,"utf8"))
const network = new Network(read("docs/map.json"))
const summaries: any[] = []
for (const world of worlds) {
  const meta = read(`runs/${world}.meta.json`)
  const snapshot = read(`runs/${world}.snapshot.json`)
  const events: DeskEvent[] = read(`runs/${world}.events.json`)
  const reveal = read(`runs/${world}.reveal.json`)
  const drivers: DriverProfile[] = read(`runs/${world}.drivers.json`)
  const driverMap = new Map(drivers.map(d=>[d.id,d]))
  const requests = new Map<string,any>(reveal.requests.map((r:any)=>[r.request.id,r.request]))
  const orders = new Map<string,Order>()
  const gigs = new Map<string,any>(snapshot.gigs.map((g:any)=>[g.id,g]))
  const posts:any[] = [...gigs.values()].sort((a,b)=>a.postedAt-b.postedAt)
  const states = new Map<string,string>()
  const assigned = new Map<string,string>()
  const feeAt = new Map<string,number>()
  const fees = new Map<string,number>(reveal.views.map((v:any)=>[`${v.gigId}:${v.driverId}:${v.at}`,v.feeCents]))
  const daily = new Map<string,number>()
  const attempted = new Map<string,Set<string>>()
  const active = new Map<string,number[]>()
  const supplyCache = new Map<string,number>()
  const matches:any[] = []
  let postIndex=0
  function opening(g:any,o:Order):number {
    const req=requests.get(o.id),leg=o.legs[0]!
    const key=`${leg.pickup.placeId}:${g.audience.manualLicence}:${g.audience.experienced}`
    if(!supplyCache.has(key)) supplyCache.set(key,drivers.reduce((sum,d)=>{
      if(g.audience.manualLicence&&d.licence!=="manual"||g.audience.experienced&&(d.rating<4.8||d.completedGigs<50))return sum
      const distance=network.km(d.homePlaceId,leg.pickup.placeId)
      return sum+(distance<=35?1:distance<=70?.35:0)
    },0))
    const supply=supplyCache.get(key)!
    const base=Math.max(2000,Math.round(req.referenceFeeCents*(meta.settings.fee+(supply<20?.18:supply<50?.08:0))))
    const duration=(legs:Order["legs"])=>45+legs.reduce((sum,l)=>sum+network.minutes(l.pickup.placeId,l.delivery.placeId),0)
    return Math.round(base*Math.max(1,duration(o.legs)/duration(req.legs)))
  }
  for(const e of events){
    if(e.kind==="order_won"||e.kind==="order_changed"){
      const deliveredAt=e.kind==="order_won"?e.order.legs.map(()=>null):[...(orders.get(e.order.id)?.deliveredAt??e.order.legs.map(()=>null))]
      orders.set(e.order.id,{...structuredClone(e.order),status:"waiting",deliveredAt})
    }
    while(postIndex<posts.length&&posts[postIndex].postedAt<=e.at){
      const g=posts[postIndex++]
      const ids=new Set(g.stops.map((s:any)=>s.orderId))
      for(const [id,state]of states)if(state==="open"&&gigs.get(id).stops.some((s:any)=>ids.has(s.orderId)))states.set(id,"withdrawn")
      states.set(g.id,"open")
    }
    if(e.kind==="gig_viewed")feeAt.set(e.gigId,fees.get(`${e.gigId}:${e.driverId}:${e.at}`)!)
    if(e.kind==="gig_booked"){states.set(e.gigId,"booked");assigned.set(e.gigId,e.driverId)}
    if(e.kind==="gig_dropped"||e.kind==="no_show"){states.set(e.gigId,"open");assigned.delete(e.gigId)}
    if(e.kind==="gig_expired")states.set(e.gigId,"withdrawn")
    if(e.kind==="gig_started")states.set(e.gigId,"working")
    if(e.kind==="order_cancelled")for(const g of e.gigs)if(g.outcome==="withdrawn"||g.outcome==="released")states.set(g.gigId,"withdrawn")
    if(e.kind!=="delivered")continue
    const deliveredOrder=orders.get(e.orderId)
    if(deliveredOrder){deliveredOrder.deliveredAt[e.leg]=e.at;if(deliveredOrder.deliveredAt.every(at=>at!==null))deliveredOrder.status="delivered"}
    states.set(e.gigId,"done")
    const driver=driverMap.get(assigned.get(e.gigId)??"")
    if(!driver)continue
    const candidates:ChainGig[]=[]
    for(const [id,state]of states){
      if(state!=="open")continue
      const g=gigs.get(id),o=orders.get(g.stops[0].orderId)
      if(!o)continue
      const openingFeeCents=opening(g,o)
      candidates.push({gigId:id,open:true,order:o,post:{type:"post",stops:g.stops,audience:g.audience,schedule:g.schedule}as PostAction,openingFeeCents,publicFeeCents:feeAt.get(id)??openingFeeCents,openOffers:(active.get(id)??[]).filter(until=>until>e.at).length})
    }
    const key=`${e.at/1440|0}:${driver.id}`
    const choice=chooseChainOffer(e.at,{driver,placeId:e.placeId,at:e.at},candidates,network,{discount:.8,offersUsedToday:daily.get(key)??0,attemptedGigIds:attempted.get(driver.id)})
    if(!choice)continue
    daily.set(key,(daily.get(key)??0)+1)
    if(!attempted.has(driver.id))attempted.set(driver.id,new Set())
    attempted.get(driver.id)!.add(choice.action.gigId)
    active.set(choice.action.gigId,[...(active.get(choice.action.gigId)??[]).filter(until=>until>e.at),e.at+10])
    const g=gigs.get(choice.action.gigId),o=orders.get(g.stops[0].orderId)!
    matches.push({at:e.at,completedOrder:e.orderId,nextOrder:o.id,driver:driver.id,home:driver.homePlaceId,from:o.legs[0]!.pickup.placeId,to:o.legs[0]!.delivery.placeId,...choice})
  }
  const unique=new Map<string,any>()
  for(const match of matches)if(!unique.has(match.action.gigId)||unique.get(match.action.gigId).feeSavingCents<match.feeSavingCents)unique.set(match.action.gigId,match)
  summaries.push({world,seed:meta.seed,deliveries:events.filter(e=>e.kind==="delivered").length,offerOpportunities:matches.length,uniqueGigs:unique.size,optimisticFeeSavingsCents:[...unique.values()].reduce((sum,m)=>sum+m.feeSavingCents,0),matches})
}
const report={scope:"Retrospective chain-offer screening of the eight completed final-validation worlds, explicitly authorized for the subsequent optimization task. These worlds now inform development; future evaluation needs new seeds.",stateReconstruction:"Saved order_won payloads were mutated by the original dispatcher. The replay resets them to waiting with no delivered legs, preserves known prior deliveries on order_changed, and applies delivery events chronologically. This corrects an earlier invalid one-opportunity count.",limits:["No offers were actually sent. Acceptance, scheduling, displacement and learned behavior are unobserved counterfactuals.","The helper is run against the original open-job trace, with two hypothetical offers per driver per day and per-gig active limits. Existing deadline-offer launch times were not logged, so their transient overlap is not reconstructed.","Public fee is the last revealed view or initial calculated fee, not a complete logged reprice history. Savings are a favorable exposure bound, not estimated realized profit."],summary:{worlds:summaries.length,deliveries:summaries.reduce((n,r)=>n+r.deliveries,0),offerOpportunities:summaries.reduce((n,r)=>n+r.offerOpportunities,0),uniqueGigs:summaries.reduce((n,r)=>n+r.uniqueGigs,0),optimisticFeeSavingsCents:summaries.reduce((n,r)=>n+r.optimisticFeeSavingsCents,0)},worlds:summaries}
fs.writeFileSync("docs/chain-offer-screen.json",JSON.stringify(report,null,2)+"\n")
console.log(JSON.stringify({...report,worlds:summaries.map(({matches,...r})=>r)},null,2))
