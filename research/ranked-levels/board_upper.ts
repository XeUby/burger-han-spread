import { readFile, writeFile } from "node:fs/promises"
import { Client } from "../../vendor/typescript/spread.ts"

const client = new Client()
const [worlds, boards] = await Promise.all([client.worlds(), Promise.all([5,6,7,8].map(level => client.board(level as 1)))])
const report = { checkedAt: new Date().toISOString(), worlds, boards }
await writeFile("runs/levels-upper-server.json", JSON.stringify(report))
const protocol = JSON.parse(await readFile("experiments/levels-upper-protocol.json", "utf8"))
const compact = {
  checkedAt: report.checkedAt,
  scope: "Official API snapshot; empty teams and unrelated ended worlds omitted. Ranked positions and every listed run are unchanged.",
  worlds: worlds.filter(w => !w.ended || w.season === protocol.season && protocol.levels.includes(w.level) && w.boardRun !== null),
  boards: boards.map(b => ({ ...b, current: b.current && { ...b.current, teams: b.current.teams.filter(t => t.played > 0 || t.team === "burger-han") }, previous: b.previous && { ...b.previous, teams: b.previous.teams.filter(t => t.played > 0 || t.team === "burger-han") } })),
}
await writeFile("docs/levels-upper-server.json", JSON.stringify(compact, null, 2) + "\n")
console.log(JSON.stringify({ checkedAt: report.checkedAt, unfinished: worlds.filter(w => !w.ended), boards: boards.map(b => ({ level:b.level, season:b.current?.season, ours:b.current?.teams.find(t => t.team==="burger-han") })) }))
