# Final operator runbook

This is an operational checklist, not proof of live readiness.

1. Use a stable machine and network, preferably near Stockholm as the organizers suggest. Keep it powered and awake.
2. Install from requirements.txt, set .env locally, run unit tests and agreed practice seeds.
3. Choose an exact commit and policy flags. Record them. Stop tuning against final state.
4. One operator owns the final process. Other teammates may inspect logs, but must not launch a second --final instance.
5. Saturday 14:00/20:00 Helsinki: run the live test. Observe request latency, action refusals, reconnect and score. Restart the process during the test and verify recovery.
6. Registration must be complete before Sunday 07:30. Start `python run.py --final` before 08:00, with the selected flags. The runner waits for the scheduled final.
7. If the process exits, restart the SAME command immediately. The server week continues. Do not create a practice world to replace it.
8. At completion save the final score, world id, logs, commit and configuration. Organizers replay scores.
9. Submit hash, code and presentation to Junction by Sunday 10:00. Never submit SPREAD_KEY.

Current limits: final stream path follows the official kit but has not been tested on the live clock. Snapshot/history overlap and actions that race a booking need further replay/restart validation. Do not advertise this version as final-ready until Saturday's test passes.
