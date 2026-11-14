import { mkdir, rm, writeFile } from 'node:fs/promises'
import { Client } from '../../vendor/typescript/spread.ts'
import type { Host, Plan, Trial } from './schedule.ts'

export type Player = (client: Client, options: { worldId: string; level: number; seed?: string; board: boolean; settings: Record<string, unknown>; label: string }) => Promise<unknown>

export function spreadHost(client: Client, player: Player, plan: Plan, lock: string, record: Host['record']): Host {
  return {
    now: Date.now,
    worlds: () => client.worlds(),
    season: async level => (await client.board(level as 8)).current?.season ?? null,
    acquire: async () => {
      try { await mkdir(lock) }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return undefined; throw error }
      try { await writeFile(`${lock}/owner.json`, JSON.stringify({ pid: process.pid, mode: plan.mode, at: new Date().toISOString() })) }
      catch (error) { await rm(lock, { recursive: true }); throw error }
      return () => rm(lock, { recursive: true })
    },
    create: async (trial: Trial, mode: Plan['mode']) => (await client.create(trial.level as 8, mode === 'ranked' ? { board: true } : { seed: trial.seed! })).id,
    play: (trial, worldId) => player(client, { worldId, level: trial.level, seed: trial.seed, board: plan.mode === 'ranked', settings: trial.settings, label: trial.id }),
    record,
    wait: () => new Promise(resolve => setTimeout(resolve, 100)),
  }
}
