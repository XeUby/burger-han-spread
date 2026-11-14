import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"

const path=process.argv[2]
if(!path) throw new Error("Supply the frozen portfolio manifest")
const plan=JSON.parse(await readFile(path,"utf8"))
if(createHash("sha256").update(await readFile(new URL(import.meta.url))).digest("hex")!==plan.portfolioLauncherSha256) throw new Error("Portfolio launcher changed")
const versions=JSON.parse(execFileSync(plan.pythonExecutable,["-c","import importlib.metadata,json; print(json.dumps({d.metadata['Name'].lower():d.version for d in importlib.metadata.distributions()}))"],{encoding:"utf8",env:{PATH:process.env.PATH ?? "/usr/bin:/bin"}}))
for(const [name,version] of Object.entries(plan.pythonVersions)) if(versions[name]!==version) throw new Error(`Unfrozen dependency: ${name}`)
await import("../value/run.ts")
