# Lower-level economics and the noon deployment

The global portfolio prototype was a poor transfer to levels 1–3: its fulfillment-cost assumptions rejected much of the work that the corrected control served profitably. Running successfully and delivering everything on time did not make it competitive. A separate bounded study revisited payment and admission interactions after fixing the awarded first option.

All comparisons below use the same two familiar underlying seed blocks. Levels share those blocks; dozens of worlds are not dozens of independent weeks. The later studies were adaptive development. No new untouched validation panel or alpha allocation was used, and the 24-pair minimum was not represented as satisfied.

## Whole-week development outcomes

| Level | Policy | Mean net profit | Qualified | Minimum on time | Mean orders | Mean driver payments | Mean refunds |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | corrected control | €6,587.16 | 2/2 | 99.45% | 531.5 | €28,470.86 | €39.12 |
| 1 | joint portfolio | €2,061.99 | 2/2 | 98.72% | 156.0 | €4,928.31 | €11.55 |
| 1 | moderate payment0.90 | €8,413.64 | 2/2 | 97.95% | 641.5 | €35,097.71 | €319.98 |
| 1 | strong payment0.72 | €4,432.55 | 2/2 | 92.52% | 613.0 | €38,611.71 | €1,182.35 |
| 1 | strong payment + capacity | €4,257.26 | 2/2 | 92.65% | 628.0 | €39,699.75 | €1,150.60 |
| 2 | corrected control | €6,838.91 | 2/2 | 99.45% | 530.5 | €28,136.21 | €37.88 |
| 2 | joint portfolio | €2,115.55 | 2/2 | 99.35% | 155.5 | €4,869.36 | €2.55 |
| 2 | moderate payment0.90 | €8,487.99 | 2/2 | 98.55% | 633.5 | €34,666.26 | €288.68 |
| 2 | strong payment0.72 | €5,213.29 | 2/2 | 94.11% | 606.0 | €37,288.98 | €1,104.95 |
| 2 | strong payment + capacity | €4,982.82 | 2/2 | 93.49% | 624.0 | €38,656.79 | €1,185.97 |
| 3 | corrected control | €6,125.48 | 2/2 | 99.03% | 528.5 | €28,725.85 | €81.55 |
| 3 | joint portfolio | €2,544.20 | 2/2 | 100.00% | 166.0 | €5,098.30 | €0.00 |
| 3 | moderate payment0.90 | €9,335.94 | 2/2 | 98.42% | 644.0 | €34,228.83 | €300.70 |
| 3 | strong payment0.72 | €7,503.18 | 2/2 | 95.02% | 618.5 | €35,937.25 | €969.98 |
| 3 | strong payment + capacity | €7,725.89 | 2/2 | 95.02% | 639.5 | €37,074.97 | €889.27 |
| 4 | corrected control | €1,685.24 | 2/2 | 100.00% | 66.5 | €3,642.51 | €0.00 |
| 4 | joint portfolio | €1,597.31 | 2/2 | 100.00% | 65.0 | €3,109.34 | €0.00 |

## Hypothesis decisions

- **Global portfolio at lower levels:** reject this implementation for deployment. It lost roughly €3,600–€4,700/week at levels1–3 and €88/week at level4. Its cost/booking models need regime-specific calibration before further use. The solver's finite-model optimum did not protect against bad economics.
- **Capacity expansion with corrected options:** the level1capacity-only arm lost €55.80/week on average. Capacity expansion combined with moderate payment earned slightly less than moderate payment alone and had worse on-time delivery. Do not broaden admission merely to pursue a higher order count.
- **Moderate payment with corrected options:** mean gains were €1,826.48, €1,649.08 and €3,210.46 at levels1,2and3, respectively. All six level trials qualified, with minimum on-time shares97.95%,98.55%and98.42%. These are two underlying seeds, not six independent weeks. They support a deadline deployment choice, not statistical promotion.
- **Strong payment reduction:** even with the first option fixed,0.72lost profit at levels1–2 and increased lateness. Bundling made it more viable at level3, but0.90earned more and delivered more reliably. This confirms that neither a blanket low-fee rule nor a blanket rejection of payment research is justified.
- **Level4:** retain the earlier economics-only development policy with original capacity. Its three-week mean was€3,982.38 and minimum on-time95.62%; the new portfolio did not establish an improvement. This remains development-selected and is not a validated transfer to levels5–8.

The moderate payment policy increased throughput and total weekly driver spending. Its objective was higher net profit after fulfillment and refunds, not the lowest total driver fees. Exact paired differences, descriptive paired-t/bootstrap intervals, and full ledger records remain in the linked JSON reports. With two qualifying weeks, the one-sided95% qualification lower bound is only22.36% under IID-week assumptions.

## Frozen ranking decision

The user explicitly authorized ranking at levels1–4 and instructed a pause before5–8 if there is anything to learn. One level-aware policy was frozen before the first ranked world: first-option/opening-cost correction and fee0.90at levels1–3; earlier economics-only policy at level4. No setting changes or replacements are permitted in response to ranked outcomes. The deadline is12:00Helsinki, with creation stopping at11:55and ranked mutations at11:59:55.

The user also explicitly raised team capacity from four to eight unfinished worlds. New runners share the creation lock and check server occupancy. Earlier running manifests retained their more restrictive creation guards. Every planned experiment, failed attempt and completed world is preserved.

This is an explicitly authorized deadline deployment exception. It does not promote the policies through the prospective validation gate, overwrite the preserved level8selection, or establish a reliability guarantee. The current leaderboard gap must be judged on matched ranked runs, not these familiar practice seeds.

Records: [lower-level portfolio](portfolio-lower-v1-results.json), [level1 interaction](level1-corrected-economics-v1-results.json), [strong payment transfer](corrected-payment-transfer-v1-results.json), [moderate transfer](moderate-payment-transfer-v1-results.json), [frozen ranking protocol](../experiments/levels-noon-protocol.json), [official ranked audit](levels-noon-ranked-audit.json).
