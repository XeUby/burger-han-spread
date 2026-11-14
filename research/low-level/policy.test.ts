import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Dispatcher} from './bundle/src/policy.ts'
import {Dispatcher as Control} from '../ranked-levels/bundle/src/policy.ts'
import type {World} from './bundle/vendor/typescript/spread.ts'
import type {World as ControlWorld} from '../ranked-levels/bundle/vendor/typescript/spread.ts'
import type {DriverProfile,PriceRequest,WorldMap} from './bundle/vendor/typescript/types.ts'
const map:WorldMap={places:[],roads:['a','b'].flatMap(from=>['a','b'].map(to=>({from,to,km:from===to?10:100,minutes:from===to?15:80})))}
const drivers:DriverProfile[]=Array.from({length:100},(_,i)=>({id:`d${i}`,homePlaceId:'a',rating:4.9,licence:'manual',completedGigs:100,drops:0}))
function request():PriceRequest{
 const place={privateAddress:false,hours:{opens:480,closes:1200,weekdays:[0,1,2,3,4],saturday:null},window:{from:500,to:2640}}
 return {id:'r',dealerId:'d',batchId:null,arrivedAt:500,respondBy:515,note:null,referenceFeeCents:6000,legs:[{car:{premium:false,electric:false,chargePercent:null},pickup:{...place,placeId:'a'},delivery:{...place,placeId:'b'}}],options:[{kind:'same_day',deadline:650,listPriceCents:11000},{kind:'next_day',deadline:2640,listPriceCents:10000}]}
}
test('first-option rule rejects a later-only feasible request below level4',()=>{
 for(const level of [1,2,3]){
  const a=new Dispatcher({} as World,level,500,map,drivers,{firstOptionOnly:true})
  const b=new Control({} as ControlWorld,level,500,map,drivers)
  a.quote(request());b.quote(request())
  assert.equal(a.outbox.length,0)
  assert(b.outbox.some(x=>x.type==='quote'&&x.prices.next_day))
 }
})
test('opening-cost admission changes acceptance without cutting the driver fee',()=>{
 const r=request();r.options=[{kind:'same_day',deadline:1200,listPriceCents:7000}]
 const a=new Dispatcher({} as World,1,500,map,drivers,{firstOptionOnly:true,openingCostAdmission:true})
 const b=new Control({} as ControlWorld,1,500,map,drivers)
 a.quote(r);b.quote(r)
 assert.equal(b.outbox.length,0);assert.equal(a.outbox[0]?.type,'quote')
 assert.equal(a.baseFee(r),b.baseFee(r))
 const order={id:r.id,dealerId:r.dealerId,option:'same_day' as const,priceCents:7000,deadline:1200,lastPickupAt:1000,legs:r.legs,status:'waiting' as const,deliveredAt:[null]}
 a.requests.set(r.id,r);b.requests.set(r.id,r)
 assert.deepEqual(a.feesFor(order,1),b.feesFor(order,1))
})
test('both switches leave competitive-level quotes unchanged',()=>{
 for(const level of [4,5,6,7,8]){
  const a=new Dispatcher({} as World,level,500,map,drivers,{firstOptionOnly:true,openingCostAdmission:true})
  const b=new Control({} as ControlWorld,level,500,map,drivers)
  a.quote(request());b.quote(request());assert.deepEqual(a.outbox,b.outbox)
 }
})
test('disabled switches retain lower-level quote behavior',()=>{
 for(const level of [1,2,3]){
  const a=new Dispatcher({} as World,level,500,map,drivers)
  const b=new Control({} as ControlWorld,level,500,map,drivers)
  a.quote(request());b.quote(request());assert.deepEqual(a.outbox,b.outbox)
 }
})
