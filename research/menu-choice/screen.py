import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
source = ROOT / 'docs/level8-estimate-v1-results.json'
records = []
for row in json.loads(source.read_text())['records']:
    if not row['label'].endswith('-payments'):
        continue
    data = {}
    for kind in ['events', 'decisions']:
        path = ROOT / f"runs/{row['worldId']}.{kind}.json"
        assert hashlib.sha256(path.read_bytes()).hexdigest() == row['artifactHashes'][kind]
        data[kind] = json.loads(path.read_text())
    requests = {e['request']['id']: e['request'] for e in data['events'] if e['kind'] == 'price_request'}
    counts, days = Counter(), Counter()
    selected = []
    for d in data['decisions']:
        if d['kind'] != 'portfolio_action' or d['plan']['kind'] != 'quote' or not d.get('result', {}).get('ok'):
            continue
        counts['quotes'] += 1
        a = d['action']
        r = requests[a['requestId']]
        assert r['arrivedAt'] <= d['at'] < r['respondBy']
        prices = a['prices']
        if d['plan'].get('anchor') or r['note'] is not None or len(r['legs']) != 1:
            continue
        if r['legs'][0]['pickup']['privateAddress'] or r['legs'][0]['delivery']['privateAddress']:
            continue
        if 'same_day' not in prices or len(prices) < 2:
            continue
        counts['eligibleMenuQuotes'] += 1
        day = int(d['at'] // 1440)
        if len(selected) >= 40 or days[day] >= 8:
            continue
        days[day] += 1
        selected.append(a['requestId'])
    records.append({'seed': row['seed'], 'worldId': row['worldId'], **counts, 'boundedAssignments': len(selected), 'assignmentDays': dict(days), 'requestIds': selected, 'artifactHashes': row['artifactHashes']})
report = {'scope': 'Arrival-time eligibility screen of executed historical quotes on eight familiar weeks. No new policy outcomes or counterfactual profit estimate.', 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'eligibility': 'Unanchored successful quote, no note, one public leg, same-day plus at least one later option; at most 40 per week and 8 per day.', 'records': records, 'totals': {k: sum(r.get(k, 0) for r in records) for k in ['quotes', 'eligibleMenuQuotes', 'boundedAssignments']}, 'limitation': 'Conditioned on historical execution and acknowledgements. New trajectories may have different exposure; support does not identify demand substitution or net value.'}
(ROOT / 'docs/menu-choice-screen.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report['totals']))
