# Late repost: stop paying 2.5 times the fee for a car that is already late

Owner: Boris (Claude). 14 November 2026. Level 8 practice weeks. The base is `idea/note-reader` with `noteReader` on.

## What we saw

Each week about ten orders find no driver before their last pickup time. In sixteen weeks that was 117 orders. What happened to them next:

| | Orders |
| --- | ---: |
| Found no driver before the last pickup time | 117 |
| Booked within 15 minutes after the gig expired and was posted again | 78 |
| Collected on the day they were booked | 0 |

A gig keeps the windows it was posted with. After the last pickup time no driver can meet them, so nobody can book the gig, at any fee. It stays in the app until the pickup site closes, five to six hours later. Only then does the world send `gig_expired`, and the dispatcher posts the car again. A gig posted after the last pickup time has stops that run to the end of the world, so a driver can take it for the next day, and one does within minutes.

By then the late-rescue fee has climbed from 1.2 to 2.5 times the fee. We paid €250 to €470 for routes from Oulu that a driver would have taken at half of that.

## The idea

When the last pickup time of an open gig has passed, take the gig out of the app and post it again at once. The fee schedule is the late-rescue schedule that the trunk already has: 1.2 times the fee, then higher every two hours. Setting `lateRepost`, off by default. Orders whose note gives site hours keep the old behaviour.

## The effect

Eight weeks, the same for both versions (`bh-robust-20261114-03`, `-06`, `-09`, `-20`, `bh-unseen1-20261114-01` to `-04`):

| | Note reader | Note reader and late repost |
| --- | ---: | ---: |
| Mean margin a week | €8,582 | €9,165 |
| Paired difference | | +€583 (standard error €208); 7 weeks up, 0 down, 1 the same |
| Late orders, share of all orders | 4.12% | 4.15% |
| Lowest on-time share | 92.0% | 91.7% |
| Ranked weeks | 8 of 8 | 8 of 8 |

The late orders stay late: no fee finds them a driver in time. They cost less.

## What we do not know

- Whether a driver would take such a gig below 1.2 times the fee. Not tried.
- Whether the car arrives earlier than before. Not measured.
