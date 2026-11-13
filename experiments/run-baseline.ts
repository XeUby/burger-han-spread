import { readFile } from "node:fs/promises"
import { Client, SpreadError } from "./baseline/vendor/typescript/spread.ts"
import { practice } from "./baseline/src/run.ts"

const { seeds } = JSON.parse(await readFile("experiments/holdout-seeds.json", "utf8")) as { seeds: string[] }
const client = new Client()
let next = 0
await Promise.all(Array.from({ length: 3 }, async () => {
  while (next < seeds.length) {
    const seed = seeds[next++]!
    let world
    for (let attempt = 0; !world; attempt++) {
      try { world = await client.create(8, { seed }) }
      catch (error) {
        if (!(error instanceof SpreadError) || error.status !== 409 || !error.message.includes("practice worlds") || attempt >= 119) throw error
        if (!attempt) console.log(`Waiting for a baseline slot: ${seed}`)
        await new Promise(resolve => setTimeout(resolve, 10000))
      }
    }
    await practice(client, { worldId: world.id, seed })
  }
}))
