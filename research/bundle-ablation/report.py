import hashlib
import json
import statistics
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from research.value.report import load_world, paired, summarize

NAME = 'bundle-payment-ablation-v1'
read = lambda path: json.loads((ROOT / path).read_text())
plan = read(f'experiments/{NAME}.json')
for file, expected in plan['files'].items():
    assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == expected, file
source = hashlib.sha256()
for file in sorted((ROOT / plan['bundle'] / 'src').glob('*.ts')):
    source.update(file.name.encode()); source.update(file.read_bytes())
revision = source.hexdigest()
defaults = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', 'const {defaults}=await import(process.argv[1]);console.log(JSON.stringify(defaults))', (ROOT / plan['bundle'] / 'src/policy.ts').as_uri()], text=True))
attempts = [json.loads(line) for line in (ROOT / plan['attempts']).read_text().splitlines()]
starts = [e for e in attempts if e['event'] == 'created']
assert len({e['case']['trial']['id'] for e in starts}) == len(starts)
records = []
for trial in plan['schedule']['trials']:
    start = next((e for e in starts if e['case']['trial']['id'] == trial['id']), None)
    row = {'seed': trial['seed'], 'level': trial['level'], 'label': trial['id'], 'arm': 'control-low' if '-control-low-' in trial['id'] else 'portfolio-high', 'status': 'not_started', 'origin': 'new'}
    if start:
        world = start['case']['worldId']
        failures = [e for e in attempts if e['event'] in ['failed', 'creation_unknown'] and e.get('case', {}).get('trial', {}).get('id') == trial['id']]
        row.update(worldId=world, runtimeFailures=failures, status='failed' if failures else 'running')
        row['retainedArtifactHashes'] = {kind: hashlib.sha256((ROOT / f'runs/{world}.{kind}.json').read_bytes()).hexdigest() for kind in ['meta', 'events', 'errors', 'recoveries', 'decisions', 'interruption-snapshot', 'interruption-score', 'administrative-events', 'administrative-snapshot', 'administrative-score', 'server-events'] if (ROOT / f'runs/{world}.{kind}.json').exists()}
        complete = next((e for e in attempts if e['event'] == 'completed' and e['case']['worldId'] == world), None)
        if complete:
            assert not failures
            result = load_world(ROOT, world, trial['seed'], {'revision': revision, 'settings': {**defaults, **trial['settings']}})
            events = read(f'runs/{world}.events.json')
            decisions = read(f'runs/{world}.decisions.json')
            ledger = Counter()
            for e in events:
                if e['kind'] == 'ledger': ledger[e['line']['kind']] += e['line']['cents']
            assert sum(ledger.values()) == result['marginCents']
            score = {k: result[k] for k in ['marginCents', 'revenueCents', 'wonOrders', 'onTimeOrders', 'onTimeShare', 'undeliveredOrders', 'ranked']}
            row.update(status='complete', score=score, ledger=dict(ledger), failedVisits=sum(e['kind'] == 'visit_failed' for e in events), actionErrors=read(f'runs/{world}.errors.json'), recoveries=read(f'runs/{world}.recoveries.json'), mechanisms=dict(Counter(d['kind'] for d in decisions)), bundles=sum(d['kind'] == 'action_result' and d['action']['type'] == 'post' and d.get('result', {}).get('ok') and len({s['orderId'] for s in d['action']['stops']}) > 1 for d in decisions), artifactHashes={kind: hashlib.sha256((ROOT / f'runs/{world}.{kind}.json').read_bytes()).hexdigest() for kind in ['meta', 'score', 'events', 'snapshot', 'errors', 'recoveries', 'decisions']})
    else:
        row['runtimeFailures'] = [e for e in attempts if e['event'] in ['failed', 'creation_unknown'] and e.get('case', {}).get('trial', {}).get('id') == trial['id']]
        if row['runtimeFailures']: row['status'] = 'creation_unknown'
    records.append(row)
archived = read('docs/level8-estimate-v1-results.json')
for old in archived['records']:
    if old['seed'] not in plan['archivedSeeds']: continue
    for kind, expected in old['artifactHashes'].items():
        assert hashlib.sha256((ROOT / f"runs/{old['worldId']}.{kind}.json").read_bytes()).hexdigest() == expected
    records.append({**old, 'origin': 'archived', 'arm': 'control-high' if old['label'].endswith('-benchmark') else 'portfolio-low'})
assert len(records) == 16
terminal = all(r['status'] == 'complete' for r in records) and not any(e['event'] in ['scheduler_failed', 'creation_unknown', 'failed'] for e in attempts)
report = {'scope': 'Four familiar underlying seed blocks; whole-week policy-package x bundle-input payment convention ablation. Eight new and eight exact archived outcomes. No independent validation or promotion.', 'terminal': terminal, 'completed': sum(r['status'] == 'complete' for r in records), 'expected': 16, 'newWorlds': len(starts), 'records': records, 'summary': {}, 'contrasts': {}, 'limitations': ['The architecture factor includes the whole retained portfolio package, including future/payment choices.', 'Convention changes the entire derived bundle ladder and the existing modeled saving, not only a single posted opening fee. Solo payment and existing open-anchor schedules are retained.', 'Four blocks provide weak uncertainty and qualification evidence. More posts do not increase the independent sample size.', 'No counterfactual driver outcomes are inferred from unchosen fees. Whole-week random worlds capture the policy-dependent event trajectory.']}
if not terminal:
    controls = {arm: {r['seed']: r for r in records if r['arm'] == arm and r['status'] == 'complete'} for arm in ['control-high', 'control-low']}
    if all(set(rows) == set(plan['archivedSeeds']) for rows in controls.values()):
        report['incompletePanelDiagnostics'] = {
            'scope': 'Only the complete control payment contrast; cannot estimate the portfolio payment effect or interaction, and cannot promote a policy from this interrupted factorial panel.',
            'arms': {arm: summarize(list(rows.values())) for arm, rows in controls.items()},
            'controlPaymentEffect': paired([controls['control-low'][s]['score']['marginCents'] - controls['control-high'][s]['score']['marginCents'] for s in plan['archivedSeeds']]),
        }
    report['decision'] = 'Full factorial inference unavailable after four HTTP502 interruptions. Keep the current candidate and control unchanged; do not silently replace the failed portfolio-high cases. Lower bundle payments alone are not a reliable control improvement on these development blocks.'
if terminal:
    arms = {arm: {r['seed']: r for r in records if r['arm'] == arm} for arm in ['control-high', 'control-low', 'portfolio-high', 'portfolio-low']}
    for arm, rows in arms.items():
        assert set(rows) == set(plan['archivedSeeds'])
        report['summary'][arm] = summarize(list(rows.values()))
    comparisons = [('controlPaymentEffect', 'control-low', 'control-high'), ('portfolioPaymentEffect', 'portfolio-low', 'portfolio-high'), ('architectureAtHigh', 'portfolio-high', 'control-high'), ('architectureAtLow', 'portfolio-low', 'control-low')]
    for name, a, b in comparisons:
        report['contrasts'][name] = paired([arms[a][s]['score']['marginCents'] - arms[b][s]['score']['marginCents'] for s in plan['archivedSeeds']])
        kinds = set().union(*(r['ledger'] for r in arms[a].values()), *(r['ledger'] for r in arms[b].values()))
        report['contrasts'][name]['meanLedgerDifferenceEuros'] = {k: statistics.mean(arms[a][s]['ledger'].get(k, 0) - arms[b][s]['ledger'].get(k, 0) for s in plan['archivedSeeds']) / 100 for k in sorted(kinds)}
    report['contrasts']['interaction'] = paired([(arms['portfolio-low'][s]['score']['marginCents'] - arms['portfolio-high'][s]['score']['marginCents']) - (arms['control-low'][s]['score']['marginCents'] - arms['control-high'][s]['score']['marginCents']) for s in plan['archivedSeeds']])
(ROOT / f'docs/{NAME}-results.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: report[k] for k in ['terminal', 'completed', 'expected', 'summary', 'contrasts']}, indent=2))
