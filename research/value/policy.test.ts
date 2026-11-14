import test from "node:test"
import assert from "node:assert/strict"
import { Dispatcher, validateSettings } from "./policy.ts"
import { Dispatcher as Control } from "../../src/policy.ts"
import { Dispatcher as Lower } from "../low-level/bundle/src/policy.ts"
import type { Action, DriverProfile, Order, PriceRequest, WorldMap } from "../../vendor/typescript/types.ts"
import type { World } from "../../vendor/typescript/spread.ts"
import type { World as LowerWorld } from "../low-level/bundle/vendor/typescript/spread.ts"

const hours = { opens: 420, closes: 1200, weekdays: [0,1,2,3,4], saturday: null }
const map: WorldMap = { places: [], roads: ["a","b","c"].flatMap(from => ["a","b","c"].map(to => ({ from, to, km: from===to ? 0 : to==="c" || from==="c" ? 300 : 100, minutes: from===to ? 0 : to==="c" || from==="c" ? 220 : 70 }))) }
const drivers: DriverProfile[] = Array.from({ length: 80 }, (_,i) => ({ id: `d${i}`, homePlaceId: i%2 ? "a" : "b", licence: "manual", rating: 4.9, completedGigs: 100, drops: 0 }))
function request(id="r", reverse=false): PriceRequest {
  const stop = { privateAddress: false, hours, window: { from: 500, to: 2640 } }
  return { id, arrivedAt: 480, respondBy: 515, dealerId: `dealer-${id}`, batchId: null, note: null, referenceFeeCents: 6000, legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: { ...stop, placeId: reverse ? "b" : "a" }, delivery: { ...stop, placeId: reverse ? "a" : "b" } }], options: [{ kind: "same_day", deadline: 1200, listPriceCents: 12000 }, { kind: "next_day", deadline: 2640, listPriceCents: 10000 }] }
}
const order = (r: PriceRequest): Order => ({ id: r.id, dealerId: r.dealerId, option: "same_day", priceCents: 12000, deadline: 1200, lastPickupAt: 1100, status: "waiting", deliveredAt: [null], legs: structuredClone(r.legs) })
function host(refuse=false) {
  const calls: Action[][] = []
  return { calls, world: { act: async (actions: Action[]) => { calls.push(structuredClone(actions)); return actions.map(() => refuse ? { ok: false, reason: "Booked concurrently" } : { ok: true, id: "ack" }) } } as unknown as World }
}

test("disabled research preserves the benchmark; lower mechanism mode matches the separate candidate", () => {
  for (const level of [1,2,3,4,7,8]) {
    const world = host().world
    const a = new Dispatcher(world, level, 500, map, drivers)
    const b = new Control(world, level, 500, map, drivers)
    for (let i=0;i<15;i++) { const r=request(`r${i}`, i%2===0); a.quote(r); b.quote(r) }
    assert.deepEqual(a.takeActions(), b.takeActions())
    assert.equal(a.nextDecisionAt(), b.nextDecisionAt())
    const safe = new Dispatcher(world,level,500,map,drivers,{ firstOptionOnly:true, openingCostAdmission:true })
    const low = new Lower(world as unknown as LowerWorld,level,500,map,drivers,{ firstOptionOnly:true, openingCostAdmission:true })
    for (let i=0;i<15;i++) { const r=request(`r${i}`); r.options[0]!.listPriceCents=7000; safe.quote(r); low.quote(r) }
    assert.deepEqual(safe.takeActions(),low.takeActions())
    safe.requests.set("r",request()); low.requests.set("r",request())
    assert.deepEqual(safe.feesFor(order(request()),1),low.feesFor(order(request()),1))
  }
  assert.throws(() => validateSettings({ capacityValue: 2 }))
  assert.throws(() => validateSettings({ randomSeed: 0 }))
})

test("the actual awarded first option must be feasible and expired quotes cannot enter the outbox", () => {
  for (const level of [1,2,3]) {
    const d=new Dispatcher(host().world,level,500,map,drivers,{firstOptionOnly:true,openingCostAdmission:true,capacityValue:true})
    const r=request(); r.options[0]!.deadline=600
    d.quote(r); assert.equal(d.takeActions().length,0)
    d.now=515; d.quote(request("late")); assert.equal(d.takeActions().length,0)
  }
})

test("only fully observed booking cohorts update the prior, and each week starts fresh", () => {
  const d=new Dispatcher(host().world,8,500,map,drivers,{capacityValue:true})
  const before=d.capacityState(request()).fastProbability
  d.cohorts.set("future",{at:450,place:"a",bookedAt:470})
  d.cohorts.set("cancelled",{at:100,place:"a",cancelledAt:110})
  assert.equal(d.capacityState(request()).fastProbability,before)
  d.cohorts.set("mature",{at:100,place:"a"})
  assert(d.capacityState(request()).fastProbability<before)
  const fresh=new Dispatcher(host().world,8,500,map,drivers,{capacityValue:true})
  assert.equal(fresh.capacityState(request()).fastProbability,before)
})

test("known later bookings invalidate queued reprices and offers without changing the public schedule", () => {
  const d=new Dispatcher(host().world,8,500,map,drivers,{actionGuard:true})
  const r=request(); d.requests.set(r.id,r); d.orders.set(r.id,order(r))
  const post=d.singlePost(order(r)); d.carry(post,"g")
  d.outbox.push({type:"reprice",gigId:"g",schedule:[{at:500,feeCents:10000}]},{type:"offer",gigId:"g",driverId:"d1",feeCents:10000})
  d.booked.add("g")
  assert.deepEqual(d.takeActions(),[])
  assert.deepEqual(d.posts.get("g")!.schedule,post.schedule)
  assert.equal(d.telemetry.filter(r=>r.kind==="stale_skipped").length,2)
})

test("reroutes recompute charging for open gigs; a booked gig cannot be edited by the API", async () => {
  for (const booked of [false,true]) {
    const d=new Dispatcher(host().world,8,500,map,drivers,{bundleWait:0})
    const r=request(); r.legs[0]!.car={premium:false,electric:true,chargePercent:20}
    d.requests.set(r.id,r); d.orders.set(r.id,order(r)); const post=d.singlePost(order(r)); d.carry(post,"g")
    assert.equal(post.stops[0]!.withCharging,false)
    if(booked) d.booked.add("g")
    const changed=order(r); changed.legs[0]!.delivery.placeId="c"
    await d.change(changed)
    const next=d.outbox.find(a=>a.type==="post")
    if(booked) { assert.equal(next,undefined); assert.equal(d.posts.get("g")!.stops[0]!.withCharging,false) }
    else assert.equal(next?.type==="post" && next.stops[0]!.withCharging,true)
  }
})

test("an anchored quote reserves one real order and books no hypothetical driver", async () => {
  const d=new Dispatcher(host().world,8,500,map,drivers,{routeValue:true})
  const old=request("old"); d.requests.set(old.id,old); d.orders.set(old.id,order(old)); d.carry(d.singlePost(order(old)),"anchor")
  d.quote(request("new",true))
  assert.equal(d.links.get("new")?.anchorId,"old")
  d.quote(request("other",true))
  assert.equal(d.links.has("other"),false)
  assert.equal(d.booked.size,0)
  d.pending.delete("new"); await d.win(order(request("new",true)))
  await d.joinAnchors()
  assert(d.outbox.some(a=>a.type==="post" && new Set(a.stops.map(s=>s.orderId)).size===2))
  assert.equal(d.gigsOf("old").length,0)
  assert.equal(d.held.has("new"),false)
})

test("a refused anchor withdrawal preserves its gig and the new order's solo fallback", async () => {
  const d=new Dispatcher(host(true).world,8,500,map,drivers,{routeValue:true})
  const old=request("old"); d.requests.set(old.id,old); d.orders.set(old.id,order(old)); d.carry(d.singlePost(order(old)),"anchor")
  const r=request("new",true); d.quote(r); d.pending.delete(r.id); await d.win(order(r)); await d.joinAnchors()
  assert.deepEqual(d.gigsOf("old"),["anchor"])
  assert(d.held.has("new"))
  assert.equal(d.outbox.filter(a=>a.type==="post").length,0)
  assert.equal(d.failures.length,1)
})

test("arbitrary IDs and unobserved future outcomes do not change current prices", () => {
  const config={capacityValue:true,routeValue:true,actionGuard:true}
  const a=new Dispatcher(host().world,8,500,map,drivers,config)
  const rename=(s:string)=>`renamed-${s}`
  const renamedMap={...map,roads:map.roads.map(r=>({...r,from:rename(r.from),to:rename(r.to)}))}
  const renamedDrivers=drivers.map(d=>({...d,id:rename(d.id),homePlaceId:rename(d.homePlaceId)}))
  const b=new Dispatcher(host().world,8,500,renamedMap,renamedDrivers,config)
  const r=request(); const changed=structuredClone(r); changed.id=rename(r.id); changed.dealerId=rename(r.dealerId)
  for(const leg of changed.legs) { leg.pickup.placeId=rename(leg.pickup.placeId);leg.delivery.placeId=rename(leg.delivery.placeId) }
  a.quote(r);b.quote(changed)
  const x=a.takeActions()[0],y=b.takeActions()[0]
  assert.equal(x?.type,"quote");assert.equal(y?.type,"quote")
  if(x?.type==="quote"&&y?.type==="quote") assert.deepEqual(x.prices,y.prices)
  const saved=JSON.stringify(x)
  r.options[0]!.listPriceCents=999999
  assert.equal(JSON.stringify(x),saved)
})

test("randomized opening payments have bounded support and recorded probabilities", () => {
  const schedules=[]
  for(let repeat=0;repeat<2;repeat++) {
    const d=new Dispatcher(host().world,8,500,map,drivers,{paymentProbe:true,randomSeed:123})
    const fees=[]
    for(let i=0;i<25;i++) {
      const r=request(`r${i}`);d.requests.set(r.id,r);d.orders.set(r.id,order(r));d.outbox.push(d.singlePost(order(r)))
      fees.push(d.takeActions())
    }
    const probes=d.telemetry.filter(r=>r.kind==="payment_randomized")
    assert.equal(probes.length,20)
    assert(probes.every(r=>r.probability===1/3 && [.92,1,1.08].includes(r.multiplier as number)))
    schedules.push(fees)
  }
  assert.deepEqual(schedules[0],schedules[1])
})
