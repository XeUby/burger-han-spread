export type CalendarJob = { days: readonly number[]; unbooked: boolean }
export type DayCapacity = { total: number; unbooked: number }

/** Matches indivisible jobs to service days while enforcing total and unbooked quotas. */
export function canSchedule(jobs: readonly CalendarJob[], limits: ReadonlyMap<number, DayCapacity>): boolean {
  const days = [...limits.keys()].sort((a, b) => a - b)
  const sink = 1 + jobs.length + 2 * days.length
  type Edge = { to: number; capacity: number; reverse: number }
  const graph: Edge[][] = Array.from({ length: sink + 1 }, () => [])
  const add = (from: number, to: number, capacity: number) => {
    graph[from]!.push({ to, capacity, reverse: graph[to]!.length })
    graph[to]!.push({ to: from, capacity: 0, reverse: graph[from]!.length - 1 })
  }
  const positions = new Map(days.map((day, index) => [day, 1 + jobs.length + 2 * index]))
  for (const [i, job] of jobs.entries()) {
    add(0, i + 1, 1)
    for (const day of new Set(job.days)) {
      const position = positions.get(day)
      if (position !== undefined) add(i + 1, position + (job.unbooked ? 0 : 1), 1)
    }
  }
  for (const day of days) {
    const limit = limits.get(day)!, position = positions.get(day)!
    if (!Number.isInteger(limit.total) || !Number.isInteger(limit.unbooked) || limit.total < 0 || limit.unbooked < 0) throw new Error("Day capacities must be nonnegative integers")
    add(position, position + 1, limit.unbooked)
    add(position + 1, sink, limit.total)
  }
  let flow = 0
  while (flow < jobs.length) {
    const previous = new Map<number, { from: number; edge: number }>()
    const queue = [0]
    previous.set(0, { from: -1, edge: -1 })
    for (let cursor = 0; cursor < queue.length && !previous.has(sink); cursor++) {
      const from = queue[cursor]!
      for (const [edge, link] of graph[from]!.entries()) if (link.capacity > 0 && !previous.has(link.to)) {
        previous.set(link.to, { from, edge })
        queue.push(link.to)
      }
    }
    if (!previous.has(sink)) return false
    for (let to = sink; to !== 0;) {
      const step = previous.get(to)!, link = graph[step.from]![step.edge]!
      link.capacity--
      graph[to]![link.reverse]!.capacity++
      to = step.from
    }
    flow++
  }
  return true
}
