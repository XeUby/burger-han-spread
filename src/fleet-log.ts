import { appendFileSync } from "node:fs"

/**
 * One line per posted car and one per outcome, when FLEET_LOG names a file:
 * the drivers' model can then be checked against what the week really did.
 */
export function logFleet(path: string | undefined, entry: Record<string, unknown>): void {
  if (!path) return
  appendFileSync(path, JSON.stringify(entry) + "\n")
}
