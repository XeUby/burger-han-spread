import test from 'node:test'
import assert from 'node:assert/strict'
import { Dispatcher, validateSettings } from './policy.ts'
import { Dispatcher as Frozen } from '../../runs/frozen/bundle-payment-ablation-v1/src/portfolio.ts'
import { PortfolioSolver } from '../portfolio/bridge.ts'
import type { Action, DriverProfile, PriceRequest, WorldMap } from '../../vendor/typescript/types.ts'
const hours={opens:420,closes:1200,weekdays:[0,1,2,3,4],saturday:null}
const map:WorldMap={places:[],roads:['a','b'].flatMap(from=>['a','b'].map(to=>({from,to,km:from===to?0:100,minutes:from===to?0:70})))}
const drivers:DriverProfile[]=Array.from({length:80},(_,i)=>({id:`d${i}`,homePlaceId:i%2?'a':'b',licence:'manual',rating:4.9,completedGigs:100,drops:0}))
function request(id='r'):PriceRequest {
 const stop={privateAddress:false,hours,window:{from:500,to:4080}}
 return {id,arrivedAt:500,respondBy:515,dealerId:'dealer',batchId:null,note:null,referenceFeeCents:6000,legs:[{car:{premium:false,electric:false,chargePercent:null},pickup:{...structuredClone(stop),placeId:'a'},delivery:{...structuredClone(stop),placeId:'b'}}],options:[{kind:'same_day',deadline:1200,listPriceCents:13000},{kind:'next_day',deadline:2640,listPriceCents:10000},{kind:'within_3_days',deadline:4080,listPriceCents:9000}]}
}
function setup(privateCoverage=true){
 const sent:Action[]=[]
 const world={act:async(actions:Action[])=>{sent.push(...structuredClone(actions));return actions.map(()=>({ok:true}))}} as never
 const desk=new Dispatcher(world,8,500,map,drivers,{portfolio:true,privateCoverage})
 const original=new Frozen(world,8,500,map,drivers,{portfolio:true})
 return {desk,original,sent}
}

function appointment(id='r'):PriceRequest {
 const r=request(id);r.legs[0]!.delivery.privateAddress=true;r.legs[0]!.delivery.hours=null;r.legs[0]!.delivery.window={from:900,to:1020};return r
}
test('disabled and public-only frames preserve the frozen incumbent',()=>{
 for(const enabled of [false,true]){const {desk,original}=setup(enabled);desk.quote(request());original.quote(request());assert.deepEqual(desk.buildFrame(),original.buildFrame())}
})
test('both arms are reproducible and private outcomes do not enter public demand learning',()=>{
 const arms=new Set()
 for(let seed=1;seed<=32;seed++){
  const {desk}=setup();desk.settings.randomSeed=seed;const r=appointment();const before=structuredClone(r);desk.quote(r)
  const row=desk.telemetry.find(d=>d.kind==='private_randomized')!;assert(row);arms.add(row.arm);assert.equal(row.probability,.5);assert.deepEqual(r,before);assert.equal(desk.bids.size,0)
  if(row.arm==='quote'){assert(desk.pending.has(r.id));assert.equal(Object.keys(desk.outbox[0]!.type==='quote'?desk.outbox[0]!.prices:{}).length,3)}
  const second=setup().desk;second.settings.randomSeed=seed;second.quote(appointment());assert.deepEqual(second.outbox,desk.outbox)
 }
 assert.deepEqual(arms,new Set(['decline','quote']))
})
test('daily assignment and unresolved exposure limits apply to both arms',()=>{
 const {desk}=setup()
 for(let i=0;i<5;i++){desk.pending.clear();desk.explored.clear();desk.quote(appointment(String(i)))}
 assert.equal(desk.assignments,4)
 const other=setup().desk;other.explored.add('a');other.explored.add('b');other.pending.add('a');other.pending.add('b');other.quote(appointment());assert.equal(other.assignments,0)
})
test('private award posts immediately without extending its appointment',async()=>{
 const {desk}=setup();const r=appointment();desk.requests.set(r.id,r)
 const order={id:r.id,dealerId:r.dealerId,option:'next_day' as const,priceCents:15000,deadline:2640,legs:structuredClone(r.legs),status:'waiting' as const,deliveredAt:[null],lastPickupAt:920}
 desk.orders.set(r.id,order);await desk.post(order,[0]);assert.equal(desk.held.size,0)
 const post=desk.outbox.find(a=>a.type==='post');assert(post?.type==='post');assert.equal(post.stops.length,2);assert.equal(post.stops[1]!.window,undefined);assert.deepEqual(order.legs[0]!.delivery.window,{from:900,to:1020})
})
test('unsupported work and future arrivals are excluded; a failed visit stops further probes',async()=>{
 const {desk}=setup();const r=appointment();r.note={text:'unparsed instruction',language:'en'};desk.quote(r);assert.equal(desk.assignments,0)
 const future=appointment('future');future.arrivedAt=501;assert.throws(()=>desk.quote(future),/Future/)
 desk.explored.add('failed');await desk.handle({kind:'visit_failed',seq:1,at:501,orderId:'failed',leg:0,gigId:'g',reason:'closed'} as never)
 assert(desk.stopped);desk.quote(appointment('next'));assert.equal(desk.assignments,0)
 assert.throws(()=>validateSettings({privateCoverage:true,allowPrivate:true}),/disabled/)
})
