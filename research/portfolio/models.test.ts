import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { prediction } from "./models.ts"

test("pre-quote inference reproduces frozen scikit-learn probabilities", () => {
  const report = JSON.parse(readFileSync("docs/portfolio-prior-check.json", "utf8"))
  for (const row of report.fixtures) assert(Math.abs(prediction(row.target, row.x)-row.probability)<1e-12)
})
