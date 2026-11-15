# Burger Han — presentation draft (to edit after the final)

Fill in the final's result at the top. Every number below is level 8 practice, the same weeks for both sides of a comparison.

## 1. The answer

- Final: € … margin, … % on time, place … of …
- Best ranking round (Sunday 00:00): €60,399 over five weeks, €12,080 a week, every week ranked, lowest week 96.8% on time.
- 16 weeks no version of ours had played: €12,516 a week, 16 of 16 ranked, worst week 92.4% on time.
- The trunk dispatcher before tonight's ideas, on 16 shared weeks: €9,810 a week. With them: €11,877.

## 2. Idea: read the whole note

- The idea: a reader for dealer notes in Finnish, Swedish and English: deadlines, ready times, handover after payment, site hours, gearbox, plates. Days, weekdays, hours in words, corrections and denials as the rules define them. A word it does not know declines the request.
- Why: 17% of requests were declined only because of their note.
- Effect: +€693 a week on 24 weeks (+€943 on 8 fresh weeks, 8 of 8 up). 7,235 of 7,235 revealed orders read right; 0 failed visits.

## 3. Idea: raise the fee a day ahead, not four hours ahead

- The idea: a gig that no driver has taken a day before its last pickup goes to 1.1 times the full fee, and half a day before to 1.25.
- Why: on the weakest week, 19 of 29 late orders had never been booked in time; a high fee four hours before the pickup finds nobody, because a driver needs time to see the gig and to reach the car.
- Effect: the early climb made 40 of 40 weeks ranked instead of 39 (lowest on-time 94.4% against 89.2%); the gentler 1.1/1.25 steps then earned +€531 a week on 16 weeks.

## 4. Idea: once a car is late, post it again at once

- The idea: after the last pickup time, take the gig out and post it again without windows, at the full fee.
- Why: a gig keeps its windows; after the last pickup time nobody can book it until it expires hours later, while its rescue fee climbs to 2.5 times. Reposted, the first driver who looks takes it, after 2 minutes in the median.
- Effect: +€657 a week on 8 weeks.

## 5. Idea: two cars, one driver — also with a car that waits

- The idea: a new car can become the second car of a gig whose car has waited three hours without a driver.
- Effect: +€197 a week on 48 weeks; lowest on-time share 93.2% against 91.7%.

## 6. Idea: stop paying 2.5 times for hopeless cars

- The idea: the last two hours' fees capped at 1.6 and 1.8 times instead of 1.9 and 2.5.
- Why: orders finally paid 1.9 times lost €22 each and were late 28% of the time; at 2.5 times, −€75 and 47%.
- Effect: +€138 a week on 24 weeks, 20 up and 1 down, the same late share.

## 7. What did not work (the jury asks)

At level 8 the drivers are the limit. Every way to take more orders — trade-ins, private addresses, any route length, fewer-driver towns, softer limits, pair-aware prices, longer chains — raised the late share and lost €300 to €3,800 a week (`docs/journal/v3-night.md`). Paying differently (a flat fee, a fitted booking model, higher or lower openings, more for trusted dealers) and pricing differently (flatter demand, outage levels, lanes, dearer or cheaper options) also lost or was noise.

## 8. Robustness

- Restart: the final's loop rebuilds from the world's state; every five seconds it checks its gigs against the world's.
- Test finals: 20:00 €9,749 (half week), 01:00 €9,337, 320 orders, 96.3% on time, no failed action of note.
- Quotes go out first in every batch: in the final a dealer waits 4.5 real seconds.

## 9. What would break it

- A week with far fewer drivers than ours: the lowest of 64 weeks was 92.4% on time, and the line is 90%.
- Note phrasings outside the reader's vocabulary: declined, so lost orders, not failed visits.
- Two systems on one team key in the same final (it happened at 20:00).
