# Stage-two frontier experiments

This report separates full-week policy screens from small mechanistic probes. Only the two explicitly named development seeds are used; fresh future holdouts are excluded.

## Paired policy screen

Seeds14 and15 were originally validation data. Their use here makes them development data for this stage. Cells show profit / on-time share; a missing result remains pending.

| Policy | Seed14 | Seed15 | Mean gain versus baseline | Qualified completed runs |
|---|---:|---:|---:|---:|
| baseline | €6,136.34 / 99.56% | €8,378.22 / 96.14% | — | 2/2 |
| frontier-auction | €6,356.91 / 99.13% | €8,970.28 / 97.22% | €406.31 | 2/2 |
| frontier-auction-bundles | €6,339.99 / 100.00% | €9,806.08 / 98.62% | €815.75 | 2/2 |
| frontier-bundles | €6,318.78 / 100.00% | €9,652.03 / 98.93% | €728.12 | 2/2 |
| frontier-hold-control | €6,182.61 / 99.56% | €9,323.63 / 97.53% | €495.84 | 2/2 |
| frontier-home | €6,165.36 / 99.56% | €8,703.61 / 96.83% | €177.21 | 2/2 |
| frontier-home-volume | €8,109.96 / 98.17% | €9,128.74 / 93.35% | €1,362.07 | 2/2 |
| frontier-long-bundles | €7,407.63 / 99.58% | €9,410.50 / 96.58% | €1,151.79 | 2/2 |
| frontier-lowfee | €8,194.25 / 94.59% | €6,884.32 / 87.17% | €282.00 | 1/2 |
| frontier-menu | €5,235.09 / 100.00% | €8,862.95 / 98.56% | −€208.26 | 2/2 |
| frontier-place | €6,037.11 / 99.11% | €9,066.47 / 97.18% | €294.51 | 2/2 |
| frontier-private | €6,948.46 / 99.61% | €8,058.28 / 95.77% | €246.09 | 2/2 |
| frontier-readiness | €6,196.71 / 99.57% | €8,323.47 / 96.17% | €2.81 | 2/2 |
| frontier-shadow | €825.61 / 100.00% | €3,894.92 / 100.00% | −€4,897.02 | 2/2 |
| frontier-trade | €6,209.85 / 100.00% | €8,691.16 / 95.52% | €193.22 | 2/2 |
| frontier-volume | €8,102.78 / 98.17% | €9,128.74 / 93.35% | €1,358.48 | 2/2 |
| frontier-volume-auction | €8,413.65 / 98.91% | €7,685.85 / 94.24% | €792.47 | 2/2 |
| frontier-volume-bundles | €8,627.17 / 99.27% | €9,096.26 / 93.62% | €1,604.43 | 2/2 |

## Treatment definitions

- **frontier-auction:** Defer commercial admission until five minutes before response, with an initial losing placeholder; prioritize due requests by expected contribution and reserve pending capacity later.
- **frontier-auction-bundles:** Pairing plus deferred commercial quoting five minutes before the response deadline.
- **frontier-bundles:** Hold safe public single-car posts for up to15 minutes and match feasible sequential pairs; retain baseline admission and prices.
- **frontier-hold-control:** Hold posts for15 minutes but disable route pairing; isolates the posting delay.
- **frontier-home:** Cheap direct offers to qualified drivers living near the destination, retaining baseline admission.
- **frontier-home-volume:** Destination-home offers plus the four broader volume settings.
- **frontier-long-bundles:** Pairing plus maximum700km, retaining baseline capacity, backlog and minimum supply.
- **frontier-lowfee:** Volume settings plus opening fee0.85 instead of1.05. Also changes quote floors and demand-model cost inputs; not an isolated payout experiment.
- **frontier-menu:** Same-day menu price multiplier1.12; later options unchanged.
- **frontier-place:** Place-aware demand treatment; inspect the full stored settings and frozen source.
- **frontier-private:** Allow feasible private-address single-car work while retaining baseline price/capacity settings.
- **frontier-readiness:** Readiness-aware admission/timing treatment; inspect the full stored settings and frozen source.
- **frontier-shadow:** Capacity0.50, backlog0.12, minimum supply8, max700km, and expected cost multiplier2.0; tests aggressive cost-based pricing jointly with looser admission.
- **frontier-trade:** Allow feasible two-leg trade-ins while retaining baseline price/capacity settings.
- **frontier-volume:** Larger daily capacity0.35 and unbooked allowance0.08, minimum supply8, max700km; four parameter changes together.
- **frontier-volume-auction:** Combines the larger volume admission settings with deferred quote-window allocation.
- **frontier-volume-bundles:** Pairing plus capacity0.35, backlog0.08, minimum supply8 and maximum700km.

Lowfee changes posted fees, minimum quote prices and the expected fulfillment cost passed to the demand optimizer. Shadow combines a cost multiplier change with capacity and lane changes. These comparisons cannot identify each component separately.

## Auction attribution

The auction treatment waits until five minutes before each response deadline, then quotes commercially. Winning decisions still occur at the dealer’s original response deadline, so this does not intentionally delay dispatch after an order is won. It shortens the time a speculative quote reserves capacity, uses more recent market/state evidence and sorts simultaneously due decisions by expected contribution. The following decomposition describes where the observed profit difference came from.

| Seed | Commercial quotes, before→after | Common wins: profit change | New wins: profit | Removed wins: subtraction | Cancellation difference |
|---|---:|---:|---:|---:|---:|
| 14 | 459→471 | €158.02 | €281.17 (9 orders) | −€199.23 (6 orders) | −€19.39 |
| 15 | 465→476 | €389.69 | €480.67 (16 orders) | −€307.92 (13 orders) | €29.62 |

Driver assignments, fees and dealer trust can change after admission changes. Therefore a common-order profit change is not an isolated treatment effect; the four components simply reconcile exactly to the whole-week difference.

Shared-gig fees have no order identifier. They remain in whole-week totals and are stored separately as `sharedLedger`; request-level margins exclude them and must not be treated as net profit for bundled orders. Every report verifies that request-level lines plus shared lines equal the terminal score.

## Mechanistic probes

- **multi-pickup mechanics probe**, seed `mechanics-bundle-01`: 2 request states and 1 branch decisions. One ordinary post action with pickup-pickup-delivery-delivery was rejected: a driver moves one car at a time. Stopped on rejection and deleted the probe world. No fee, profit or timing treatment was tested.
- **menu-choice branch probes**, seed `mechanics-menu-01`: 6 request states and 109 branch decisions. Paired decision-point forks characterize menu choice on a few requests. They are not full-policy weeks, independent samples, or profit benchmarks. Search brackets named win are not evidence of an actual winning quote unless a recorded probe won.

## Operational interruptions

Only a terminal snapshot with score, reveal and events enters the comparison. Private-delivery deadlines use the booked slot end plus 30 minutes, bounded by the order deadline; every leg must be on time. All derived late counts and ledger totals reconcile to the recorded score.

- `waeca76492dc84a5916dc`: HTTP 502 during execution; coordinator reported server interruption. No terminal score exists, so this is not a failed delivery-policy result. Source: coordinator report of runtime stderr; the saved action-error array is separate from transport errors.
- `w0e07ef2533e2ef02bd0e`: HTTP 502 during execution; coordinator reported server interruption. No terminal score exists, so this is not a failed delivery-policy result. Source: coordinator report of runtime stderr; the saved action-error array is separate from transport errors.
- `wa5afd1798215289a4e96`: HTTP 502 during execution; coordinator reported server interruption. No terminal score exists, so this is not a failed delivery-policy result. Source: coordinator report of runtime stderr; the saved action-error array is separate from transport errors.

## Run manifest

| Label | Seed | World | Status | Source snapshot |
|---|---|---|---|---|
| baseline | formal-unseen-20261113-14 | `w8b85572a9b6fc286e4ec` | complete | `f8a730aaed7e169b0e8df8fd1dee9cc5543a69ccaf93ea1780fb78d31747befb` |
| baseline | formal-unseen-20261113-15 | `w735d87d8fe1b99845667` | complete | `f8a730aaed7e169b0e8df8fd1dee9cc5543a69ccaf93ea1780fb78d31747befb` |
| frontier-volume | formal-unseen-20261113-15 | `w039210a04d4ae45b4567` | complete | `f8a730aaed7e169b0e8df8fd1dee9cc5543a69ccaf93ea1780fb78d31747befb` |
| frontier-auction | formal-unseen-20261113-14 | `w0b0a425cf803342bff2d` | complete | `b5771f2b53463474c801350875253e32aa9d5f7d9b689125abed39c55914437d` |
| frontier-place | formal-unseen-20261113-14 | `w0e07ef2533e2ef02bd0e` | incomplete | `82bb3e17fc97e929df1d3045da6f1845536b0a871d961b00cae6066021e808b8` |
| frontier-private | formal-unseen-20261113-14 | `w161b1029585b69b3b961` | complete | `b275b77df060268224f5149bb915fa13d4ca38a51253d054b3be2f3617031037` |
| frontier-readiness | formal-unseen-20261113-14 | `w1da4784220098c5bdb89` | complete | `82bb3e17fc97e929df1d3045da6f1845536b0a871d961b00cae6066021e808b8` |
| frontier-lowfee | formal-unseen-20261113-15 | `w1e571df1d29a158e5690` | complete | `f8a730aaed7e169b0e8df8fd1dee9cc5543a69ccaf93ea1780fb78d31747befb` |
| frontier-trade | formal-unseen-20261113-15 | `w254075f877f4963e1ffc` | complete | `b275b77df060268224f5149bb915fa13d4ca38a51253d054b3be2f3617031037` |
| frontier-long-bundles | formal-unseen-20261113-14 | `w2d3a9c88f6ffd8d14e27` | complete | `36a1c9ad35990355fcaa0cfa0902ed6de1bcf20adc32a868fbf46a4878d23d41` |
| frontier-home | formal-unseen-20261113-14 | `w3d80a69ff94fd19a1968` | complete | `943e5f0c11bae7705ff78ee262055c7c801a0c6f305ab069923ddea5f6fc759d` |
| frontier-volume-bundles | formal-unseen-20261113-14 | `w4fb61d1e0897ffb8fda9` | complete | `613614078c6d91c159073de4aacad323ae653d09f102df9bb13400c83538872c` |
| frontier-home-volume | formal-unseen-20261113-14 | `w503ea3dd6214bb39d8ba` | complete | `943e5f0c11bae7705ff78ee262055c7c801a0c6f305ab069923ddea5f6fc759d` |
| frontier-place | formal-unseen-20261113-14 | `w5274695ce6e5f901b990` | complete | `82bb3e17fc97e929df1d3045da6f1845536b0a871d961b00cae6066021e808b8` |
| frontier-place | formal-unseen-20261113-15 | `w566fc6348194e5c4c9d0` | complete | `82bb3e17fc97e929df1d3045da6f1845536b0a871d961b00cae6066021e808b8` |
| frontier-home | formal-unseen-20261113-15 | `w58455be33975d14abe85` | complete | `943e5f0c11bae7705ff78ee262055c7c801a0c6f305ab069923ddea5f6fc759d` |
| frontier-menu | formal-unseen-20261113-14 | `w5dd2ed60ca60ca57ffe7` | complete | `b275b77df060268224f5149bb915fa13d4ca38a51253d054b3be2f3617031037` |
| frontier-long-bundles | formal-unseen-20261113-15 | `w5eebc0627e34e58dc24a` | complete | `36a1c9ad35990355fcaa0cfa0902ed6de1bcf20adc32a868fbf46a4878d23d41` |
| frontier-auction-bundles | formal-unseen-20261113-14 | `w6510b58d9684c4e12af7` | complete | `613614078c6d91c159073de4aacad323ae653d09f102df9bb13400c83538872c` |
| frontier-auction-bundles | formal-unseen-20261113-15 | `w67dd2997c4471c9b2e6c` | complete | `613614078c6d91c159073de4aacad323ae653d09f102df9bb13400c83538872c` |
| frontier-bundles | formal-unseen-20261113-15 | `w6a6204837557cd28bdf5` | complete | `613614078c6d91c159073de4aacad323ae653d09f102df9bb13400c83538872c` |
| frontier-hold-control | formal-unseen-20261113-15 | `w73a9b99847220c8c1e54` | complete | `36a1c9ad35990355fcaa0cfa0902ed6de1bcf20adc32a868fbf46a4878d23d41` |
| frontier-volume-auction | formal-unseen-20261113-15 | `w73d7e06307a17b7156b5` | complete | `a722a1aed31e3c7679535937cc13a201b9e1b0aef8066d371a4f7304870c6a59` |
| frontier-hold-control | formal-unseen-20261113-14 | `w756acf8ea6b691151370` | complete | `36a1c9ad35990355fcaa0cfa0902ed6de1bcf20adc32a868fbf46a4878d23d41` |
| frontier-private | formal-unseen-20261113-15 | `w771a67e4380c9de4d000` | complete | `b275b77df060268224f5149bb915fa13d4ca38a51253d054b3be2f3617031037` |
| frontier-auction | formal-unseen-20261113-15 | `w8009f8eec43876a31c73` | complete | `b5771f2b53463474c801350875253e32aa9d5f7d9b689125abed39c55914437d` |
| frontier-shadow | formal-unseen-20261113-15 | `w83e930b0f35b6c5f8b21` | complete | `f8a730aaed7e169b0e8df8fd1dee9cc5543a69ccaf93ea1780fb78d31747befb` |
| frontier-volume-auction | formal-unseen-20261113-14 | `w979261929ce968cdba3d` | complete | `a722a1aed31e3c7679535937cc13a201b9e1b0aef8066d371a4f7304870c6a59` |
| frontier-shadow | formal-unseen-20261113-14 | `w99c7c7b8d252586f6e4e` | complete | `f8a730aaed7e169b0e8df8fd1dee9cc5543a69ccaf93ea1780fb78d31747befb` |
| frontier-trade | formal-unseen-20261113-14 | `w9cdbfcc2e855bb9ff85f` | complete | `b275b77df060268224f5149bb915fa13d4ca38a51253d054b3be2f3617031037` |
| frontier-readiness | formal-unseen-20261113-14 | `wa5afd1798215289a4e96` | incomplete | `82bb3e17fc97e929df1d3045da6f1845536b0a871d961b00cae6066021e808b8` |
| frontier-menu | formal-unseen-20261113-15 | `wa95ca6d08a9dc0c7eaa8` | complete | `b275b77df060268224f5149bb915fa13d4ca38a51253d054b3be2f3617031037` |
| frontier-readiness | formal-unseen-20261113-15 | `waeca76492dc84a5916dc` | incomplete | `82bb3e17fc97e929df1d3045da6f1845536b0a871d961b00cae6066021e808b8` |
| frontier-volume | formal-unseen-20261113-14 | `wce8e82d056867e77200c` | complete | `f8a730aaed7e169b0e8df8fd1dee9cc5543a69ccaf93ea1780fb78d31747befb` |
| frontier-volume-bundles | formal-unseen-20261113-15 | `we2b77ac2bf4ae7932f79` | complete | `613614078c6d91c159073de4aacad323ae653d09f102df9bb13400c83538872c` |
| frontier-lowfee | formal-unseen-20261113-14 | `wea7341e3bdc4e2a1d2aa` | complete | `f8a730aaed7e169b0e8df8fd1dee9cc5543a69ccaf93ea1780fb78d31747befb` |
| frontier-readiness | formal-unseen-20261113-15 | `wed656323634466eafdf7` | complete | `82bb3e17fc97e929df1d3045da6f1845536b0a871d961b00cae6066021e808b8` |
| frontier-home-volume | formal-unseen-20261113-15 | `wf35eb3e3be383cc52619` | complete | `943e5f0c11bae7705ff78ee262055c7c801a0c6f305ab069923ddea5f6fc759d` |
| frontier-bundles | formal-unseen-20261113-14 | `wfc46ca550b8a4944dbd3` | complete | `613614078c6d91c159073de4aacad323ae653d09f102df9bb13400c83538872c` |

Full settings, score fields, shared-gig ledger lines and source identifiers are in [frontier-experiments.json](frontier-experiments.json). The local request-level ledger detail is written to `runs/frontier-request-details.json`, alongside the ignored raw run artifacts. Rebuild using the strict seed allowlist:

```bash
python3 analysis/frontier_report.py
```

These are two-seed development results. A selected immutable candidate still needs a new independent validation panel.
