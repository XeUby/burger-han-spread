import fs from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import { createHash } from "node:crypto"

const source=fs.readFileSync("src/bundles.ts","utf8")
const body=source.slice(source.indexOf("function selectPairs("))
const select=new Function(stripTypeScriptTypes(body)+"\nreturn selectPairs")()
const graphs=JSON.parse(fs.readFileSync(0,"utf8"))
const rows=graphs.map((graph:{edges:[number,number,number][]})=>{
  const pairs=graph.edges.map(([a,b,weight])=>({indices:[a,b],feeSavingCents:weight}))
  const chosen=select(pairs) as {indices:number[];feeSavingCents:number}[]
  return {weight:chosen.reduce((s,p)=>s+p.feeSavingCents,0),pairs:chosen.map(p=>p.indices)}
})
console.log(JSON.stringify({sourceSha256:createHash("sha256").update(source).digest("hex"),rows}))
