# Note-hours development screen

Fully parsed pickup and receiving hours are enforced as explicit stop windows, including after expiry and recovery. Equipment and readiness restrictions remain mandatory. This feature is disabled by default and is absent from the frozen frontier candidate.

| Old development seed | Control margin | Hours margin | Paired gain | Control / hours on time |
|---|---:|---:|---:|---:|
| 14 | €8,627.17 | €8,649.39 | €22.22 | 99.3% / 99.0% |
| 15 | €9,096.26 | €10,128.62 | €1,032.36 | 93.6% / 95.9% |

Both weeks qualify. The mean gain is €527.29, but two development weeks are insufficient evidence of generalization. All 36 parsed-hours orders arrived on time, without failed visits or action errors. One underwent a route change. These are reconciled whole-week gains; shared driver fees prevent treating individual order revenue as net contribution.

The two controls use exactly the same source and differ only in `timedNotes`. They also reproduce the earlier frozen volume-plus-bundles scores to the cent. [Full results](note-hours-results.json) retain settings, source hashes, world IDs, ledger reconciliation and the safety audit.

The subsequent [four-week development confirmation](note-hours-confirmation.md) failed: mean gain −€274.73, with only two positive pairs. The feature remains disabled. The [confirmation protocol](../experiments/note-hours-confirmation-protocol.json) states the decision criteria and the source difference from its archived controls. No ranking submission or default-policy promotion has occurred.
