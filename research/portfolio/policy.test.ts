import test from "node:test"
import assert from "node:assert/strict"
import { Dispatcher } from "./policy.ts"
import { Dispatcher as Control } from "../value/policy.ts"
import type { Settings } from "./policy.ts"
import type { World } from "../../vendor/typescript/spread.ts"
import type { Action, DriverProfile, Order, PriceRequest, WorldMap } from "../../vendor/typescript/types.ts"
import final from "../../experiments/final-config.json" with { type:"json" }

const hours={opens:420,closes:1200,weekdays:[0,1,2,3,4],saturday:null}
const map:WorldMap={places:[],roads:["a","b","c"].flatMap(from=>["a","b","c"].map(to=>({from,to,km:from===to?0:100,minutes:from===to?0:70})))}
const drivers:DriverProfile[]=Array.from({length:80},(_,i)=>({id:`d${i}`,homePlaceId:i%2?"a":"b",licence:"manual",rating:4.9,completedGigs:100,drops:0}))
function request(id="new",at=500,reverse=false):PriceRequest {
  const stop={privateAddress:false,hours,window:{from:at,to:2640}}
  return {id,arrivedAt:at,respondBy:at+15,dealerId:"dealer",batchId:null,note:null,referenceFeeCents:6000,legs:[{car:{premium:false,electric:false,chargePercent:null},pickup:{...stop,placeId:reverse?"b":"a"},delivery:{...stop,placeId:reverse?"a":"b"}}],options:[{kind:"same_day",deadline:Math.floor(at/1440)*1440+1200,listPriceCents:12000},{kind:"next_day",deadline:2640,listPriceCents:10000}]}
}
const order=(r:PriceRequest):Order=>({id:r.id,dealerId:r.dealerId,option:"same_day",priceCents:12000,deadline:r.options[0]!.deadline,lastPickupAt:r.options[0]!.deadline-100,legs:r.legs,status:"waiting",deliveredAt:[null]})
function setup(settings:Partial<Settings>={},level=8,now=500,refuse=false) {
  const sent:Action[]=[];let next=0
  const world={act:async(actions:Action[])=>{sent.push(...structuredClone(actions));return actions.map(a=>refuse && a.type==="withdraw"?{ok:false,reason:"Booked concurrently"}:{ok:true,id:`g${++next}`})}} as unknown as World
  const desk=new Dispatcher(world,level,now,map,drivers,{...final,firstOptionOnly:true,openingCostAdmission:true,actionGuard:true,portfolio:true,...settings})
  return {desk,world,sent}
}

test("disabled integration preserves the mechanism control across levels",()=>{
  for(const level of [1,2,3,4,7,8]) {
    const {desk,world}=setup({portfolio:false},level)
    const control=new Control(world,level,500,map,drivers,{...final,firstOptionOnly:true,openingCostAdmission:true,actionGuard:true})
    for(let i=0;i<15;i++){const r=request(`r${i}`);desk.quote(r);control.quote(r)}
    assert.deepEqual(desk.takeActions(),control.takeActions())
    assert.equal(desk.nextDecisionAt(),control.nextDecisionAt())
  }
})

test("a real quote cannot be overwritten by its initial neutral decline",async()=>{
  const {desk,sent}=setup()
  desk.quote(request("one"));desk.quote(request("two"))
  const frame=desk.buildFrame()
  const chosen=[...frame.plans].find(([,p])=>p.kind==="quote" && p.request?.id==="one")!
  assert(chosen)
  await desk.execute(frame,{selected:[chosen[0]]} as never)
  assert.equal(sent.length,1)
  assert.equal(sent[0]!.type,"quote")
  assert(desk.pending.has("one"))
  assert(desk.takeActions().every(a=>a.type!=="quote" || a.requestId!=="one"))
})

test("yesterday's completed work does not consume today's daily capacity",()=>{
  const clean=setup({},8,1940).desk,old=setup({},8,1940).desk
  for(let i=0;i<30;i++) {const r=request(`past${i}`);old.requests.set(r.id,r);old.orders.set(r.id,{...order(r),status:"delivered",deliveredAt:[1000]})}
  clean.quote(request("today",1940));old.quote(request("today",1940))
  assert.deepEqual(old.buildFrame().input.capacity,clean.buildFrame().input.capacity)
})

test("future-ready work receives its own constrained resource day",()=>{
  const {desk}=setup();const r=request()
  r.legs[0]!.pickup.window.from=1940;r.options=[r.options[1]!]
  desk.quote(r);const frame=desk.buildFrame()
  assert(Object.keys(frame.input.capacity[0]!).some(k=>k==="daily:a:1"))
  const option=frame.input.alternatives.find(c=>frame.plans.get(c.id)?.kind==="quote")!
  assert(option.outcomes.some(o=>o.capacity["daily:a:1"]!>0))
})

test("low levels cannot receive route credit for an unavailable bundle",()=>{
  for(const level of [1,2]) {
    const {desk}=setup({},level)
    const r=request("old");desk.requests.set(r.id,r);desk.orders.set(r.id,order(r));desk.carry(desk.singlePost(order(r)),"anchor")
    desk.quote(request("new",500,true));const frame=desk.buildFrame()
    assert([...frame.plans.values()].every(p=>!p.anchor && p.kind!=="fulfill"))
    const invalid=request("first-bad");invalid.options[0]!.deadline=540;desk.quote(invalid)
    assert([...desk.buildFrame().plans.values()].every(p=>p.kind!=="quote" || p.request?.id!==invalid.id))
  }
})

test("a refused withdrawal retains the original gig and the new held order",async()=>{
  const {desk}=setup({},8,500,true)
  const a=request("anchor"),b=request("held",500,true)
  for(const r of [a,b]){desk.requests.set(r.id,r);desk.orders.set(r.id,order(r))}
  desk.carry(desk.singlePost(order(a)),"g100")
  desk.held.set(b.id,{post:desk.singlePost(order(b)),at:480})
  const frame=desk.buildFrame(),pair=[...frame.plans].find(([,p])=>p.kind==="fulfill" && p.owned.length===2)!
  assert(pair)
  await desk.execute(frame,{selected:[pair[0]]} as never)
  assert(desk.posts.has("g100"));assert(desk.held.has("held"));assert.equal(desk.blockedAnchors.get("g100"),515)
})

test("anchor reservations last only through their unresolved quote",()=>{
  const {desk}=setup();const r=request("new")
  desk.requests.set(r.id,r);desk.pending.add(r.id);desk.reservations.set("anchor",r.id)
  assert.equal(desk.holdDue("anchor",480),516)
  desk.pending.delete(r.id)
  assert.equal(desk.holdDue("anchor",480),495)
})

test("the actual solver consumes a public-state frame and dispatches one planned action",async()=>{
  const {desk,sent}=setup({paymentChoice:true,futureValue:true})
  desk.quote(request())
  try {
    await desk.tick()
    assert.equal(desk.solverCalls,1)
    assert.equal(sent.length,1)
    const decision=desk.telemetry.find(x=>x.kind==="portfolio_solve")!
    assert(decision)
    assert.equal((decision.result as {status:string}).status,"OPTIMAL")
  } finally {desk.closeSolver()}
})
