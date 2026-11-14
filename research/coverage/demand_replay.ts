import {readFile,writeFile} from 'node:fs/promises'
import {DemandModel} from '../../runs/frozen/coverage-development-v1/src/optimizer.ts'
const read=async(path:string)=>JSON.parse(await readFile(path,'utf8'))
const report=await read('docs/coverage-development-v2-results.json')
const exposures=(await read('docs/coverage-development-v2-exposures.json')).rows
const rows=[]
for(const record of report.records){
  const world=record.worldId
  const decisions=await read(`runs/${world}.decisions.json`),events=await read(`runs/${world}.events.json`),meta=await read(`runs/${world}.meta.json`)
  const requests=new Map<string,any>(events.filter((e:any)=>e.kind==='price_request').map((e:any)=>[e.request.id,e.request]))
  const quotes=new Map<string,{at:number;ratio:number;features:any}>()
  let plans:any[]=[]
  for(const d of decisions){
    if(d.kind==='portfolio_solve')plans=Object.values(d.plans)
    if(d.kind==='acquisition_randomized' && d.arm!=='decline')quotes.set(d.requestId,{at:d.at,ratio:d.priceCents/d.listPriceCents,features:d.features})
    if(d.kind!=='action_result' || d.action.type!=='quote' || !d.result?.ok || Object.values(d.action.prices).every((p:any)=>p>=100_000_000))continue
    if(quotes.has(d.action.requestId))continue
    const plan=plans.find(p=>p.kind==='quote' && JSON.stringify(p.action)===JSON.stringify(d.action))
    if(!plan || !Number.isFinite(plan.ratio))throw new Error(`Unreconstructed substantive quote ${world}:${d.action.requestId}`)
    const request=requests.get(d.action.requestId),leg=request.legs[0]
    const feature=exposures.find((x:any)=>x.worldId===world && x.requestId===request.id)?.features
    const road=(await read('docs/map.json')).roads.find((r:any)=>r.from===leg.pickup.placeId && r.to===leg.delivery.placeId)
    quotes.set(request.id,{at:d.at,ratio:plan.ratio,features:feature??{day:Math.floor(request.arrivedAt/1440),origin:leg.pickup.placeId,destination:leg.delivery.placeId,dealer:request.dealerId,km:road.km}})
  }
  const model=new DemandModel({threshold:1.4,slope:meta.settings.demandSlope})
  let observed=0
  for(const event of events){
    if(event.kind==='price_request'){
      const row=exposures.find((r:any)=>r.worldId===world && r.kind==='acquisition_randomized' && r.requestId===event.request.id)
      if(row && row.arm!=='decline'){
        if(row.at!==event.at)throw new Error('Acquisition decision was not at arrival; replay boundary needs review')
        rows.push({worldId:world,seed:row.seed,requestId:row.requestId,eventSeq:event.seq,at:row.at,observationsBefore:observed,probability:model.probability(row.features,row.priceCents/row.listPriceCents)})
      }
    }
    if(event.kind==='order_won' || event.kind==='order_lost'){
      const id=event.kind==='order_won'?event.order.id:event.requestId,quote=quotes.get(id)
      if(quote){
        if(quote.at>=event.at)throw new Error('Ambiguous quote/outcome ordering')
        model.observe(quote.features,quote.ratio,event.kind==='order_won');quotes.delete(id);observed++
      }
    }
  }
}
await writeFile('docs/coverage-demand-replay.json',JSON.stringify({scope:'Frozen demand-model response predictions at exploratory arrival, before processing that request outcome. Updates use exact recorded selected-plan ratios and successful substantive quote actions; artificial declines are excluded.',rows},null,2)+'\n')
console.log(JSON.stringify({predictions:rows.length}))
