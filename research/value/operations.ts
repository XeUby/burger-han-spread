import { readFile, writeFile } from "node:fs/promises"
import { Client } from "../../vendor/typescript/spread.ts"

type Attempt = { event: string; at: string; worldId?: string; unfinished?: string[] }

const report = JSON.parse(await readFile("docs/value-development-v2-results.json", "utf8"))
if (!report.terminal) throw new Error("Finish the replacement panel before the final operations audit")
const worlds = await new Client().worlds()
const studies = []
for (const version of [1, 2]) {
  const plan = JSON.parse(await readFile(`experiments/value-development-v${version}.json`, "utf8"))
  const attempts: Attempt[] = (await readFile(plan.attempts, "utf8")).trim().split("\n").map(line => JSON.parse(line))
  const starts = attempts.filter(a => a.event === "created")
  const complete = new Map(attempts.filter(a => a.event === "completed").map(a => [a.worldId, a]))
  const finished = starts.map(a => worlds.find(w => w.worldId === a.worldId))
  if (finished.some(w => !w || !w.ended || w.kind !== "practice" || w.boardRun !== null || w.parent !== null)) {
    throw new Error("A research world is missing, unfinished, ranked, forked or not practice")
  }
  studies.push({
    version,
    created: starts.length,
    completedByPolicy: complete.size,
    maximumObservedOccupancyBeforeCreation: Math.max(...attempts.filter(a => a.event === "occupancy").map(a => a.unfinished!.length)),
    worlds: starts.map(a => ({
      ...worlds.find(w => w.worldId === a.worldId),
      completedPolicyWallSeconds: complete.has(a.worldId) ? (Date.parse(complete.get(a.worldId)!.at) - Date.parse(a.at)) / 1000 : null,
    })),
  })
}
const output = {
  checkedAt: new Date().toISOString(),
  studies,
  otherUnfinishedWorlds: worlds.filter(w => !w.ended),
  limitation: "Occupancy is observed before each creation under a shared local lock. External runners do not share this lock; these observations cannot prove the team's occupancy between checks. Other runners' worlds were not altered.",
}
await writeFile("docs/value-operations-audit.json", JSON.stringify(output, null, 2) + "\n")
console.log(JSON.stringify({ studies: studies.map(({ worlds, ...s }) => ({ ...s, maximumCompletedWorldSeconds: Math.max(...worlds.map(w => w.completedPolicyWallSeconds ?? 0)) })), otherUnfinished: output.otherUnfinishedWorlds.length }))
