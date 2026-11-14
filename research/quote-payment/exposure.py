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
    world = row['worldId']
    for kind in ['events', 'decisions']:
        path = ROOT / f'runs/{world}.{kind}.json'
        assert hashlib.sha256(path.read_bytes()).hexdigest() == row['artifactHashes'][kind]
    decisions = json.loads((ROOT / f'runs/{world}.decisions.json').read_text())
    awards = {e['order']['id'] for e in json.loads((ROOT / f'runs/{world}.events.json').read_text()) if e['kind'] == 'order_won'}
    counts = Counter()
    for decision in decisions:
        if decision['kind'] != 'portfolio_action' or decision['plan']['kind'] != 'quote' or not decision.get('result', {}).get('ok'):
            continue
        counts['executedQuotes'] += 1
        if decision['plan'].get('multiplier', 1) > 1:
            counts['premiumQuotes'] += 1
            counts['premiumAwards'] += decision['action']['requestId'] in awards
    records.append({'seed': row['seed'], 'worldId': world, **counts})
report = {'scope': 'Eight familiar incumbent development weeks; exposure audit, not a counterfactual policy estimate.', 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'records': records, 'totals': {key: sum(row.get(key, 0) for row in records) for key in ['executedQuotes', 'premiumQuotes', 'premiumAwards']}, 'interpretation': 'Quote execution does not persist the selected hypothetical payment multiplier. Fulfillment is replanned after award. Counts establish exposure, not whether a premium was later selected independently or the causal effect of removing these alternatives.'}
(ROOT / 'docs/quote-payment-exposure.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report['totals']))
