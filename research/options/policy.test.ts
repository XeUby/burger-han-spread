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
function setup(optionQuotes=true){
 const sent:Action[]=[]
 const world={act:async(actions:Action[])=>{sent.push(...structuredClone(actions));return actions.map(()=>({ok:true}))}} as never
 const desk=new Dispatcher(world,8,500,map,drivers,{portfolio:true,optionQuotes})
 const original=new Frozen(world,8,500,map,drivers,{portfolio:true})
 return {desk,original,sent}
}

test('disabled option policy preserves the frozen portfolio frame',()=>{
 const {desk,original}=setup(false)
 for(const id of ['one','two','three']){desk.quote(request(id));original.quote(request(id))}
 assert.deepEqual(desk.buildFrame(),original.buildFrame())
})
test('single-option frames preserve frozen behavior',()=>{
 const {desk,original}=setup();const r=request();r.options=r.options.slice(1,2)
 desk.quote(r);original.quote(r)
 assert.deepEqual(desk.buildFrame(),original.buildFrame())
})
test('each proposal uses one consistent deadline, revenue and awarded dealer window',()=>{
 const {desk}=setup();const r=request();const before=structuredClone(r)
 desk.quote(r);const proposals=desk.proposals(r)
 assert.equal(proposals.length,3)
 for(const p of proposals){
  const keys=Object.keys(p.action.prices);assert.equal(keys.length,1)
  const option=r.options.find(o=>o.kind===keys[0])!
  assert.equal(p.order.option,option.kind);assert.equal(p.order.deadline,option.deadline)
  assert.equal(p.order.priceCents,p.action.prices[option.kind])
  for(const leg of p.order.legs)for(const stop of [leg.pickup,leg.delivery])assert.equal(stop.window.to,option.deadline)
 }
 assert.deepEqual(r,before);assert.deepEqual(desk.requests.get(r.id),before)
 assert.equal(desk.pending.size,0)
})
test('option-dependent fulfillment values cannot share a request-only cache',()=>{
 const {desk}=setup();desk.quote(request())
 desk.model=(_r,deadline)=>({early:.8,late:.01,fee:deadline===1200?1000:40000,work:120})
 desk.market.probability=()=>.5
 const frame=desk.buildFrame()
 const cost=(option:string)=>frame.input.alternatives.filter(a=>{const p=frame.plans.get(a.id)!;return p.kind==='quote' && p.action?.type==='quote' && option in p.action.prices}).map(a=>a.outcomes[0]!.fulfillmentCents)
 assert(Math.max(...cost('same_day'))<Math.min(...cost('next_day')))
})
test('real solver chooses at most one option for each request and execution sends that option',async()=>{
 const {desk,sent}=setup();desk.quote(request('one'));desk.quote(request('two'))
 const frame=desk.buildFrame();const solver=new PortfolioSolver()
 try{
  const solution=await solver.solve(frame.input)
  for(const id of ['one','two'])assert.equal(solution.selected.filter(s=>frame.input.alternatives.find(a=>a.id===s)!.claims.includes(id)).length,1)
  await desk.execute(frame,solution)
  const quote=sent.find(a=>a.type==='quote')
  assert(quote?.type==='quote');assert.equal(Object.keys(quote.prices).length,1)
  assert(desk.takeActions().every(a=>a.type!=='quote' || a.requestId!==quote.requestId))
 }finally{solver.close()}
})
test('three requests retain every admitted option alongside six owned obligations',()=>{
 const {desk}=setup();desk.settings.paymentChoice=true
 for(let i=0;i<6;i++){
  const r=request(`owned${i}`);r.arrivedAt=400;r.respondBy=415
  r.legs[0]!.pickup.placeId='b';r.legs[0]!.delivery.placeId='a'
  desk.requests.set(r.id,r)
  const order={id:r.id,dealerId:r.dealerId,option:'next_day' as const,priceCents:12000,deadline:2640,legs:r.legs,status:'waiting' as const,deliveredAt:[null],lastPickupAt:2500}
  desk.orders.set(r.id,order)
  desk.held.set(r.id,{post:{...desk.singlePost(order),schedule:desk.feesFor(order,1,false)},at:480})
 }
 for(const id of ['one','two','three'])desk.quote(request(id))
 const frame=desk.buildFrame()
 assert(frame.input.alternatives.length>120)
 assert(frame.input.alternatives.length<=360);assert.equal(frame.omitted,0)
 for(const id of ['one','two','three'])for(const kind of ['same_day','next_day','within_3_days']){
  assert([...frame.plans.values()].some(p=>p.request?.id===id && p.kind==='quote' && p.action?.type==='quote' && kind in p.action.prices))
 }
 assert.equal(frame.input.mandatory.length,9)
})
test('future arrivals and invalid settings cannot silently enter option selection',()=>{
 const {desk}=setup();const r=request();r.arrivedAt=501
 assert.throws(()=>desk.quote(r),/Future/)
 assert.throws(()=>validateSettings({optionQuotes:1}),/flag/)
})
