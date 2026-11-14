import { writeFile } from "node:fs/promises"
import { Client } from "../../vendor/typescript/spread.ts"

const client = new Client()
const [worlds, boards] = await Promise.all([client.worlds(), Promise.all([1,2,3,4].map(level => client.board(level as 1)))])
const report = { checkedAt: new Date().toISOString(), worlds, boards }
await writeFile("runs/levels-noon-server.json", JSON.stringify(report))
console.log(JSON.stringify({ checkedAt: report.checkedAt, unfinished: worlds.filter(w => !w.ended), boards: boards.map(b => ({ level:b.level, season:b.current?.season, ours:b.current?.teams.find(t => t.team==="burger-han") })) }))
