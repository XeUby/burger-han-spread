export function allowMutation(now: number, deadline: number, method: string): boolean {
  return method.toUpperCase() === 'GET' || now < deadline
}

export function nextAvailable<T extends { level: number }>(queue: T[], active: Set<number>): T | undefined {
  const index = queue.findIndex(task => !active.has(task.level))
  if (index < 0) return undefined
  return queue.splice(index, 1)[0]
}
