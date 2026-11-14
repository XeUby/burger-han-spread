import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { Dispatcher } from "./policy.ts"
import { Dispatcher as Frozen } from "../../runs/frozen/value-development-v1/src/policy.ts"
import type { World } from "../../vendor/typescript/spread.ts"
import type { World as FrozenWorld } from "../../runs/frozen/value-development-v1/vendor/typescript/spread.ts"
import type { DriverProfile, PriceRequest, WorldMap } from "../../vendor/typescript/types.ts"

test("offer scan skips only provably ineligible work and preserves actions and quota state",()=>{
  const map:WorldMap={places:[],roads:["a","b"].flatMap(from=>["a","b"].map(to=>({from,to,km:from===to?0:100,minutes:from===to?0:60})))}
  const drivers:DriverProfile[]=Array.from({length:120},(_,i)=>({id:`d${i}`,homePlaceId:"a",licence:"manual",rating:4.9,completedGigs:100,drops:0}))
  const a=new Dispatcher({} as World,8,500,map,drivers,{driverValue:true})
  const b=new Frozen({} as FrozenWorld,8,500,map,drivers,{driverValue:true})
  const cases=[]
  for(const state of ["stale","current","night"]){
    for(const d of [a,b]){
      d.now=state==="night"?1400:500
      d.outbox.length=0;d.driverAttempts.clear();d.offerCount.clear();d.offers.clear();d.telemetry.length=0
      for(const driver of drivers) d.driverPlace.set(driver.id,{place:"b",at:state==="stale"?100:490})
      for(let i=0;i<160;i++){
        const stop={privateAddress:false,hours:null,window:{from:500,to:1200}}
        const r:PriceRequest={id:`r${i}`,dealerId:"dealer",arrivedAt:400,respondBy:415,batchId:null,note:null,referenceFeeCents:6000,options:[{kind:"same_day",deadline:1200,listPriceCents:10000}],legs:[{car:{premium:false,electric:false,chargePercent:null},pickup:{...stop,placeId:"b"},delivery:{...stop,placeId:"a"}}]}
        d.requests.set(r.id,r)
        const order={id:r.id,dealerId:r.dealerId,option:"same_day" as const,priceCents:10000,deadline:1200,lastPickupAt:1100,status:"waiting" as const,legs:r.legs,deliveredAt:[null]}
        d.orders.set(r.id,order);d.carry(d.singlePost(order),`g${i}`)
        if(i>=8)d.legGigs.delete(r.id)
      }
    }
    let oldCalls=0,newCalls=0
    const old=b.baseFee.bind(b),current=a.baseFee.bind(a)
    b.baseFee=(r)=>{oldCalls++;return old(r)}
    a.baseFee=(r)=>{newCalls++;return current(r)}
    const start=performance.now();b.offerReturns();const oldMs=performance.now()-start
    const next=performance.now();a.offerReturns();const newMs=performance.now()-next
    b.baseFee=old;a.baseFee=current
    assert.deepEqual(a.outbox,b.outbox)
    assert.deepEqual(a.offers,b.offers)
    assert.deepEqual(a.offerCount,b.offerCount)
    assert.deepEqual(a.driverAttempts,b.driverAttempts)
    assert(newCalls<=8)
    cases.push({state,oldSupplyScans:oldCalls,newSupplyScans:newCalls,oldMs,newMs,identicalOffers:a.outbox.length})
  }
  fs.writeFileSync("docs/value-offer-performance.json",JSON.stringify({scope:"Behavioral equivalence on stale/current/night cases, including closed gigs and shared offer quotas. Timings are local microbenchmarks, not whole-week latency guarantees.",cases},null,2)+"\n")
})
