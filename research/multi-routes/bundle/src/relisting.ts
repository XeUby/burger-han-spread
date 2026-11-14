import type { Order, PostAction } from "../vendor/typescript/types.ts"

export function canRelist(order: Order, post: PostAction, now: number, postedAt: number): boolean {
  if (now % 1440 < 480 || now % 1440 > 1080 || now - postedAt < 30) return false
  if (order.status !== "waiting" || order.legs.length !== 1 || order.lastPickupAt < now + 180) return false
  if (post.stops.length !== 2 || post.stops.some(stop => stop.orderId !== order.id)) return false
  const leg = order.legs[0]!
  return !leg.pickup.privateAddress && !leg.delivery.privateAddress && leg.pickup.window.from <= now + 180
}
