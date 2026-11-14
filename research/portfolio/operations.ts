import { readFile, writeFile } from "node:fs/promises"
import { Client } from "../../vendor/typescript/spread.ts"

const path = process.argv[2] ?? "experiments/portfolio-development-v1.json"
const plan = JSON.parse(await readFile(path, "utf8"))
const attempts = (await readFile(plan.attempts, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line))
const worlds = await new Client().worlds()
const created = attempts.filter(a => a.event === "created")
const ids = new Set(created.map(a => a.worldId))
const records = created.map(start => {
  const world = worlds.find(w => w.worldId === start.worldId)
  if (!world || world.kind !== "practice" || world.boardRun !== null || world.season !== null) throw new Error(`Research world provenance mismatch: ${start.worldId}`)
  const end = attempts.find(a => a.event === "completed" && a.worldId === start.worldId)
  return { ...world, label: start.label, seed: start.seed, completedPolicyWallSeconds: end ? (Date.parse(end.at) - Date.parse(start.at)) / 1000 : null }
})
const report = {
  checkedAt: new Date().toISOString(), plan: path,
  maximumObservedOccupancyBeforeCreation: Math.max(0, ...attempts.filter(a => a.event === "occupancy").map(a => a.unfinished.length)),
  worlds: records,
  unfinishedTeamWorlds: worlds.filter(w => !w.ended),
  otherUnfinishedWorlds: worlds.filter(w => !w.ended && !ids.has(w.worldId)),
  limitation: "A shared local lock protects creation among cooperating runners. Server occupancy checks cannot prove the count between observations for external runners. No other runner's world was altered.",
}
const name = path.split("/").at(-1)!.replace(/\.json$/, "")
await writeFile(`docs/${name}-operations.json`, JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify({ checkedAt: report.checkedAt, created: records.length, completed: records.filter(r => r.ended).length, unfinishedTeam: report.unfinishedTeamWorlds.length, otherUnfinished: report.otherUnfinishedWorlds.length, maximumObservedOccupancyBeforeCreation: report.maximumObservedOccupancyBeforeCreation }))
