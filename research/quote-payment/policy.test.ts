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
function setup(defaultQuotePayment=true){
 const sent:Action[]=[]
 const world={act:async(actions:Action[])=>{sent.push(...structuredClone(actions));return actions.map(()=>({ok:true}))}} as never
 const desk=new Dispatcher(world,8,500,map,drivers,{portfolio:true,defaultQuotePayment})
 const original=new Frozen(world,8,500,map,drivers,{portfolio:true})
 return {desk,original,sent}
}

test('disabled policy preserves the frozen frame',()=>{
 const {desk,original}=setup(false);desk.settings.paymentChoice=true;original.settings.paymentChoice=true
 desk.quote(request());original.quote(request());assert.deepEqual(desk.buildFrame(),original.buildFrame())
})
test('filter removes only premium quote alternatives and retains every baseline',()=>{
 const {desk,original}=setup();desk.settings.paymentChoice=true;original.settings.paymentChoice=true
 for(const policy of [desk,original]){
  const r=request('owned');policy.requests.set(r.id,r)
  const order={id:r.id,dealerId:r.dealerId,option:'next_day' as const,priceCents:12000,deadline:2640,legs:r.legs,status:'waiting' as const,deliveredAt:[null],lastPickupAt:2500}
  policy.orders.set(r.id,order);policy.held.set(r.id,{post:{...policy.singlePost(order),schedule:policy.feesFor(order,1,false)},at:480})
 }
 desk.quote(request());original.quote(request())
 const before=original.buildFrame(),after=desk.buildFrame()
 const removed=new Set([...before.plans].filter(([,p])=>p.kind==='quote' && (p.multiplier??1)>1).map(([id])=>id))
 assert(removed.size>0)
 before.input.alternatives=before.input.alternatives.filter(a=>!removed.has(a.id));for(const id of removed)before.plans.delete(id)
 assert.deepEqual(after,before)
 assert(after.input.baseline.every(id=>after.plans.has(id)))
 assert([...after.plans.values()].some(p=>p.kind==='fulfill' && (p.multiplier??1)>1))
})
test('real solver executes a default-payment menu quote',async()=>{
 const {desk,sent}=setup();desk.settings.paymentChoice=true;desk.quote(request())
 const frame=desk.buildFrame(),solver=new PortfolioSolver()
 try{const result=await solver.solve(frame.input);await desk.execute(frame,result);assert(sent.some(a=>a.type==='quote' && Object.keys(a.prices).length>1));assert([...frame.plans.values()].filter(p=>p.kind==='quote').every(p=>p.multiplier===1))}finally{solver.close()}
})
