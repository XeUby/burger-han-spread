# Candidate 1: note reader, late repost and gentler climb together

Owner: Boris (Claude). 14 November 2026. Level 8 practice weeks. The base is `idea/early-climb` with its default settings.

The candidate is the base with three changes, each described in its own note:

| Change | Settings | Alone, a week |
| --- | --- | ---: |
| Read the whole note and quote what we used to decline (`note-reader.md`) | `noteReader` | +€693 on 24 weeks |
| Post a gig again once its last pickup time has passed (`late-repost.md`) | `lateRepost`, `lateFee` 1 | +€657 on 8 weeks, on top of the note reader |
| Raise the fee in smaller steps a day and half a day ahead (`gentle-climb.md`) | `climbDay` 1.1, `climbHalfDay` 1.25 | +€531 on 16 weeks |

## The effect together

| | Weeks | Base | Candidate | Difference | Weeks up / down | Lowest on-time share, base / candidate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| The sixteen weeks of the notes above | 16 | €9,810 | €11,436 | +€1,626 (standard error €265) | 15 / 1 | 94.4% / 91.7% |
| Fresh weeks `bh-reader-20261114-01` to `-08`, played once | 8 | €8,854 | €10,267 | +€1,413 (standard error €197) | 8 / 0 | 96.9% / 95.6% |

Every one of the 24 weeks is ranked. Late orders rise from 2.7% to 3.9% of all orders on the sixteen weeks, and from 1.5% to 2.5% on the fresh ones.

These settings are now the defaults in `src/policy.ts` and in `experiments/final-config.json`. The tests of the earlier readers and of the reprice after the last pickup time switch them off for themselves.

## What we do not know

- The lowest on-time share is 91.7%, and a week under 90% scores nothing. 24 weeks cannot rule such a week out.
- The gate asks for a lowest on-time share of 94%. The candidate does not meet it.
