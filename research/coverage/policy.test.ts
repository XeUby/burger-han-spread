import test from 'node:test'
import assert from 'node:assert/strict'
import { Dispatcher, assignment, validateSettings } from './policy.ts'
import { Dispatcher as Original } from '../portfolio/policy.ts'
import type { World } from '../../vendor/typescript/spread.ts'
import type { Action, DriverProfile, Order, PriceRequest, WorldMap } from '../../vendor/typescript/types.ts'

const hours = { opens: 420, closes: 1200, weekdays: [0,1,2,3,4], saturday: null }
const map: WorldMap = { places: [], roads: ['a','b'].flatMap(from => ['a','b'].map(to => ({ from, to, km: from === to ? 0 : 100, minutes: from === to ? 0 : 70 }))) }
const drivers: DriverProfile[] = Array.from({length: 80}, (_,i) => ({ id:`d${i}`, homePlaceId:i%2?'a':'b', licence:'manual', rating:4.9, completedGigs:100, drops:0 }))
function request(id='r'): PriceRequest {
  const stop = { privateAddress:false, hours, window:{from:500,to:2640} }
  return { id, arrivedAt:500, respondBy:515, dealerId:'dealer', batchId:null, note:null, referenceFeeCents:6000, legs:[{car:{premium:false,electric:false,chargePercent:null}, pickup:{...structuredClone(stop),placeId:'a'},delivery:{...structuredClone(stop),placeId:'b'}}], options:[{kind:'next_day',deadline:2640,listPriceCents:12000}] }
}
function setup(supply=drivers, seed=1, coverage=true) {
  const sent:Action[][]=[]
  const world={act:async(actions:Action[])=>{sent.push(structuredClone(actions));return actions.map(()=>({ok:true}))},advance:async(input:{actions?:Action[]})=>{sent.push(structuredClone(input.actions??[]));return {now:500,events:[],results:[]}}} as unknown as World
  const desk=new Dispatcher(world,8,500,map,supply,{portfolio:true,coverage,randomSeed:seed})
  return {desk,sent}
}
function owned(desk:Dispatcher):Order {
  const r=request();desk.requests.set(r.id,r)
  const order:Order={id:r.id,dealerId:r.dealerId,option:'next_day',priceCents:12000,deadline:2640,legs:r.legs,status:'waiting',deliveredAt:[null],lastPickupAt:2400}
  desk.orders.set(r.id,order);return order
}

test('disabled coverage preserves the complete original acquisition frame',()=>{
  const {desk}=setup(drivers,1,false)
  const original=new Original({} as World,8,500,map,drivers,{portfolio:true,randomSeed:1})
  desk.quote(request());original.quote(request())
  assert.deepEqual(desk.buildFrame(),original.buildFrame())
  assert.deepEqual(desk.outbox,original.outbox)
})
test('enabled screening preserves incumbent proposals and logs the acquisition funnel',()=>{
  const {desk}=setup()
  const original=new Original({} as World,8,500,map,drivers,{portfolio:true,randomSeed:1})
  desk.quote(request());original.quote(request())
  assert.deepEqual(desk.buildFrame(),original.buildFrame())
  assert.equal(desk.telemetry.find(x=>x.kind==='acquisition_funnel')!.stage,'incumbent_candidate')
})
test('excluded public requests receive all three randomized arms across fixed seeds',()=>{
  const arms=new Set()
  for(let seed=1;seed<=40;seed++){
    const {desk}=setup([],seed)
    desk.quote(request())
    const row=desk.telemetry.find(x=>x.kind==='acquisition_randomized')!
    assert(row);arms.add(row.arm)
    assert.equal(row.probability,1/3)
    assert.equal(desk.waiting.size,0)
    assert.equal(desk.outbox.length,1)
    assert.equal(desk.pending.size,row.arm==='decline'?0:1)
    desk.quote(request());assert.equal(desk.acquisitionCount,1)
  }
  assert.equal(arms.size,3)
})
test('unknown notes, private work and future arrivals cannot enter exploratory acquisition',()=>{
  for(const kind of ['note','private']){
    const {desk}=setup([]);const r=request()
    if(kind==='note')r.note={language:'en',text:'Call someone; the original address is wrong'}
    else r.legs[0]!.pickup.privateAddress=true
    desk.quote(r);assert.equal(desk.acquisitionCount,0)
  }
  const {desk}=setup([]);const r=request();r.arrivedAt=501
  assert.throws(()=>desk.quote(r),/Future/)
})
test('daily budgets and unresolved exploratory exposure stop further assignments',()=>{
  const {desk}=setup([]);desk.dailyAssignments.set(0,6);desk.quote(request());assert.equal(desk.acquisitionCount,0)
  const other=setup([]).desk
  for(const id of ['a','b']){other.explored.add(id);other.pending.add(id)}
  other.quote(request());assert.equal(other.acquisitionCount,0)
  assert.equal(other.telemetry.find(x=>x.kind==='acquisition_funnel')!.stage,'exposure_limit')
})
test('payment interventions cover direct portfolio actions and batched advances exactly once',async()=>{
  const {desk,sent}=setup();const order=owned(desk)
  const post=desk.singlePost(order)
  await desk.world.act([post]);const fee=post.schedule[0]!.feeCents
  await desk.world.advance({to:501,actions:[post]})
  assert.equal(desk.paymentCount,1);assert.equal(sent[0]![0]!.type,'post')
  assert.equal((sent[1]![0] as typeof post).schedule[0]!.feeCents,fee)
  assert.equal(desk.telemetry.filter(x=>x.kind==='opening_randomized').length,1)
})
test('payment and offer budgets are separate; actual offered fees are recorded',()=>{
  const {desk}=setup();const order=owned(desk);desk.paymentCount=40
  desk.intervene([desk.singlePost(order)])
  assert.equal(desk.paymentCount,40)
  const action:Action={type:'offer',gigId:'g',driverId:'d1',feeCents:1000}
  desk.intervene([action]);assert.equal(desk.offerProbeCount,1)
  const row=desk.telemetry.find(x=>x.kind==='offer_randomized')!
  assert.equal((row.action as typeof action).feeCents,action.feeCents)
})
test('the practice runner takeActions path randomizes batches sent through its external connection',async()=>{
  const {desk}=setup();const order=owned(desk)
  desk.outbox.push(desk.singlePost(order),{type:'offer',gigId:'g',driverId:'d1',feeCents:1000})
  desk.settings.actionGuard=false
  const actions=desk.takeActions()
  assert.equal(desk.paymentCount,1);assert.equal(desk.offerProbeCount,1)
  const transmitted=structuredClone(actions)
  desk.readResults(actions,actions.map(()=>({ok:true,id:'g'})))
  assert.deepEqual(desk.telemetry.filter(x=>x.kind==='action_result').map(x=>x.action),transmitted)
  desk.intervene(actions)
  assert.equal(desk.paymentCount,1);assert.equal(desk.offerProbeCount,1)
})
test('weekly escalation changes only intermediate steps and preserves final rescue',()=>{
  const {desk}=setup();const order=owned(desk);const original=desk.feesFor(order,1)
  desk.settings.escalationDelay=60;const delayed=desk.feesFor(order,1)
  assert.deepEqual(delayed[0],original[0]);assert.deepEqual(delayed.at(-1),original.at(-1))
  assert(delayed[1]!.at>original[1]!.at)
  assert(delayed.every((s,i)=>s.feeCents===original[i]!.feeCents && (!i || s.at>delayed[i-1]!.at)))
  desk.urgent.add(order.id);desk.settings.escalationDelay=0;const urgent=desk.feesFor(order,1);desk.settings.escalationDelay=60
  assert.deepEqual(desk.feesFor(order,1),urgent)
})
test('assignments depend on seed and exposure identity, never unrelated call order',()=>{
  const first=assignment(1,'acquisition','r',3)
  assignment(1,'offer','other',2)
  assert.equal(assignment(1,'acquisition','r',3),first)
  assert.throws(()=>validateSettings({escalationDelay:30}),/regime/)
  assert.throws(()=>validateSettings({coverage:1}),/flag/)
})
