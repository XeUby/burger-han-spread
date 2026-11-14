import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = 'menu-choice-development-v1'
events = [json.loads(line) for line in (ROOT / f'experiments/{NAME}-attempts.jsonl').read_text().splitlines()]
active, peak, occupancy, before = set(), 0, None, []
for event in events:
    if event['event'] == 'occupancy': occupancy = event['worlds']
    if event['event'] == 'creating':
        assert occupancy is not None and len(occupancy) < 8
        before.append(len(occupancy))
    if event['event'] == 'created':
        active.add(event['case']['worldId'])
        peak = max(peak, len(active))
        assert len(active) <= 3
    if event['event'] == 'completed': active.remove(event['case']['worldId'])
path = ROOT / f'docs/{NAME}-operations.json'
report = json.loads(path.read_text())
assert active == {case['worldId'] for case in report['cases'] if case.get('worldId') and not case['official']['ended']}
assert all(case['official']['ended'] for case in report['cases'] if case['status'] == 'completed')
report['ownConcurrencyAudit'] = {'maximumConcurrentStudyWorlds': peak, 'retainedPrivateWorldAllowance': 1, 'maximumOwnUnfinishedBound': peak + 1, 'remainingStudyWorlds': sorted(active), 'sharedOccupancyBeforeEachCreation': before, 'method': 'Count each created world until journal completion, plus one reserved slot for the interrupted private study. A failed world remains counted.'}
path.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report['ownConcurrencyAudit']))
