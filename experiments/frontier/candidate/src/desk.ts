import { World } from "../vendor/typescript/spread.ts"
import type { Action, ActionResult, DeskEvent, DeskSnapshot, FeeStep, Order, PostAction, PriceRequest, StopRef } from "../vendor/typescript/types.ts"

const HOUR = 60

/** How to post a leg again after a failed visit. */
type Retry = { pickupFrom: number; manualLicence: boolean; plates: boolean }

/** What the dispatcher remembers, and its answer to each event. The answers wait in the outbox
 * until the dispatcher sends them, and the world applies them at the current minute. */
export abstract class Desk {
  readonly world: World
  readonly level: number
  now: number
  readonly outbox: Action[] = [] // the actions decided since the dispatcher last sent
  readonly requests = new Map<string, PriceRequest>()
  readonly orders = new Map<string, Order>() // the orders won and not cancelled
  readonly legGigs = new Map<string, Map<number, string>>() // order id -> leg -> the gig that carries the leg
  readonly booked = new Set<string>() // the gigs that a driver holds now
  readonly posts = new Map<string, PostAction>() // gig id -> the post that made it
  readonly urgent = new Set<string>() // the orders whose deadline warning has come

  constructor(world: World, level: number, now: number) {
    this.world = world
    this.level = level
    this.now = now
  }

  /** Rebuilds what it knows from the world, so a dispatcher that stopped keeps its orders. Then answers
   * what it missed: open requests, orders without a gig, failed visits without a new gig, and the
   * deadline warnings, so the orders that had one keep their steep fees. */
  async rejoin(snapshot: DeskSnapshot, history: DeskEvent[]): Promise<void> {
    for (const gig of snapshot.gigs) if (["booked", "working", "done"].includes(gig.status)) this.booked.add(gig.id)
    for (const gig of snapshot.gigs) if (["open", "booked", "working"].includes(gig.status)) this.carry({ type: "post", stops: gig.stops, audience: gig.audience, schedule: gig.schedule }, gig.id)
    for (const event of history) if (event.kind === "price_request") this.requests.set(event.request.id, event.request)
    for (const event of history) if (event.kind === "deadline_close") this.urgent.add(event.orderId)
    for (const order of snapshot.orders) if (this.requests.has(order.id) && order.status !== "cancelled") this.orders.set(order.id, order)
    for (const order of this.orders.values()) {
      for (const leg of undelivered(order)) {
        if (this.legGigs.get(order.id)?.has(leg)) continue
        const failure = history.findLast(event => event.kind === "visit_failed" && event.orderId === order.id && event.leg === leg)
        if (failure?.kind === "visit_failed") await this.retry(order.id, leg, failure.reason)
        else await this.post(order, [leg])
      }
    }
    for (const request of snapshot.openRequests) this.quote(request)
  }

  async handle(event: DeskEvent): Promise<void> {
    if (event.kind === "price_request") this.quote(event.request)
    else if (event.kind === "order_won") await this.win(event.order)
    else if (event.kind === "order_changed") await this.change(event.order)
    // The world has stopped a cancelled order's car and told each of its gigs what happens.
    else if (event.kind === "order_cancelled") {
      for (const gig of event.gigs) if (gig.outcome === "withdrawn" || gig.outcome === "released") this.forgetGig(gig.gigId)
      for (const books of [this.orders, this.legGigs]) books.delete(event.orderId)
      for (let i = this.outbox.length - 1; i >= 0; i--) {
        const action = this.outbox[i]!
        if (action.type === "post" && action.stops.some(stop => stop.orderId === event.orderId)) this.outbox.splice(i, 1)
      }
    }
    else if (event.kind === "visit_failed") await this.retry(event.orderId, event.leg, event.reason)
    else if (event.kind === "gig_expired") this.repost(event.gigId)
    // It comes again when a driver drops the car after the first warning.
    else if (event.kind === "deadline_close") await this.raise(event.orderId)
    else if (event.kind === "gig_booked") this.booked.add(event.gigId)
    // After a no-show the gig is open again, as after a drop. A late driver still comes.
    else if (event.kind === "gig_dropped" || event.kind === "no_show") this.booked.delete(event.gigId)
    else if (event.kind === "delivered") this.delivered(event.orderId, event.leg, event.at)
  }

  delivered(orderId: string, leg: number, at: number): void {
    this.legGigs.get(orderId)?.delete(leg)
    const order = this.orders.get(orderId)
    if (order) order.deliveredAt[leg] = at
  }

  abstract quote(request: PriceRequest): void

  async win(order: Order): Promise<void> {
    if (!this.requests.has(order.id) || this.orders.has(order.id)) return // rejoin can know it already
    this.orders.set(order.id, order)
    await this.post(order, undelivered(order))
  }

  async change(order: Order): Promise<void> {
    if (!this.orders.has(order.id)) return
    this.orders.set(order.id, order)
    if (await this.withdraw(order.id)) await this.post(order, undelivered(order))
  }

  /** Posts a gig again when one of its windows ended before a driver booked it. */
  repost(gigId: string): void {
    const action = this.posts.get(gigId)
    // A gig the dispatcher has already taken off and posted again, after a change of plan, needs nothing.
    if (!action || !action.stops.some(({ orderId, leg }) => this.legGigs.get(orderId)?.get(leg) === gigId)) return
    const survivors = action.stops.filter(stop => stop.kind === "pickup" && this.legGigs.get(stop.orderId)?.get(stop.leg) === gigId && this.orders.get(stop.orderId)?.deliveredAt[stop.leg] === null)
    this.forgetGig(gigId)
    if (new Set(action.stops.map(stop => stop.orderId)).size > 1) {
      for (const { orderId, leg } of survivors) {
        const order = this.orders.get(orderId)!
        this.outbox.push({ ...action, stops: withoutWindows(action.stops.filter(stop => stop.orderId === orderId && stop.leg === leg), Infinity), schedule: this.feesFor(order, 1) })
      }
      return
    }
    const order = this.orders.get(action.stops[0]!.orderId)
    if (!order) return
    // One of its windows has ended, perhaps at a site's closing time before the window's own end: post without its own stop windows.
    this.outbox.push({ ...action, stops: withoutWindows(action.stops, Infinity), schedule: this.feesFor(order, pickups(action)) })
  }

  /** From the order's deadline warning on, its gigs that no driver holds go at the steep fees. */
  async raise(orderId: string): Promise<void> {
    const order = this.orders.get(orderId)
    if (!order) return
    this.urgent.add(orderId)
    await this.sendPostOf(orderId)
    for (const gigId of this.gigsOf(orderId)) {
      if (!this.booked.has(gigId)) this.outbox.push({ type: "reprice", gigId, schedule: this.feesForPost(this.posts.get(gigId)!) })
    }
  }

  /** The fees for some of the order's cars from now: rising, or steep once its deadline warning has come. */
  abstract feesFor(order: Order, cars: number): FeeStep[]

  feesForPost(post: PostAction): FeeStep[] {
    if (new Set(post.stops.map(stop => stop.orderId)).size > 1) {
      const current = post.schedule.findLast(step => step.at <= this.now) ?? post.schedule[0]!
      return [{ at: this.now, feeCents: current.feeCents }, ...post.schedule.filter(step => step.at > this.now).map(step => ({ ...step }))]
    }
    return this.feesFor(this.orders.get(post.stops[0]!.orderId)!, pickups(post))
  }

  async retry(orderId: string, leg: number, reason: string): Promise<void> {
    const order = this.orders.get(orderId)
    if (!order) return
    this.legGigs.get(orderId)?.delete(leg) // the world has taken the car out of the failed gig
    const carNotThere = reason === "not_ready" || reason === "closed"
    const pickupFrom = carNotThere ? retryFrom(order, this.requests.get(orderId)!, leg, this.now) : 0
    await this.post(order, [leg], { pickupFrom, manualLicence: reason === "licence", plates: reason === "no_plates" })
  }

  abstract post(order: Order, legs: number[], retry?: Retry): Promise<void>

  /** The gigs that carry the order's undelivered legs: one, or one for each leg of a split trade-in. */
  gigsOf(orderId: string): string[] {
    return [...new Set(this.legGigs.get(orderId)?.values())]
  }

  /** Remembers a gig that the world accepted: the post that made it, and the legs it carries. */
  carry(action: PostAction, gigId: string): void {
    for (const { orderId, leg } of action.stops) this.legGigs.set(orderId, (this.legGigs.get(orderId) ?? new Map()).set(leg, gigId))
    this.posts.set(gigId, action)
  }

  /** Takes an order's gigs out of the drivers' app. False, and nothing withdrawn, when a driver holds one of them. */
  async withdraw(orderId: string): Promise<boolean> {
    await this.sendPostOf(orderId)
    const gigs = this.gigsOf(orderId)
    if (gigs.some((gigId) => this.booked.has(gigId))) return false
    if (!gigs.length) return true
    const actions: Action[] = gigs.map(gigId => ({ type: "withdraw", gigId }))
    const results = await this.world.act(actions)
    this.readResults(actions, results)
    return results.length === gigs.length && results.every(result => result.ok)
  }

  /** Sends a queued post containing the order so its shared gig can be changed safely. */
  async sendPostOf(orderId: string): Promise<void> {
    if (this.outbox.some((action) => action.type === "post" && action.stops.some(stop => stop.orderId === orderId))) await this.send()
  }

  /** Sends the outbox now. In practice, the outbox goes with the next advance instead. */
  async send(): Promise<void> {
    const actions = this.takeActions()
    if (actions.length > 0) this.readResults(actions, await this.world.act(actions))
  }

  takeActions(): Action[] { return this.outbox.splice(0) }

  readResults(actions: Action[], results: ActionResult[]): void {
    actions.forEach((action, i) => {
      if (action.type === "post" && results[i]?.ok) this.carry(action, results[i]!.id)
      else if ((action.type === "withdraw" || action.type === "release") && results[i]?.ok) this.forgetGig(action.gigId)
    })
  }

  private forgetGig(gigId: string): void {
    for (const legs of this.legGigs.values()) for (const [leg, carrying] of legs) if (carrying === gigId) legs.delete(leg)
    this.posts.delete(gigId)
    this.booked.delete(gigId)
  }
}

/** When to try a car again after a visit found it not ready or the site closed: two hours on, or,
 * when the dealer moved the deadline for a car that is late, when the car should be ready by the
 * same delay. */
function retryFrom(order: Order, request: PriceRequest, leg: number, now: number): number {
  const promised = request.options.find((option) => option.kind === order.option)?.deadline ?? order.deadline
  const delay = Math.max(0, order.deadline - promised)
  return Math.max(now + 2 * HOUR, order.legs[leg]!.pickup.window.from + delay)
}

const undelivered = (order: Order): number[] => order.legs.map((_, leg) => leg).filter((leg) => order.deliveredAt[leg] === null)

/** The cars a post carries. */
const pickups = (action: PostAction): number => action.stops.filter((stop) => stop.kind === "pickup").length

/** Leaves out the stop windows that end before `before`, so the world's window applies: once the order's
 * window has ended, it runs to the end of the world. */
const withoutWindows = (stops: StopRef[], before: number): StopRef[] =>
  stops.map((stop) => (stop.window && stop.window.to < before ? { ...stop, window: undefined } : stop))

