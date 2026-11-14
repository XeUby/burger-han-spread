import { Dispatcher as Mechanisms, defaults as baseDefaults, validateSettings as validateBase } from "../value/policy.ts"
import type { Settings as BaseSettings } from "../value/policy.ts"
import { PortfolioSolver } from "./bridge.ts"
import type { Outcome, Portfolio, Solution } from "./bridge.ts"
import { features, prediction } from "./models.ts"
import { planBundles } from "../../src/bundles.ts"
import type { BundleCandidate, BundlePlan } from "../../src/bundles.ts"
import { requestFeasibility } from "../../src/admission.ts"
import type { World } from "../../vendor/typescript/spread.ts"
import type { Action, ActionResult, DeskEvent, DriverProfile, Order, PostAction, PriceRequest, WorldMap } from "../../vendor/typescript/types.ts"

export type Settings = BaseSettings & { portfolio: boolean; futureValue: boolean; paymentChoice: boolean }
export const defaults: Settings = { ...baseDefaults, portfolio: false, futureValue: false, paymentChoice: false }
export function validateSettings(value: unknown): asserts value is Partial<Settings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid portfolio configuration")
  const base: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    if (["portfolio", "futureValue", "paymentChoice"].includes(key)) { if (typeof v !== "boolean") throw new Error(`Invalid ${key}`) }
    else base[key] = v
  }
  validateBase(base)
}

type Owned = { order: Order; post: PostAction; gigId?: string; due: number }
type Model = { early: number; late: number; fee: number; work: number }
type Plan = { kind: "keep" | "fulfill" | "quote" | "decline"; due: number; owned: Owned[]; request?: PriceRequest; action?: Action; ratio?: number; multiplier?: number; anchor?: string; referencePrices?: Record<string,number|undefined> }
type Frame = { input: Portfolio; plans: Map<string, Plan>; omitted: number }
const SHOCKS = [-.04, .04].flatMap(competition => [-.05, .05].flatMap(supply => [0, 4].map(elasticity => ({ competition, supply, elasticity }))))
const clamp = (x: number, low: number, high: number) => Math.max(low, Math.min(high, x))

export class Dispatcher extends Mechanisms {
  declare settings: Settings
  waiting = new Map<string, PriceRequest>()
  reservations = new Map<string, string>()
  blockedAnchors = new Map<string, number>()
  profiles = new Map<string, Model>()
  neutralized = new Set<string>()
  solver?: PortfolioSolver
  solverCalls = 0

  constructor(world: World, level: number, now: number, map: WorldMap, drivers: DriverProfile[], settings: Partial<Settings> = {}) {
    validateSettings(settings)
    super(world, level, now, map, drivers, Object.fromEntries(Object.entries(settings).filter(([key]) => key in baseDefaults)))
    this.settings = { ...defaults, ...settings }
  }

  override quote(request: PriceRequest, immediate = false): void {
    if (!this.settings.portfolio) return super.quote(request, immediate)
    if(request.arrivedAt>this.now) throw new Error("Future request supplied to live planner")
    this.requests.set(request.id, request)
    if (request.respondBy > this.now && !this.quoted.has(request.id) && !this.waiting.has(request.id)) {
      this.waiting.set(request.id, request)
      if(this.level>=4) this.outbox.push({type:"quote",requestId:request.id,prices:{[request.options[0]!.kind]:100_000_000}})
    }
  }

  override flushBundles(): void { if (!this.settings.portfolio) super.flushBundles() }
  override nextDecisionAt(): number {
    if(!this.settings.portfolio) return super.nextDecisionAt()
    return Math.min(this.now+30,this.waiting.size ? this.now+1 : Infinity,...[...this.held].map(([id,h])=>Math.max(this.now+1,this.holdDue(id,h.at))))
  }
  closeSolver(): void { this.solver?.close(); this.solver = undefined }
  bundlePlans(now: number, candidates: BundleCandidate[]): BundlePlan[] {
    return planBundles(now, candidates, this.network)
  }
  holdDue(id: string, at: number): number {
    const request=this.reservations.get(id)
    return Math.max(at+this.settings.bundleWait,request && this.pending.has(request) ? this.requests.get(request)!.respondBy+1 : 0)
  }

  override async tick(): Promise<void> {
    if (!this.settings.portfolio) return super.tick()
    for (const [id, request] of this.waiting) if (request.respondBy <= this.now) {
      this.waiting.delete(id)
      this.telemetry.push({ kind: "portfolio_baseline_expired", at: this.now, requestId: id })
      if(this.level>=4 && !this.neutralized.has(id)) throw new Error("Portfolio left a request unanswered before its deadline")
    }
    if (this.held.size > 6) {
      const [id] = [...this.held].sort((a,b) => a[1].at-b[1].at)[0]!
      this.telemetry.push({ kind: "portfolio_overflow", at: this.now, orderId: id })
      await super.sendPostOf(id)
    }
    if (this.waiting.size || [...this.held].some(([id,h]) => this.holdDue(id,h.at)<=this.now)) {
      const frame = this.buildFrame()
      if (frame.input.alternatives.length) {
        const at = this.now, seq = this.lastSeq
        this.solver ??= new PortfolioSolver()
        const result = await this.solver.solve(frame.input)
        this.solverCalls++
        this.telemetry.push({ kind: "portfolio_solve", at, input: frame.input, plans:Object.fromEntries([...frame.plans].map(([id,p])=>[id,{kind:p.kind,due:Number.isFinite(p.due)?p.due:null,requestId:p.request?.id,owned:p.owned.map(o=>o.order.id),action:p.action,ratio:p.ratio,multiplier:p.multiplier,anchor:p.anchor,referencePrices:p.referencePrices}])), result, omitted: frame.omitted })
        if (at !== this.now || seq !== this.lastSeq) throw new Error("State changed while the portfolio was solving")
        await this.execute(frame, result)
      }
    }
    await super.tick()
  }

  model(request: PriceRequest, deadline: number): Model {
    const key = `${request.id}:${deadline}:${request.legs[0]!.pickup.placeId}:${request.legs[0]!.delivery.placeId}`
    let m = this.profiles.get(key)
    if (!m) {
      const x = features(this, request, deadline), leg = request.legs[0]!
      m = { early: prediction("booking120", x), late: prediction("late", x), fee: this.baseFee(request), work: 45+this.network.minutes(leg.pickup.placeId,leg.delivery.placeId)*1.15 }
      this.profiles.set(key, m)
    }
    return m
  }

  owned(requests: PriceRequest[]): Owned[] {
    const held = [...this.held].map(([id, h]) => ({ order: this.orders.get(id)!, post: { ...h.post, schedule: this.payoutSchedule(h.post.schedule, true) }, due: this.holdDue(id,h.at) }))
      .filter(o => o.order && o.order.status !== "cancelled" && o.order.status !== "delivered")
      .sort((a,b) => a.due-b.due).slice(0,6)
    const open = [...this.posts].flatMap(([gigId, post]) => {
      const order = this.orders.get(post.stops[0]!.orderId)
      if (!order || order.legs.length!==1 || order.status !== "waiting" || post.stops.length !== 2 || this.booked.has(gigId) || this.legGigs.get(order.id)?.get(0)!==gigId || (this.blockedAnchors.get(gigId) ?? 0)>this.now || order.lastPickupAt < this.now+360) return []
      return [{ order, post, gigId, due: Infinity }]
    })
    const distance = (o: Owned) => Math.min(Infinity, ...requests.map(r => this.network.km(o.order.legs[0]!.delivery.placeId,r.legs[0]!.pickup.placeId)), ...held.map(h => this.network.km(o.order.legs[0]!.delivery.placeId,h.order.legs[0]!.pickup.placeId)))
    open.sort((a,b) => distance(a)-distance(b))
    return [...held, ...open.filter(o => distance(o)<=70).slice(0,6-held.length)]
  }

  proposal(request: PriceRequest): { action: Extract<Action,{type:"quote"}>; order: Order; ratio: number } | null {
    const old = this.settings
    this.settings = { ...old, capacity: .9, backlog: 100, auction: false }
    const start = this.outbox.length
    try { super.quote(request, true) } finally { this.settings = old }
    const action = this.outbox.splice(start).find(a => a.type === "quote")
    const bid = this.bids.get(request.id)
    const admitted = this.pending.has(request.id)
    this.quoted.delete(request.id); this.pending.delete(request.id); this.bids.delete(request.id)
    if (!admitted || action?.type !== "quote" || request.legs.length!==1) return null
    const options = request.options.filter(o => o.kind in action.prices)
    const deadline = Math.min(...options.map(o => o.deadline))
    const feasible = requestFeasibility(this.plannedRequest(request), deadline, this.network, this.settings)
    if (!feasible) return null
    return { action, ratio: bid?.ratio ?? this.settings.price, order: { id: request.id, dealerId: request.dealerId, option: options[0]!.kind, priceCents: Math.min(...Object.values(action.prices) as number[]), deadline, legs: request.legs, status: "waiting", deliveredAt: [null], lastPickupAt: feasible.latestPickupAt } }
  }

  proposals(request: PriceRequest): NonNullable<ReturnType<Dispatcher["proposal"]>>[] {
    const proposal = this.proposal(request)
    return proposal ? [proposal] : []
  }

  alternativeLimit(): number { return 120 }

  buildFrame(): Frame {
    const requests = [...this.waiting.values()].sort((a,b) => a.respondBy-b.respondBy).slice(0,3)
    const owned = this.owned(requests), plans = new Map<string, Plan>()
    const input: Portfolio = { now: this.now, weights: SHOCKS.map(() => 1), capacity: SHOCKS.map(() => ({})), lateBudget: SHOCKS.map(() => 0), mandatory: [], baseline: [], alternatives: [] }
    let omitted = Math.max(0,this.waiting.size-requests.length)
    const excluded = new Set(owned.map(o => o.order.id))
    const resourceMap = new Map<string,{place:string;kind:string;day:number;key:string}>()
    for (const leg of [...requests.map(r=>r.legs[0]!),...owned.map(o=>o.order.legs[0]!)]) for(const kind of ["daily","backlog"]) {
      const day=Math.floor((kind==="daily" ? leg.pickup.window.from : Math.max(this.now,leg.pickup.window.from))/1440)
      const key=`${kind}:${leg.pickup.placeId}:${day}`
      resourceMap.set(key,{place:leg.pickup.placeId,kind,day,key})
    }
    const resources=[...resourceMap.values()]
    const reserved = (id: string) => this.pending.has(this.reservations.get(id) ?? "")
    const resourceUse = (orders: { order: Order; chance: number }[], routeFactor=1): Record<string,number> => Object.fromEntries(resources.map(r => [r.key, Math.round(orders.reduce((sum, o) => {
      const leg = o.order.legs[0]!, km = this.network.km(r.place,leg.pickup.placeId)
      const due = Math.floor((r.kind==="daily" ? leg.pickup.window.from : Math.max(this.now,leg.pickup.window.from))/1440)
      return sum + (due===r.day ? (km<=30 ? 1 : km<=70 ? .5 : 0)*o.chance*(r.kind==="backlog" ? routeFactor : 1) : 0)
    },0)*1000)]))
    const feeOptions = this.settings.paymentChoice ? [1,1.08] : [1]
    const pay = (post: PostAction, multiplier: number) => ({ ...post, schedule: post.schedule.map((step,i) => ({ ...step, feeCents: i===0 ? Math.min(post.schedule[1]?.feeCents ?? Infinity, Math.round(step.feeCents*multiplier)) : step.feeCents })) })
    const futures=new Map<string,number>(), supply=new Map<string,number>()
    const future = (order: Order, m: Model): number => {
      if(!futures.has(order.id)) futures.set(order.id,this.settings.futureValue ? this.futureCost(order,m) : 0)
      return futures.get(order.id)!
    }
    const costs=new Map<string,{cost:number;late:number;future:number;early:number;work:number}>()
    const fulfillment = (order: Order, post: PostAction, multiplier: number, s: number) => {
      const key=`${order.id}:${order.option}:${order.deadline}:${multiplier}:${s}`
      const cached=costs.get(key)
      if(cached) return cached
      const request = {...this.requests.get(order.id)!,legs:order.legs}, m = this.model(request,order.deadline), shock = SHOCKS[s]!
      if(!supply.has(order.id)) supply.set(order.id,this.capacityState(request).fastProbability)
      const online = supply.get(order.id)!
      const early = clamp(m.early+(online-.8962461200231321)*.5+shock.supply, .05, .99)
      const improved = clamp(early+shock.elasticity*(multiplier-1)*early*(1-early), .05, .995)
      const shown = (post.schedule.findLast(f => f.at<=this.now) ?? post.schedule[0]!).feeCents
      const cost = Math.max(shown, m.fee*this.settings.costRatio) + shown*(multiplier-1)*improved - m.fee*1.2*(improved-early)
      const urgency = clamp((this.now+120-order.lastPickupAt)/360,0,.9)
      const late = clamp(Math.max(urgency,m.late*(1+(1-early)*2)) * Math.exp(-shock.elasticity*(multiplier-1)), .002,.95)
      const result={ cost, late, future: future(order,m), early: improved, work: m.work }
      costs.set(key,result)
      return result
    }
    const add = (claims: string[], plan: Plan, outcomes: Outcome[], baseline=false) => {
      if (input.alternatives.length>=this.alternativeLimit() && !baseline) { omitted++; return }
      const id = `p${input.alternatives.length}`
      input.alternatives.push({ id, observedAt: this.now, claims, outcomes }); plans.set(id,plan)
      if (baseline) input.baseline.push(id)
    }
    const blank = (): Outcome => ({ revenueCents: 0, fulfillmentCents: 0, refundCents: 0, penaltyCents: 0, futureCents: 0, capacity: {}, late: 0 })
    const ownedOutcomes = (items: Owned[], multiplier: number, route?: BundlePlan): Outcome[] => SHOCKS.map((_,s) => {
      const parts = items.map(o => fulfillment(o.order,o.post,multiplier,s))
      const saving = route ? Math.min(route.feeSavingCents,parts.reduce((n,p)=>n+p.cost,0)*.15) : 0
      const probabilities=parts.map(p=>Math.min(.99,p.late*(route ? 1.15 : 1)))
      const failure=probabilities.map(p=>Math.min(.02,p*.02))
      return { revenueCents:Math.round(items.reduce((sum,o,i)=>sum+o.order.priceCents*(1-failure[i]!),0)), fulfillmentCents: Math.round(parts.reduce((sum,p)=>sum+p.cost,0)-saving), refundCents: Math.round(items.reduce((sum,o,i)=>sum+(probabilities[i]!-failure[i]!)*o.order.priceCents*.4,0)), penaltyCents:Math.round(items.reduce((sum,o,i)=>sum+2*o.order.priceCents*failure[i]!,0)), futureCents: -Math.round(parts.reduce((sum,p)=>sum+p.future,0)*(route ? .85 : 1)), capacity: resourceUse(items.map(o=>({order:o.order,chance:1})),route ? .85 : 1), late: Math.round(probabilities.reduce((a,b)=>a+b,0)*10000) }
    })
    for (const o of owned) {
      input.mandatory.push(o.order.id)
      add([o.order.id],{kind:"keep",due:o.due,owned:[o],action:o.gigId ? undefined : o.post},ownedOutcomes([o],1),true)
    }
    for (const request of requests) {
      input.mandatory.push(request.id)
      add([request.id],{kind:"decline",due:request.respondBy-1,owned:[],request,action:this.level>=4 ? {type:"quote",requestId:request.id,prices:{[request.options[0]!.kind]:100_000_000}} : undefined},SHOCKS.map(blank),true)
    }
    for (let a=0;a<owned.length;a++) for (let b=a+1;b<owned.length;b++) {
      const items=[owned[a]!,owned[b]!]
      if (this.level<3 || items.every(o=>o.gigId) || items.some(o=>reserved(o.order.id))) continue
      const route=this.bundlePlans(this.now,items.map(o=>({order:o.order,post:o.post,noteSafe:this.noteRules(this.requests.get(o.order.id)).safe})))[0]
      if (route) for (const multiplier of feeOptions) add(items.map(o=>o.order.id),{kind:"fulfill",due:Math.min(...items.map(o=>o.due)),owned:items,action:pay(route.post,multiplier),multiplier},ownedOutcomes(items,multiplier,route))
    }
    for (const o of owned.filter(o=>!o.gigId)) for (const multiplier of feeOptions.filter(m=>m!==1)) add([o.order.id],{kind:"fulfill",due:o.due,owned:[o],action:pay(o.post,multiplier),multiplier},ownedOutcomes([o],multiplier))
    for (const request of requests) for (const proposal of this.proposals(request)) {
      const order=proposal.order, post=this.singlePost(order)
      const choices: { anchor?:Owned; route?:BundlePlan }[]=[{}]
      for (const anchor of owned) {
        if (this.level<3 || reserved(anchor.order.id)) continue
        const route=this.bundlePlans(request.respondBy,[{order:anchor.order,post:anchor.post,noteSafe:this.noteRules(this.requests.get(anchor.order.id)).safe},{order,post,noteSafe:true}])[0]
        if (route) choices.push({anchor,route})
      }
      const best=choices.slice(1).sort((a,b)=>b.route!.feeSavingCents-a.route!.feeSavingCents).slice(0,2)
      for (const choice of [choices[0]!,...best]) for (const multiplier of feeOptions) {
        const trust=1+this.settings.trustStep*Math.min(25,this.trust.get(request.dealerId) ?? 0)
        let cost=0,loss=0
        for(let s=0;s<SHOCKS.length;s++) {
          const own=fulfillment(order,post,multiplier,s),old=choice.anchor ? fulfillment(choice.anchor.order,choice.anchor.post,1,s) : null
          const survival=choice.anchor?.gigId ? Math.pow(Math.max(.01,1-old!.early),Math.max(0,request.respondBy-this.now)/120) : 1
          const saving=choice.route ? Math.min(choice.route.feeSavingCents,(own.cost+(old?.cost ?? 0))*.15) : 0
          cost+=own.cost+own.future-survival*(saving+(choice.route ? .15*(own.future+(old?.future ?? 0)) : 0))+survival*(choice.route ? .15*(old?.late ?? 0)*(choice.anchor?.order.priceCents ?? 0)*.46 : 0)
          loss+=Math.min(.8,own.late*(choice.route ? 1+.15*survival : 1)*.46)
        }
        const center=this.market.optimize(this.features(request),{costCents:Math.max(1,cost/SHOCKS.length)/(1-loss/SHOCKS.length),listPriceCents:Math.min(...request.options.filter(o=>o.kind in proposal.action.prices).map(o=>o.listPriceCents)),trust,minPrice:1}).ratio
        for(const ratio of new Set([proposal.ratio,center*.96,center,center*1.04])) {
        const prices=Object.fromEntries(request.options.filter(o=>o.kind in proposal.action.prices).map(o=>[o.kind,Math.ceil(o.listPriceCents*trust*ratio)]))
        const revenue=this.level<4 ? request.options[0]!.listPriceCents : Math.min(...Object.values(prices))
        const outcomes=SHOCKS.map((shock,s) => {
          const win=this.level<4 ? 1 : this.market.probability(this.features(request),ratio+shock.competition)
          const own=fulfillment(order,post,multiplier,s)
          const old=choice.anchor ? fulfillment(choice.anchor.order,choice.anchor.post,1,s) : null
          const survival=choice.anchor?.gigId ? Math.pow(Math.max(.01,1-old!.early),Math.max(0,request.respondBy-this.now)/120) : 1
          const success=win*survival
          const saving=choice.route ? Math.min(choice.route.feeSavingCents,(own.cost+(old?.cost ?? 0))*.15) : 0
          const newLate=Math.min(.99,own.late*(choice.route ? 1+.15*survival : 1)),oldLate=Math.min(.99,(old?.late ?? 0)*(choice.route ? 1+.15*success : 1))
          const newFailure=Math.min(.02,newLate*.02),oldFailure=Math.min(.02,oldLate*.02),oldRevenue=choice.anchor?.order.priceCents ?? 0
          const late=win*newLate+oldLate
          const capacity=resourceUse([{order,chance:Math.min(1,win+.5*Math.sqrt(win*(1-win)))},...(choice.anchor ? [{order:choice.anchor.order,chance:1}] : [])],choice.route ? 1-.15*success : 1)
          return {revenueCents:Math.round(win*revenue*(1-newFailure)+oldRevenue*(1-oldFailure)),fulfillmentCents:Math.round(win*own.cost+(old?.cost ?? 0)-success*saving),refundCents:Math.round(win*(newLate-newFailure)*revenue*.4+(oldLate-oldFailure)*oldRevenue*.4),penaltyCents:Math.round(2*win*revenue*newFailure+2*oldRevenue*oldFailure),futureCents:-Math.round(win*own.future+(old?.future ?? 0)-success*(choice.route ? .15*(own.future+(old?.future ?? 0)) : 0)),capacity,late:Math.round(late*10000)}
        })
        add([request.id,...(choice.anchor ? [choice.anchor.order.id] : [])],{kind:"quote",due:request.respondBy-1,owned:choice.anchor ? [choice.anchor] : [],request,action:{type:"quote",requestId:request.id,prices},ratio,multiplier,anchor:choice.anchor?.order.id,referencePrices:proposal.action.prices},outcomes)
        }
      }
    }
    for (const r of resources) {
      const request=requests.find(q=>q.legs[0]!.pickup.placeId===r.place) ?? this.requests.get(owned.find(o=>o.order.legs[0]!.pickup.placeId===r.place)!.order.id)!
      let used=0
      for (const other of this.requests.values()) {
        if (excluded.has(other.id)) continue
        const order=this.orders.get(other.id), pending=this.pending.has(other.id)
        if (!pending && (!order || order.status==="cancelled")) continue
        const leg=order?.legs[0] ?? other.legs[0]!, km=this.network.km(r.place,leg.pickup.placeId)
        if (Math.floor((r.kind==="daily" ? leg.pickup.window.from : Math.max(this.now,leg.pickup.window.from))/1440)!==r.day) continue
        if (r.kind==="backlog" && !pending && (order?.status==="delivered" || this.gigsOf(other.id).some(g=>this.booked.has(g)))) continue
        used+=km<=30 ? 1 : km<=70 ? .5 : 0
      }
      const limit=Math.max(r.kind==="daily" ? 1 : 2,this.supply(request)*(r.kind==="daily" ? this.settings.capacity : this.settings.backlog)*1.5)
      for (let s=0;s<SHOCKS.length;s++) {
        const baseline=input.alternatives.filter(c=>input.baseline.includes(c.id)).reduce((sum,c)=>sum+(c.outcomes[s]!.capacity[r.key] ?? 0),0)
        input.capacity[s]![r.key]=Math.max(baseline,Math.floor((limit-used)*1000))
      }
    }
    const won=this.orders.size
    const lateDelivered=[...this.orders.values()].filter(o=>o.status==="delivered" && o.deliveredAt.some(at=>at!==null && at>o.deadline)).length
    const outside=[...this.orders.values()].filter(o=>!excluded.has(o.id) && o.status!=="delivered" && o.status!=="cancelled")
    const existingRisk=outside.reduce((sum,o)=>sum+this.model({...this.requests.get(o.id)!,legs:o.legs},o.deadline).late*(this.gigsOf(o.id).some(g=>this.booked.has(g)) ? .3 : 1),0)+[...this.pending].reduce((sum,id)=>{
      const request=this.requests.get(id)!,bid=this.bids.get(id)
      return sum+this.model(request,Math.min(...request.options.map(o=>o.deadline))).late*(bid ? this.market.probability(bid.features,bid.ratio) : 1)
    },0)
    for(let s=0;s<SHOCKS.length;s++) {
      const baseline=input.alternatives.filter(c=>input.baseline.includes(c.id)).reduce((sum,c)=>sum+c.outcomes[s]!.late,0)
      input.lateBudget[s]=Math.max(baseline,Math.floor(Math.max(0,.06*(20+won)-lateDelivered-existingRisk)*10000))
    }
    return { input, plans, omitted }
  }

  futureCost(order: Order, model: Model): number {
    const request=this.requests.get(order.id)!, state=this.capacityState(request), place=order.legs[0]!.pickup.placeId
    const observed=[...this.requests.values()].filter(r=>r.arrivedAt<=this.now && this.now-r.arrivedAt<=180)
    const nearby=observed.filter(r=>this.network.km(place,r.legs[0]!.pickup.placeId)<=70).slice(-20)
    const margin=nearby.reduce((sum,r)=>sum+Math.max(0,Math.min(...r.options.map(o=>o.listPriceCents))*1.1-this.baseFee(r)*this.settings.costRatio),0)
    const work=nearby.reduce((sum,r)=>sum+45+this.network.minutes(r.legs[0]!.pickup.placeId,r.legs[0]!.delivery.placeId)*1.15,0)
    const rate=clamp(margin/Math.max(1,work),0,40)*clamp(state.utilization-.5,0,1)
    const destination=observed.filter(r=>this.network.km(order.legs[0]!.delivery.placeId,r.legs[0]!.pickup.placeId)<=30).length
    return Math.round(model.work*rate*(1-.2*destination/Math.max(1,nearby.length+destination)))
  }

  async execute(frame: Frame, solution: Solution): Promise<void> {
    const plans=solution.selected.map(id=>frame.plans.get(id)!).filter(p=>p.kind==="quote" || p.kind==="decline" || p.due<=this.now)
      .sort((a,b)=>a.due-b.due)
    const plan=plans[0]
    if (!plan) return
    if (plan.request && (plan.request.respondBy<=this.now || !this.waiting.has(plan.request.id))) throw new Error("Stale quote plan")
    for (const o of plan.owned) if (o.gigId && (this.booked.has(o.gigId) || this.legGigs.get(o.order.id)?.get(0)!==o.gigId)) throw new Error("Stale anchor plan")
    if (plan.kind==="fulfill") {
      const open=plan.owned.find(o=>o.gigId)
      if (open?.gigId) {
        const action:Action={type:"withdraw",gigId:open.gigId}
        const results=await this.world.act([action]);this.readResults([action],results)
        this.telemetry.push({kind:"portfolio_withdraw",at:this.now,action,result:results[0]})
        if(results[0]?.ok) this.held.set(open.order.id,{post:{...open.post,schedule:this.feesFor(open.order,1,false)},at:this.now-this.settings.bundleWait})
        else this.blockedAnchors.set(open.gigId,this.now+15)
        return
      }
    }
    if (plan.request) {
      for(let i=this.outbox.length-1;i>=0;i--) if(this.outbox[i]!.type==="quote" && (this.outbox[i] as Extract<Action,{type:"quote"}>).requestId===plan.request.id) this.outbox.splice(i,1)
      this.quoted.add(plan.request.id);this.waiting.delete(plan.request.id)
      if(plan.kind==="quote") {
        this.pending.add(plan.request.id)
        this.bids.set(plan.request.id,{features:this.features(plan.request),ratio:plan.ratio!})
        if(plan.anchor) this.reservations.set(plan.anchor,plan.request.id)
      }
    }
    if (!plan.action) return
    const results=await this.world.act([plan.action]);this.readResults([plan.action],results)
    const prices: Record<string,number|undefined> = plan.action.type==="quote" ? plan.action.prices : {}
    const changedQuote=plan.action.type==="quote" && plan.referencePrices && Object.entries(plan.referencePrices).some(([key,p])=>prices[key]!==p)
    this.telemetry.push({kind:"portfolio_action",at:this.now,plan:{kind:plan.kind,anchor:plan.anchor,multiplier:plan.multiplier,changedQuote:!!changedQuote},action:plan.action,result:results[0]})
    if(results[0]?.ok && plan.action.type==="post") for(const stop of plan.action.stops) this.held.delete(stop.orderId)
  }

  override async handle(event: DeskEvent): Promise<void> {
    await super.handle(event)
    if (event.kind==="order_changed") for (const key of this.profiles.keys()) if(key.startsWith(`${event.order.id}:`)) this.profiles.delete(key)
  }

  override readResults(actions: Action[], results: ActionResult[]): void {
    super.readResults(actions,results)
    actions.forEach((a,i)=>{if(a.type==="quote" && results[i]?.ok && Object.values(a.prices).every(p=>p!>=100_000_000)) this.neutralized.add(a.requestId)})
  }
}
