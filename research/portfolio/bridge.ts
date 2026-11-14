import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"

export type Outcome = {
  revenueCents: number; fulfillmentCents: number; refundCents: number; penaltyCents: number; futureCents: number
  capacity: Record<string, number>; late: number
}
export type Portfolio = {
  now: number; weights: number[]; capacity: Record<string, number>[]; lateBudget: number[]
  mandatory: string[]; baseline: string[]
  alternatives: { id: string; observedAt: number; claims: string[]; outcomes: Outcome[] }[]
}
export type Solution = {
  status: string; version: string; provenOptimal: boolean; usedBaselineFallback: boolean; selected: string[]
  weightedObjectiveCents: number; totalWeight: number; expectedCents: number; baselineExpectedCents: number
  solverUpperBoundCents: number | null; wallSeconds: number; scenarioNetCents: number[]; limits: string
}

export class PortfolioSolver {
  private child
  private pending?: { resolve: (value: Solution) => void; reject: (error: Error) => void; timer?: ReturnType<typeof setTimeout>; encoded: string }
  private failure?: Error
  private stderr = ""
  private ready = false
  private startupTimer: ReturnType<typeof setTimeout>
  private responseMs: number

  constructor(python = resolve("runs/portfolio-venv/bin/python"), options: { script?: string; startupMs?: number; responseMs?: number } = {}) {
    this.responseMs = options.responseMs ?? 3000
    this.startupTimer = setTimeout(() => this.stop(new Error("Portfolio solver exceeded its startup budget")), options.startupMs ?? 15000)
    this.child = spawn(python, [options.script ?? fileURLToPath(new URL("./solver.py", import.meta.url)), "--stream"], {
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", PYTHONUNBUFFERED: "1", PYTHONDONTWRITEBYTECODE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    })
    this.child.stderr.on("data", data => { this.stderr = (this.stderr + data.toString()).slice(-4000) })
    this.child.stdin.on("error", error => this.stop(error))
    this.child.on("error", error => this.stop(error))
    this.child.on("exit", (code, signal) => this.stop(new Error(`Portfolio solver exited (${code ?? signal}): ${this.stderr}`)))
    createInterface({ input: this.child.stdout }).on("line", line => {
      if (this.failure) return
      if (!this.ready) {
        try {
          const message = JSON.parse(line)
          if (message.ready !== true || message.version !== "9.11.4210") throw new Error("Invalid solver readiness or unfrozen solver version")
          clearTimeout(this.startupTimer)
          this.ready = true
          this.send()
        } catch (error) { this.stop(new Error(`Invalid solver startup: ${error}`)) }
        return
      }
      const pending = this.pending
      if (!pending) { this.stop(new Error("Unexpected solver response")); return }
      clearTimeout(pending.timer)
      this.pending = undefined
      try {
        const result = JSON.parse(line)
        if (result.error) pending.reject(new Error(`Invalid portfolio: ${result.error}`))
        else if (result.version !== "9.11.4210") this.stop(new Error("Unfrozen solver version"), pending)
        else pending.resolve(result as Solution)
      } catch (error) { this.stop(new Error(`Invalid solver output: ${error}`), pending) }
    })
  }

  solve(problem: Portfolio): Promise<Solution> {
    if (this.failure) return Promise.reject(this.failure)
    if (this.pending) return Promise.reject(new Error("One portfolio decision must finish before another starts"))
    const encoded = JSON.stringify(problem) + "\n"
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, encoded }
      if (this.ready) this.send()
    })
  }

  private send(): void {
    const pending = this.pending
    if (!pending) return
    pending.timer = setTimeout(() => this.stop(new Error("Portfolio solver exceeded its response budget")), this.responseMs)
    this.child.stdin.write(pending.encoded, error => { if (error) this.stop(error) })
  }

  close(): void { this.stop(new Error("Portfolio solver closed")) }

  private stop(error: Error, pending = this.pending): void {
    clearTimeout(this.startupTimer)
    this.failure ??= error
    this.pending = undefined
    if (pending) { clearTimeout(pending.timer); pending.reject(error) }
    this.child.kill()
  }
}
