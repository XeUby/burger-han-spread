export type Trial = { id: string; level: number; seed?: string; run?: number; settings: Record<string, unknown> }
export type Plan = { mode: 'practice' | 'ranked'; season?: number; workers: number; capacity: number; createUntil: number; mutateUntil: number; trials: Trial[] }
export type Inventory = { worldId: string; level: number; kind: string; season: number | null; boardRun: number | null; ended: boolean }
export type Case = { trial: Trial; status: 'pending' | 'creating' | 'running' | 'completed' | 'failed' | 'creation_unknown' | 'not_started'; worldId?: string; score?: unknown; error?: string }
export type Host = {
  now(): number
  worlds(): Promise<Inventory[]>
  season(level: number): Promise<number | null>
  acquire(): Promise<(() => Promise<void>) | undefined>
  create(trial: Trial, mode: Plan['mode']): Promise<string>
  play(trial: Trial, worldId: string): Promise<unknown>
  record(event: object): void
  wait(): Promise<void>
}

export async function schedule(plan: Plan, host: Host, signal?: AbortSignal): Promise<{ cases: Case[]; stopped?: string; journalError?: string }> {
  validatePlan(plan)
  const cases: Case[] = plan.trials.map(trial => ({ trial, status: 'pending' }))
  const active = new Map<string, Promise<void>>()
  let stopped: string | undefined, journalError: string | undefined
  const emit = (event: object) => {
    try { host.record({ at: host.now(), ...event }) }
    catch (error) { journalError = String(error); stopped = 'Attempt journal failed' }
  }
  emit({ event: 'planned', cases })
  const finish = async (row: Case) => {
    try {
      row.score = await host.play(row.trial, row.worldId!)
      const world = (await host.worlds()).find(w => w.worldId === row.worldId)
      if (!world?.ended) throw new Error('Policy returned before the server world ended')
      row.status = 'completed'
    } catch (error) {
      row.status = 'failed'; row.error = String(error); stopped = `Policy failed: ${row.trial.id}`
    } finally {
      emit({ event: row.status, case: row })
      active.delete(row.trial.id)
    }
  }
  while (cases.some(row => row.status === 'pending') || active.size) {
    if (signal?.aborted) stopped ??= 'Creation cancelled; active worlds retain their outcomes'
    if (host.now() >= plan.createUntil) stopped ??= 'Creation deadline reached'
    if (stopped) {
      for (const row of cases.filter(row => row.status === 'pending')) { row.status = 'not_started'; row.error = stopped; emit({ event: 'not_started', case: row }) }
      await Promise.all(active.values())
      break
    }
    if (active.size >= plan.workers || !cases.some(row => row.status === 'pending')) { await host.wait(); continue }
    let release: (() => Promise<void>) | undefined
    try {
      release = await host.acquire()
      if (!release) continue
      if (signal?.aborted || host.now() >= plan.createUntil) continue
      const worlds = await host.worlds()
      const unfinished = worlds.filter(w => !w.ended)
      emit({ event: 'occupancy', worlds: unfinished })
      if (stopped || signal?.aborted || host.now() >= plan.createUntil) continue
      if (unfinished.length >= plan.capacity) continue
      const occupied = new Set(unfinished.filter(w => w.boardRun !== null).map(w => w.level))
      for (const row of cases.filter(row => row.status === 'running' || row.status === 'creating')) occupied.add(row.trial.level)
      const row = cases.find(row => row.status === 'pending' && (plan.mode === 'practice' || !occupied.has(row.trial.level)))
      if (!row) continue
      if (plan.mode === 'ranked') {
        if (await host.season(row.trial.level) !== plan.season) throw new Error('Ranking round changed')
        const existing = worlds.filter(w => w.level === row.trial.level && w.season === plan.season && w.boardRun !== null)
        if (existing.some(w => w.boardRun === row.trial.run)) throw new Error(`Ranked case already exists: ${row.trial.id}`)
        if (row.trial.run !== Math.max(0, ...existing.map(w => w.boardRun!)) + 1) throw new Error('Ranked run number does not match server history')
      }
      if (stopped || signal?.aborted || host.now() >= plan.createUntil) continue
      row.status = 'creating'; emit({ event: 'creating', case: row })
      if (stopped) { row.status = 'not_started'; row.error = stopped; continue }
      try {
        row.worldId = await host.create(row.trial, plan.mode)
        row.status = 'running'; emit({ event: 'created', case: row })
        const world = (await host.worlds()).find(w => w.worldId === row.worldId)
        if (!world || world.kind !== 'practice' || world.level !== row.trial.level || (plan.mode === 'ranked' ? world.season !== plan.season || world.boardRun !== row.trial.run : world.season !== null || world.boardRun !== null)) throw new Error('Created world provenance mismatch')
        active.set(row.trial.id, finish(row))
      } catch (error) {
        row.status = row.worldId ? 'failed' : 'creation_unknown'
        row.error = String(error); stopped = `Creation failed or uncertain: ${row.trial.id}`
        emit({ event: row.status, case: row })
      }
    } catch (error) {
      stopped = String(error)
      emit({ event: 'scheduler_failed', error: stopped })
    } finally {
      if (release) {
        try { await release() } catch (error) { stopped = `Shared lock release failed: ${error}`; emit({ event: 'scheduler_failed', error: stopped }) }
      }
      if (!stopped && (active.size || cases.some(row => row.status === 'pending'))) await host.wait()
    }
  }
  emit({ event: 'finished', cases, stopped, journalError })
  return { cases, stopped, journalError }
}

export function validatePlan(plan: Plan): void {
  if (!['practice', 'ranked'].includes(plan.mode) || !Number.isInteger(plan.workers) || !Number.isInteger(plan.capacity) || plan.workers < 1 || plan.capacity < plan.workers || plan.capacity > 8 || !Number.isFinite(plan.createUntil + plan.mutateUntil) || plan.createUntil >= plan.mutateUntil) throw new Error('Invalid runner limits')
  if (!plan.trials.length || new Set(plan.trials.map(t => t.id)).size !== plan.trials.length) throw new Error('Cases need unique IDs')
  const keys = new Set<string>()
  for (const trial of plan.trials) {
    if (!trial.id || !Number.isInteger(trial.level) || trial.level < 1 || trial.level > 8) throw new Error('Invalid trial')
    if (plan.mode === 'practice' ? !trial.seed || trial.run !== undefined : trial.seed !== undefined || !Number.isInteger(trial.run) || trial.run! < 1 || trial.run! > 5 || !Number.isInteger(plan.season)) throw new Error('Trial does not match authorized mode')
    const key = plan.mode === 'ranked' ? `${trial.level}:${trial.run}` : `${trial.level}:${trial.seed}:${trial.id}`
    if (keys.has(key)) throw new Error('Duplicate case')
    keys.add(key)
  }
}
