import test from "node:test"
import assert from "node:assert/strict"
import { canSchedule } from "./calendar.ts"

test("reassigns a flexible job so a deadline-constrained job can fit", () => {
  const limits = new Map([[1, { total: 1, unbooked: 1 }], [2, { total: 1, unbooked: 1 }]])
  assert(canSchedule([{ days: [1, 2], unbooked: true }, { days: [1], unbooked: true }], limits))
  assert(!canSchedule([{ days: [1], unbooked: true }, { days: [1], unbooked: true }], limits))
})

test("enforces backlog separately from total capacity without splitting jobs", () => {
  const limits = new Map([[1, { total: 2, unbooked: 1 }], [2, { total: 0, unbooked: 1 }]])
  assert(canSchedule([{ days: [1], unbooked: false }, { days: [1], unbooked: true }], limits))
  assert(!canSchedule([{ days: [1, 2], unbooked: true }, { days: [1, 2], unbooked: true }], limits))
  assert(!canSchedule([{ days: [], unbooked: false }], limits))
})

test("matches exhaustive assignment across small calendars", () => {
  const limits = new Map([[1, { total: 2, unbooked: 1 }], [2, { total: 2, unbooked: 1 }]])
  for (let code = 0; code < 4096; code++) {
    const jobs = Array.from({ length: 4 }, (_, i) => {
      const value = code >> (3 * i) & 7
      return { days: [1, 2].filter(day => value & 1 << (day - 1)), unbooked: Boolean(value & 4) }
    })
    const used = new Map([[1, { total: 0, unbooked: 0 }], [2, { total: 0, unbooked: 0 }]])
    const exhaustive = (index: number): boolean => {
      if (index === jobs.length) return true
      const job = jobs[index]!
      for (const day of job.days) {
        const count = used.get(day)!, limit = limits.get(day)!
        if (count.total >= limit.total || job.unbooked && count.unbooked >= limit.unbooked) continue
        count.total++; count.unbooked += Number(job.unbooked)
        const fits = exhaustive(index + 1)
        count.total--; count.unbooked -= Number(job.unbooked)
        if (fits) return true
      }
      return false
    }
    assert.equal(canSchedule(jobs, limits), exhaustive(0), `calendar${code}`)
  }
})
