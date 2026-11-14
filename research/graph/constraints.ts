import { readNote } from '../../src/notes.ts'
import { readHours } from '../../src/hours-note.ts'
import { readReadiness } from '../../src/readiness.ts'
import { withNoteHours } from '../../src/hours-plan.ts'
import type { Leg, PriceRequest } from '../../vendor/typescript/types.ts'

export type Constraints = {
  requestId: string
  observedAt: number
  manual: boolean
  plates: boolean
  legs: Leg[]
  options: PriceRequest['options']
  source: 'plain' | 'hours' | 'readiness'
  deadlineShift: number
}
export type Interpretation = { ok: true; value: Constraints } | { ok: false; reason: string }

export function interpret(request: PriceRequest, now: number, level: number): Interpretation {
  if (request.arrivedAt > now) throw new Error('Future request cannot enter a decision')
  if (now >= request.respondBy) return { ok: false, reason: 'response_closed' }
  if (!request.legs.length || request.legs.length > 2) return { ok: false, reason: 'unsupported_leg_count' }
  const plain = readNote(request.note)
  const timed = readHours(request.note, request.arrivedAt)
  const ready = timed ?? readReadiness(request.note, request.arrivedAt)
  if (!plain.safe && !ready) return { ok: false, reason: 'unresolved_note' }
  // Timed clauses need a leg/stop binding before they can govern a trade-in.
  if (ready && request.legs.length > 1) return { ok: false, reason: 'ambiguous_multileg_note' }
  const rules = ready ?? plain
  const legs = structuredClone(request.legs)
  const first = legs[0]!
  const readyAt = ready?.readyAt ?? first.pickup.window.from
  const shift = Math.max(0, Math.floor(readyAt / 1440) - Math.floor(first.pickup.window.from / 1440)) * 1440
  first.pickup.window.from = Math.max(first.pickup.window.from, readyAt)
  for (const leg of legs) for (const stop of [leg.pickup, leg.delivery]) {
    if (!stop.privateAddress) stop.window.to += shift
  }
  if (timed) {
    if ((first.pickup.privateAddress && timed.pickup) || (first.delivery.privateAddress && timed.delivery)) return { ok: false, reason: 'ambiguous_private_hours' }
    legs[0] = withNoteHours(first, timed)
  }
  const options = (level <= 3 ? request.options.slice(0, 1) : request.options).map(option => ({ ...option, deadline: option.deadline + shift }))
  return { ok: true, value: { requestId: request.id, observedAt: now, manual: rules.manual, plates: rules.plates, legs, options, source: timed ? 'hours' : ready ? 'readiness' : 'plain', deadlineShift: shift } }
}
