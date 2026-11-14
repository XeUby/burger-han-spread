# Development experiments

The selected policy combines adaptive prices, a same-day queue ceiling of four and a 550 km lane limit. On the five development seeds it improves margin in every paired comparison. The unseen validation results are deliberately excluded from this report.

## Method and scope

These are deterministic level 8 practice worlds. Comparisons use the same seeds, treating complete weeks as the experimental unit. The names `holdout-2` and `holdout-3` are historical; both were repeatedly used for development and are not unseen validation. Policies were selected sequentially, so the screening results are descriptive and subject to selection bias.

The manifest contains 28 runs: 26 new experiments and two reused original-baseline worlds. At generation, 28 were complete and 0 pending; 28/28 completed runs met the game’s 90% delivery minimum. Each score was checked against a terminal snapshot and its late-order count.

## Paired screen

Cells show net margin / on-time share. All comparisons use the original baseline below; treatment descriptions identify the appropriate narrower ablation.

| Policy | holdout-2 | holdout-3 | Mean paired margin change vs original |
|---|---:|---:|---:|
| baseline | €6,706.96 / 97.66% | €2,591.97 / 100.00% | — |
| floor-only-original-notes | €6,303.08 / 94.25% | €3,896.75 / 100.00% | €450.45 |
| expanded-notes | €6,291.11 / 93.42% | €3,260.38 / 98.57% | €126.28 |
| adaptive | €7,159.54 / 94.14% | €5,649.76 / 98.51% | €1,755.18 |
| early-offers | €6,356.29 / 94.37% | €3,198.38 / 98.55% | €127.87 |
| lower-fee | €7,233.03 / 92.91% | €3,206.20 / 98.65% | €570.15 |
| longer-lanes | €6,762.37 / 92.27% | €4,296.83 / 98.80% | €880.13 |
| adaptive-queue | €7,851.40 / 96.55% | €5,671.21 / 98.51% | €2,111.84 |
| adaptive-long-queue | €8,830.25 / 96.35% | €6,419.13 / 97.84% | €2,975.22 |
| adaptive-long-queue-slope8 | €9,390.92 / 96.79% | €6,079.62 / 98.33% | €3,085.80 |
| pickup-slack | €7,873.35 / 95.03% | €6,229.36 / 98.25% | €2,401.89 |

## What each experiment changes

- **baseline:** Frozen original note parser and fixed-price dispatcher; price=1.42, fee=1.05, margin=0.28, fixed floor addition=1000 cents, maxKm=400, local daily capacity=0.18, minDrivers=12.
- **floor-only-original-notes:** Original note parser and admission/fee policy; quote margin floor 0.28→0.10 and fixed floor addition €10→€0.
- **expanded-notes:** Expanded safe harmless-note/equipment phrases; otherwise the baseline economic settings.
- **adaptive:** Expanded notes plus online demand optimization, margin floor=0.10, fixed addition=0, trustStep=0.01. These changes form one coupled treatment.
- **early-offers:** Expanded notes plus earlier direct offers and activity/location-aware targeting; baseline price/fee settings.
- **lower-fee:** Expanded notes and fee factor 1.05→0.95. Because quote floors derive from this fee, this changes both posted fees and quoted prices.
- **longer-lanes:** Expanded notes and maxKm 400→550, preserving supply and capacity gates.
- **adaptive-queue:** Adaptive treatment plus same-day local queue ceiling four, preserving feasible later quote options.
- **adaptive-long-queue:** Adaptive treatment plus same-day queue ceiling four and maxKm=550; demandSlope=14, early offers and pickup slack disabled. Selected candidate.
- **adaptive-long-queue-slope8:** Selected candidate with logistic demandSlope=8 instead of 14.
- **pickup-slack:** Selected candidate plus explicit conservative pickup cutoffs (safetySlack=true).

Lower-fee is a coupled price-and-cost experiment because the posted fee feeds the quote floor. Adaptive pricing is also a coupled treatment: online demand learning, the lower quote floor and a trust step of 1% all change together. Neither is a single-switch causal estimate of its label alone. Comparing expanded notes with the original baseline isolates the note-coverage change more closely, while demand and driver behavior still respond endogenously.

The floor-only change improves the low-margin week but reduces margin and reliability on the difficult week. Broader notes alone show the same tradeoff. Early offers give mixed small margin changes relative to expanded notes. Adding the queue ceiling to the adaptive treatment improves both paired margins and raises difficult-week on-time delivery from 94.14% to 96.55%; extending that combination to 550 km adds profit on both seeds. The slope-8 sensitivity test raises the two-seed mean by €110.58 relative to slope 14 but changes sign across seeds (+€560.67, −€339.51). Only the slope-14 settings received the five-seed confirmation below; the two-seed screen does not establish either slope as globally best.

## Five-seed confirmation of the selected settings

| Seed | Baseline margin | Selected margin | Gain | Baseline on-time | Selected on-time |
|---|---:|---:|---:|---:|---:|
| spread-1 | €5,910.90 | €8,393.75 | €2,482.85 | 98.90% | 98.98% |
| validate-1 | €6,165.77 | €9,097.01 | €2,931.24 | 100.00% | 99.06% |
| holdout-2 | €6,706.96 | €8,830.25 | €2,123.29 | 97.66% | 96.35% |
| holdout-3 | €2,591.97 | €6,419.13 | €3,827.16 | 100.00% | 97.84% |
| holdout-4 | €4,407.36 | €8,581.43 | €4,174.07 | 100.00% | 100.00% |

Across these five development seeds, mean margin changes from **€5,156.59 to €8,264.31**, a paired gain of **€3,107.72 (60.3%)**. The candidate qualifies on 5/5 and has a worst observed on-time share of 96.35%. This is confirmation across development seeds, not an estimate from unseen worlds.

The selected setting vector is `adaptive=true`, `margin=0.10`, `priceFloor=0`, `trustStep=0.01`, `sameDayBacklog=4`, `maxKm=550`, `demandSlope=14`, `fee=1.05`, `capacity=0.18`, `minDrivers=12`, `backlog=0.04`, with early offers and pickup slack disabled. In the earliest selected runs, slope 14 and disabled pickup slack were code defaults rather than explicit metadata fields.

## Source provenance

Node batch processes load modules at process start, whereas disk source snapshots are taken at each world creation. Source was edited while development batches ran. A later trial may therefore record newer disk files than its loaded modules, notably pickup-slack on holdout-3. These IDs identify disk snapshots, not certified runtime digests. The original baseline archive remained unchanged. The later unseen-validation process started after source freeze and is outside this report.

The five selected runs must not be described as five validations of the final frozen source. Their complete configurations and recorded disk snapshot IDs are preserved below and in [experiments.json](experiments.json).

## Run manifest

Full hashes identify the disk snapshots recorded in launch metadata. For newer runs, those files are archived under `runs/sources/<revision>/`; availability is recorded in the JSON. The original baseline source is also frozen in `experiments/baseline/`.

| Variant | Seed | World ID | Status | Recorded disk-source SHA-256 |
|---|---|---|---|---|
| baseline | spread-1 | `wc0e4705e1d3ee56724b4` | complete | `c440065717076cc4d14d2aae3b395f15a98efbc35cb3dfcc3d47f18813f39be6` |
| baseline | validate-1 | `w3ea5ca2f5b8e9b30987b` | complete | `c440065717076cc4d14d2aae3b395f15a98efbc35cb3dfcc3d47f18813f39be6` |
| baseline | holdout-2 | `w7ae145e3ea74526ee4bf` | complete | `c440065717076cc4d14d2aae3b395f15a98efbc35cb3dfcc3d47f18813f39be6` |
| baseline | holdout-3 | `w1937eaf885387948933b` | complete | `c440065717076cc4d14d2aae3b395f15a98efbc35cb3dfcc3d47f18813f39be6` |
| baseline | holdout-4 | `w4b0c114dfc99d7eb4329` | complete | `c440065717076cc4d14d2aae3b395f15a98efbc35cb3dfcc3d47f18813f39be6` |
| floor-only-original-notes | holdout-2 | `w02a4c43da3febb915ee0` | complete | `d2b845444d83ecc606673db50bdc41acdf93d48e6bcb013eab8d37109aec25ad` |
| floor-only-original-notes | holdout-3 | `wcb25f567eb387833fa43` | complete | `d2b845444d83ecc606673db50bdc41acdf93d48e6bcb013eab8d37109aec25ad` |
| expanded-notes | holdout-2 | `wa91ce8c1daea7f4c9cc6` | complete | `4b0c95577d07d8ddb72e10ca1346c559f952444eec9122456dc63a819383458b` |
| expanded-notes | holdout-3 | `w50fa55273a0979412d8f` | complete | `4b0c95577d07d8ddb72e10ca1346c559f952444eec9122456dc63a819383458b` |
| adaptive | holdout-2 | `wb081cd387816513c47a1` | complete | `17b1224980d77b093031437873fd1f163189cfef5874ff5c07fab974ba02f9af` |
| adaptive | holdout-3 | `w425c685b27f98760e324` | complete | `924b936ea48327bbaa49d123ada1a7be6fd1339c86cc192e0a9fa1d91e065220` |
| early-offers | holdout-2 | `w3591ff0a651c0c537534` | complete | `17b1224980d77b093031437873fd1f163189cfef5874ff5c07fab974ba02f9af` |
| early-offers | holdout-3 | `wb3d622258c94129d2be0` | complete | `924b936ea48327bbaa49d123ada1a7be6fd1339c86cc192e0a9fa1d91e065220` |
| lower-fee | holdout-2 | `w424199fbdd008fcbd84e` | complete | `924b936ea48327bbaa49d123ada1a7be6fd1339c86cc192e0a9fa1d91e065220` |
| lower-fee | holdout-3 | `wf3fc8555ff7371f60d31` | complete | `924b936ea48327bbaa49d123ada1a7be6fd1339c86cc192e0a9fa1d91e065220` |
| longer-lanes | holdout-2 | `w3fca9ffa55f37ab764d3` | complete | `924b936ea48327bbaa49d123ada1a7be6fd1339c86cc192e0a9fa1d91e065220` |
| longer-lanes | holdout-3 | `w1a6d8e9945cd53876178` | complete | `924b936ea48327bbaa49d123ada1a7be6fd1339c86cc192e0a9fa1d91e065220` |
| adaptive-queue | holdout-2 | `w407935d7c04a30632ccf` | complete | `e3a2ecc6cfef7e62140bbef240e9e4ed16d9751f0cfe0987719e1a6f4d2e5c8a` |
| adaptive-queue | holdout-3 | `w991dc1f588362b881fd3` | complete | `e3a2ecc6cfef7e62140bbef240e9e4ed16d9751f0cfe0987719e1a6f4d2e5c8a` |
| adaptive-long-queue | holdout-2 | `w7972495096c0af8b9de8` | complete | `e3a2ecc6cfef7e62140bbef240e9e4ed16d9751f0cfe0987719e1a6f4d2e5c8a` |
| adaptive-long-queue | holdout-3 | `wb865ff1c21970cb0fef2` | complete | `e3a2ecc6cfef7e62140bbef240e9e4ed16d9751f0cfe0987719e1a6f4d2e5c8a` |
| adaptive-long-queue | spread-1 | `wd415561aaf36894b76de` | complete | `82a2917e12b7985265ad55efca9ead3b6e979b597857d557d0ed7db7761e25af` |
| adaptive-long-queue | validate-1 | `wbcb207675e32e9aff20f` | complete | `82a2917e12b7985265ad55efca9ead3b6e979b597857d557d0ed7db7761e25af` |
| adaptive-long-queue | holdout-4 | `wb915d7ae809d2fec7776` | complete | `2c84d39c6cc215451283d24e5da710118f24b326b8277809e86f62fa6155c3b7` |
| adaptive-long-queue-slope8 | holdout-2 | `w1bffb098519f0532dddf` | complete | `90ff71348942ccf050b82ce6a3aecf7df18e694cba59dd843dd487f2c3d58364` |
| adaptive-long-queue-slope8 | holdout-3 | `w5cef648043cabe2ee04d` | complete | `90ff71348942ccf050b82ce6a3aecf7df18e694cba59dd843dd487f2c3d58364` |
| pickup-slack | holdout-2 | `w9afefc9b7af4685ebbe7` | complete | `2c84d39c6cc215451283d24e5da710118f24b326b8277809e86f62fa6155c3b7` |
| pickup-slack | holdout-3 | `w1161968626d8d95ecec7` | complete | `ba4e4416ba9ae41be61070a159b40196ab140c749b325147a8cbafe61c9f0df5` |

## The fleet cost model (documented negative result)

The strongest public reference team prices against a driver-cost model rather than a share of the typical fee: a logistic in fifteen signs estimates whether a car arrives on time, and the posted fee is the multiple of the typical fee that minimises fee plus expected late refund plus a shadow price for the room a late order eats under the delivery minimum. We re-implemented that mechanism in `src/fleet.ts` and `src/policy.ts` (flag `fleetRisk`, off by default, with `fleetOnTime`, `fleetRefund`, `fleetLatePrice`, `fleetCrowding`, `fleetCalm`, `fleetDoubt`, `fleetFlatFee`), refitted nothing, and tested it on our own seeds.

The model is calibrated on our worlds to within three points (a default week: said 92.4%, did 94.5%; a `fleetRisk` week: said 91.3%, did 94.2%, `tools/fleet-calibration.py` over `FLEET_LOG` JSONL). It still loses money, because it raises the fee without buying on-time.

| Configuration | Seed | Margin | Orders | On time | Qualified |
|---|---|---:|---:|---:|---|
| default (champion) | win-probe-1 | €8,086.68 | 296 | 95.3% | yes |
| `fleetRisk` | win-probe-1 | €6,503.60 | 241 | 93.8% | yes |
| `fleetRisk`, `fleetLatePrice=0` | win-probe-1 | €8,224.85 | 385 | 90.1% | yes |
| `fleetRisk`, `fleetLatePrice=0`, wide admission | win-probe-1 | €5,032.91 | 555 | 76.0% | no |
| wide admission only | win-probe-1 | €6,837.03 | 357 | 89.6% | no |
| default (champion) | win-probe-2 | €9,543.34 | 347 | 94.5% | yes |
| `fleetRisk` + `fleetFlatFee` | win-probe-2 | €7,017.59 | 308 | 94.2% | yes |

- **Mechanism tested:** fee = argmin over the grid 0.85–1.5× of (fee + late refund risk + shadow-priced late orders + queue harm); every quote option priced at one margin over its own cost.
- **Best case:** dropping the shadow price recovers the order count (385 vs 296) but spends the whole safety margin (90.1%, one late order from disqualification) for €138 more than the champion on that seed. Paired on `win-probe-2`, the flat-fee variant loses €2,525.75.
- **Hypothesis (not validated):** the reference team's fitted fee weight (3.96) describes their worlds better than ours; our champion already posts about 0.89× the typical fee, so a grid that starts at 0.85× mostly raises our fees and buys no on-time.
- **Decision:** the flag stays off; the champion is unchanged. The module and its seven behavioural tests stay in the tree so the mechanism can be re-tested with weights refitted on our own weeks.
- **Known defects recorded, not fixed:** under wide admission the dispatcher repeats `withdraw`/`reprice` on gigs that are already closed (`Gig gN is not open`), and it retries `post` for orders whose pickup window has already ended (`R00716`, `R00622`); the latter is a guaranteed late delivery and belongs to admission, not to pricing.

## Reproduction and limits

The report reads an explicit allowlist of development worlds. It never discovers or reads unseen score files. Rebuild it from the saved development files:

```bash
python3 analysis/summarize_experiments.py
```

The complete settings, raw score fields, late-order counts, source snapshot availability, paired differences and qualification results are in [experiments.json](experiments.json). Saved metadata and files make the reported scores auditable; the development batch provenance limitation means they do not always certify an exact runtime replay. Rerunning an old configuration against the current source is also not an exact reproduction.

No observed practice result proves global optimality, guarantees the secret final, or estimates the probability of qualification with high precision. The whole-week samples are small, and optimizing repeatedly on these seeds introduces selection bias. Unseen validation must remain separate.
