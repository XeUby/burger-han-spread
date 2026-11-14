# Frontier validation procedure

Freeze one candidate and its settings before opening any fresh validation outcome. Reserve six to eight new seeds and run the same seeds with the prior validated baseline, source `f8a730aaed7e169b0e8df8fd1dee9cc5543a69ccaf93ea1780fb78d31747befb`. The older `c440` baseline is not the comparison for this stage.

Create a manifest containing `selectionFrozenAt` (ISO timestamp), `unseenDeclaration` (a truthful account of prior outcome inspection), `baseline` and `candidate` objects with exact `revision` and full `settings`, and a `pairs` array. Every pair contains `seed`, `baselineWorldId`, and `candidateWorldId`. Optional `bootstrap` contains integer `samples` and `seed`; defaults are 10,000 and 20261114.

```bash
python3 analysis/frontier_validation.py --manifest experiments/frontier-validation-manifest.json --output docs/frontier-validation
```

The script opens only those explicit world IDs. It rejects missing or repeated worlds, changed source/settings, unfinished weeks, ledger discrepancies, and disagreements between snapshot counts and official scores. A private delivery's deadline is the smaller of the order deadline and the booked slot end plus 30 minutes. Every leg must meet its deadline; cancelled orders are excluded.

The report resamples complete paired weeks for a seeded 95% percentile bootstrap interval on mean profit gain, reports the exact two-sided sign test excluding ties, and gives a one-sided 95% exact binomial lower bound for weekly qualification. All declared weeks, including unqualified weeks, remain in profit summaries. Small panels cannot certify rare-failure safety or global optimality.

Each JSON report records the exact manifest hash and the hashes of every source metadata, score, snapshot, and event file. Interrupted attempts should be recorded separately with their operational errors; the explicit manifest must retain a prespecified complete evaluation panel and must not choose retries by performance.
