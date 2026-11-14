export type Outcome = { revenue: number; fees: number; refunds: number; penalties: number; capacity: number; future: number }
export type Branch = { probability: number; wins: 'neither' | 'first' | 'second' | 'both'; outcome: Outcome }

export function portfolioValue(branches: readonly Branch[]): number {
  if (branches.length !== 4 || new Set(branches.map(b => b.wins)).size !== 4 || branches.some(b => !['neither', 'first', 'second', 'both'].includes(b.wins)) || Math.abs(branches.reduce((sum, b) => sum + b.probability, 0) - 1) > 1e-9) throw new Error('A pair needs all four joint win outcomes')
  return branches.reduce((sum, branch) => {
    if (!Number.isFinite(branch.probability) || branch.probability < 0 || branch.probability > 1 || !Object.values(branch.outcome).every(Number.isFinite)) throw new Error('Invalid scenario')
    const o = branch.outcome
    if ([o.revenue, o.fees, o.refunds, o.penalties, o.capacity].some(v => v < 0)) throw new Error('Costs and revenue cannot be negative')
    return sum + branch.probability * (o.revenue - o.fees - o.refunds - o.penalties - o.capacity + o.future)
  }, 0)
}
