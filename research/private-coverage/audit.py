import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = 'private-coverage-development-v2'
events = [json.loads(line) for line in (ROOT / f'experiments/{NAME}-attempts.jsonl').read_text().splitlines()]
active = set()
peak = 0
occupancy = None
before = []
for event in events:
    if event['event'] == 'occupancy':
        occupancy = event['worlds']
    if event['event'] == 'creating':
        assert occupancy is not None and len(occupancy) < 8
        before.append(len(occupancy))
    if event['event'] == 'created':
        active.add(event['case']['worldId'])
        peak = max(peak, len(active))
        assert len(active) <= 4
    if event['event'] == 'completed':
        active.remove(event['case']['worldId'])
path = ROOT / f'docs/{NAME}-operations.json'
report = json.loads(path.read_text())
official_open = {case['worldId'] for case in report['cases'] if case.get('worldId') and not case['official']['ended']}
assert active == official_open
assert all(case['official']['ended'] for case in report['cases'] if case['status'] == 'completed')
report['ownConcurrencyAudit'] = {
    'maximumConcurrentOwnWorlds': peak,
    'sharedOccupancyBeforeEachCreation': before,
    'remainingOwnWorlds': len(active),
    'remainingOwnWorldIds': sorted(active),
    'method': 'Created worlds remain active until the journal records completion. A failure would remain counted until separately verified ended.',
}
path.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report['ownConcurrencyAudit']))
