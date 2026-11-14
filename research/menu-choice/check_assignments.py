import hashlib
import json
import math
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = 'menu-choice-development-v1'
plan = json.loads((ROOT / f'experiments/{NAME}.json').read_text())
attempt_path = ROOT / plan['attempts']
attempt_bytes = attempt_path.read_bytes()
attempts = [json.loads(line) for line in attempt_bytes.splitlines()]
completed = {a['case']['worldId'] for a in attempts if a['event'] == 'completed'}
checks = []
for created in [a for a in attempts if a['event'] == 'created']:
    case = created['case']
    world, trial = case['worldId'], case['trial']
    if world not in completed: continue
    path = ROOT / f'runs/{world}.decisions.json'
    data = path.read_bytes()
    decisions = json.loads(data)
    rows = [d for d in decisions if d['kind'] == 'menu_randomized']
    assert trial['settings']['menuChoice'] or not rows
    assert len(rows) <= 40 and len({r['requestId'] for r in rows}) == len(rows)
    days = Counter(int(r['at'] // 1440) for r in rows)
    assert all(count <= 8 for count in days.values())
    for row in rows:
        r, before, after = row['request'], row['original'], row['action']
        assert r['id'] == row['requestId'] == before['requestId'] == after['requestId']
        assert r['arrivedAt'] <= row['at'] < r['respondBy']
        assert r['note'] is None and len(r['legs']) == 1
        assert not r['legs'][0]['pickup']['privateAddress'] and not r['legs'][0]['delivery']['privateAddress']
        assert set(before['prices']) == set(after['prices']) and len(before['prices']) >= 2
        assert row['probability'] == .5 and row['choices'] == ['original', 'premium'] and row['probabilities'] == [.5, .5]
        digest = hashlib.sha256(f"menu-choice:{trial['settings']['randomSeed']}:{r['id']}".encode()).digest()
        premium = int.from_bytes(digest[:4], 'big') & 1
        assert row['arm'] == ('premium' if premium else 'original')
        for option, price in before['prices'].items():
            assert after['prices'][option] == (math.ceil(price * 1.10) if premium and option == 'same_day' else price)
        sent = [d for d in decisions if d['kind'] == 'portfolio_action' and d['action'] == after]
        acks = [d for d in decisions if d['kind'] == 'action_result' and d['action'] == after]
        assert len(sent) == len(acks) == 1
        assert not sent[0]['plan'].get('anchor')
        assert sent[0]['result'] == acks[0]['result']
    checks.append({'worldId': world, 'trial': trial['id'], 'assignments': len(rows), 'days': dict(days), 'decisionsSha256': hashlib.sha256(data).hexdigest()})
result = {'scope': 'Independent assignment/protocol conformance audit; no economic comparison.', 'attemptsSha256': hashlib.sha256(attempt_bytes).hexdigest(), 'completedWorldsChecked': len(checks), 'plannedWorlds': len(plan['schedule']['trials']), 'completePanel': len(checks) == len(plan['schedule']['trials']), 'worlds': checks, 'assignmentsChecked': sum(r['assignments'] for r in checks)}
(ROOT / f'docs/{NAME}-assignment-audit.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k: result[k] for k in ['completedWorldsChecked', 'plannedWorlds', 'completePanel', 'assignmentsChecked']}))
