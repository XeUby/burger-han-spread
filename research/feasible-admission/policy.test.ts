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
function setup(feasibleAdmission=true){
 const sent:Action[]=[]
 const world={act:async(actions:Action[])=>{sent.push(...structuredClone(actions));return actions.map(()=>({ok:true}))}} as never
 const desk=new Dispatcher(world,8,500,map,drivers,{portfolio:true,feasibleAdmission})
 const original=new Frozen(world,8,500,map,drivers,{portfolio:true})
 return {desk,original,sent}
}

test('disabled and incumbent-admitted frames preserve the frozen policy',()=>{
 for(const enabled of [false,true]){
  const {desk,original}=setup(enabled)
  for(const id of ['one','two','three']){desk.quote(request(id));original.quote(request(id))}
  assert.deepEqual(desk.buildFrame(),original.buildFrame())
 }
})
test('feasible sparse-supply work reaches the solver with its menu intact',async()=>{
 const {desk,sent}=setup();desk.settings.minDrivers=100
 const r=request();desk.quote(r)
 const proposals=desk.proposals(r);assert.equal(proposals.length,1)
 assert.equal(Object.keys(proposals[0]!.action.prices).length,3)
 assert.equal(proposals[0]!.order.deadline,1200)
 assert(r.legs[0]!.pickup.window.to===4080)
 const frame=desk.buildFrame();assert([...frame.plans.values()].some(p=>p.kind==='quote'))
 const solver=new PortfolioSolver()
 try{const solution=await solver.solve(frame.input);await desk.execute(frame,solution);assert(sent.some(a=>a.type==='quote' && Object.keys(a.prices).length===3))}finally{solver.close()}
})
test('two pending expansion orders block a third until an outcome frees capacity',()=>{
 const {desk}=setup();desk.settings.minDrivers=100
 for(const id of ['one','two']){desk.expansion.add(id);desk.pending.add(id)}
 const r=request();desk.quote(r);assert.equal(desk.proposals(r).length,0)
 desk.pending.delete('one');assert.equal(desk.proposals(r).length,1)
})
test('unbooked awards retain the exposure bound and delivered awards release it',()=>{
 const {desk}=setup();desk.settings.minDrivers=100
 for(const id of ['one','two']){
  const r=request(id);desk.expansion.add(id);desk.requests.set(id,r)
  desk.orders.set(id,{id,dealerId:r.dealerId,option:'next_day',priceCents:12000,deadline:2640,legs:r.legs,status:'waiting',deliveredAt:[null],lastPickupAt:2500})
 }
 const r=request();desk.quote(r);assert.equal(desk.proposals(r).length,0)
 desk.orders.get('one')!.status='delivered';assert.equal(desk.proposals(r).length,1)
})
test('unsupported notes, private stops and future arrivals are not admitted',()=>{
 for(const change of [(r:PriceRequest)=>{r.note={text:'unparsed special instructions',language:'en'}},(r:PriceRequest)=>{r.legs[0]!.pickup.privateAddress=true}]){
  const {desk}=setup();desk.settings.minDrivers=100;const r=request();change(r);desk.quote(r);assert.equal(desk.proposals(r).length,0)
 }
 const {desk}=setup();const r=request();r.arrivedAt=501;assert.throws(()=>desk.quote(r),/Future/)
 assert.throws(()=>validateSettings({feasibleAdmission:1}),/flag/)
})
