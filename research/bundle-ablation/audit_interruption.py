import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
read = lambda path: json.loads((ROOT / path).read_text())
interruption = read('docs/bundle-payment-ablation-v1-interruption.json')
rows = []
for row in interruption['rows']:
    world = row['worldId']
    history = read(f'runs/{world}.server-events.json')
    observed = read(f'runs/{world}.events.json')
    decisions = read(f'runs/{world}.decisions.json')
    assert hashlib.sha256((ROOT / f'runs/{world}.server-events.json').read_bytes()).hexdigest() == row['serverHistory']['sha256']
    assert [e['seq'] for e in history] == list(range(len(history)))
    by_seq = {e['seq']: e for e in history}
    assert all(by_seq[e['seq']] == e for e in observed)
    missing = [e for e in history if e['seq'] > observed[-1]['seq'] and e['at'] <= row['interruptedAt']]
    rows.append({'worldId': world, 'lastObservedSeq': observed[-1]['seq'], 'lastObservedAt': observed[-1]['at'], 'interruptedAt': row['interruptedAt'], 'unobservedEventsThroughSnapshotTime': missing, 'lastDecisionKinds': [{'kind': d['kind'], 'at': d.get('at')} for d in decisions[-5:]], 'serverHistorySha256': row['serverHistory']['sha256']})
report = {
    'scope': 'Retrospective event-integrity audit, not proof that failed mutations had no effect.',
    'rows': rows,
    'finding': 'Observed events exactly match complete server history; no unobserved events appear between the last received event and the pre-closure snapshot time. Absence of events cannot identify an unacknowledged quote or another mutation without a public event.',
    'decision': 'Do not rebuild portfolio reservations or replay ambiguous mutations from this evidence. Preserve original failures. A separately frozen, bounded follow-up uses unchanged runtime and economic policy; there is no automatic replacement loop.',
}
(ROOT / 'docs/bundle-payment-interruption-audit.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'audited': len(rows), 'unobservedEvents': sum(len(r['unobservedEventsThroughSnapshotTime']) for r in rows)}))

followup = ROOT / 'docs/bundle-payment-followup-v1-results.json'
if followup.exists():
    result = json.loads(followup.read_text())
    original = {r['seed']: r for r in result['originalFailures']}
    prefixes = []
    for row in result['records']:
        if row['origin'] != 'new' or row['status'] != 'complete': continue
        old_world = original[row['seed']]['worldId']
        before = read(f'runs/{old_world}.events.json')
        after = read(f"runs/{row['worldId']}.events.json")
        prefixes.append({'seed': row['seed'], 'originalWorld': old_world, 'followupWorld': row['worldId'], 'originalObservedEvents': len(before), 'identicalObservedPrefix': before == after[:len(before)]})
    (ROOT / 'docs/bundle-payment-followup-v1-prefix-audit.json').write_text(json.dumps({'scope': 'Observed event prefixes only; does not establish unacknowledged mutation effects or independent replication.', 'rows': prefixes}, indent=2) + '\n')
