import hashlib
import json
import statistics
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from research.value.report import load_world, paired, summarize
from scipy.stats import t

NAME = 'menu-choice-development-v1'
read = lambda path: json.loads((ROOT / path).read_text())
sha = lambda path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def choices(events, decisions):
    awards = {e['order']['id']: e['order']['option'] for e in events if e['kind'] == 'order_won'}
    losses = {e['requestId'] for e in events if e['kind'] == 'order_lost'}
    cancelled = {e['orderId'] for e in events if e['kind'] == 'order_cancelled'}
    rows = []
    seen = set()
    for assignment in decisions:
        if assignment['kind'] != 'menu_randomized': continue
        request = assignment['requestId']
        assert request not in seen
        seen.add(request)
        assert assignment['probability'] == .5
        acks = [d for d in decisions if d['kind'] == 'action_result' and d['action'] == assignment['action']]
        assert len(acks) <= 1
        result = acks[0].get('result') if acks else None
        known = bool(result and result.get('ok') and (request in awards or request in losses))
        assert not (request in awards and request in losses)
        chosen = awards.get(request)
        if chosen: assert chosen in assignment['action']['prices']
        outcome = ('same_day' if chosen == 'same_day' else 'later' if chosen else 'no_purchase') if known else None
        rows.append({**assignment, 'actionResult': result, 'chosenOption': chosen, 'outcome': outcome, 'cancelled': request in cancelled})
    return rows


def probability_summary(values):
    mean = statistics.mean(values)
    radius = float(t.ppf(.975, len(values)-1)) * statistics.stdev(values) / len(values)**.5
    return {'weeks': len(values), 'meanDifferencePercentagePoints': mean*100, 'descriptivePairedT95PercentagePoints': [(mean-radius)*100, (mean+radius)*100]}


def main():
    plan = read(f'experiments/{NAME}.json')
    for file, expected in plan['files'].items(): assert sha(file) == expected, file
    path = ROOT / plan['attempts']
    attempts = [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
    records, observations = [], []
    for trial in plan['schedule']['trials']:
        arm = 'menu' if trial['settings']['menuChoice'] else 'control'
        starts = [a for a in attempts if a['event'] == 'created' and a['case']['trial']['id'] == trial['id']]
        assert len(starts) <= 1
        row = {'label': trial['id'], 'seed': trial['seed'], 'arm': arm, 'status': 'not_started', 'level': 8}
        if not starts:
            unknown = [a for a in attempts if a['event'] == 'creation_unknown' and a['case']['trial']['id'] == trial['id']]
            if unknown: row.update(status='creation_unknown', runtimeFailures=unknown)
            records.append(row); continue
        world = starts[0]['case']['worldId']
        completed = any(a['event'] == 'completed' and a['case']['worldId'] == world for a in attempts)
        failures = [a for a in attempts if a['event'] == 'failed' and a['case']['worldId'] == world]
        row.update(worldId=world, status='complete' if completed else 'failed' if failures else 'running', runtimeFailures=failures)
        row['artifactHashes'] = {kind: sha(f'runs/{world}.{kind}.json') for kind in ['meta', 'events', 'decisions', 'score', 'snapshot', 'errors', 'recoveries'] if (ROOT / f'runs/{world}.{kind}.json').exists()}
        if completed:
            config = {**plan['arms'][arm]['defaults'], **trial['settings']}
            if arm == 'control': config.pop('menuChoice')
            outcome = load_world(ROOT, world, trial['seed'], {'revision': plan['arms'][arm]['revision'], 'settings': config})
            events = read(f'runs/{world}.events.json'); decisions = read(f'runs/{world}.decisions.json')
            ledger = Counter()
            for event in events:
                if event['kind'] == 'ledger': ledger[event['line']['kind']] += event['line']['cents']
            assert sum(ledger.values()) == outcome['marginCents']
            row.update(score={k: outcome[k] for k in ['marginCents', 'revenueCents', 'wonOrders', 'onTimeOrders', 'onTimeShare', 'undeliveredOrders', 'ranked']}, ledger=dict(ledger), cancelledOrders=sum(e['kind'] == 'order_cancelled' for e in events), failedVisits=sum(e['kind'] == 'visit_failed' for e in events), actionErrors=read(f'runs/{world}.errors.json'), recoveries=read(f'runs/{world}.recoveries.json'), mechanisms=dict(Counter(d['kind'] for d in decisions)))
            if arm == 'menu': observations.extend({**r, 'seed': trial['seed'], 'worldId': world} for r in choices(events, decisions))
        elif arm == 'menu' and 'decisions' in row['artifactHashes']:
            observations.extend({**d, 'worldId': world, 'seed': trial['seed'], 'followupIncomplete': True, 'outcome': None} for d in read(f'runs/{world}.decisions.json') if d['kind'] == 'menu_randomized')
        records.append(row)
    problems = [a for a in attempts if a['event'] in ['failed', 'creation_unknown', 'scheduler_failed']]
    terminal = all(r['status'] == 'complete' for r in records) and not problems
    report = {'scope': 'Eight paired development weeks; randomized menu-choice coverage, no promotion.', 'terminal': terminal, 'completed': sum(r['status'] == 'complete' for r in records), 'expected': 16, 'records': records, 'observations': observations, 'operationalProblems': problems, 'summary': {}, 'paired': None, 'supportPassed': False, 'limitations': ['Eight whole-seed blocks, not independent requests.', 'Local contrasts concern the two menus under sequential exploratory eligibility; capacity and trust interfere across assignments.', 'Whole-week package includes suppressed scalar demand updates as well as relative-price exploration.', 'Unknown actions and outcomes are not no-purchase observations. No conditional-on-win comparison identifies substitution.']}
    if terminal:
        arms = {arm: [r for r in records if r['arm'] == arm] for arm in ['control', 'menu']}
        controls = {r['seed']: r for r in arms['control']}
        report['summary'] = {arm: summarize(rows) for arm, rows in arms.items()}
        report['paired'] = paired([r['score']['marginCents'] - controls[r['seed']]['score']['marginCents'] for r in arms['menu']])
        report['support'] = {arm: {'knownAssignments': sum(r['arm'] == arm and r['outcome'] is not None for r in observations), 'weeks': len({r['seed'] for r in observations if r['arm'] == arm and r['outcome'] is not None})} for arm in ['original', 'premium']}
        report['laterAwards'] = sum(r['outcome'] == 'later' for r in observations)
        report['unknownOutcomes'] = sum(r['outcome'] is None for r in observations)
        report['supportPassed'] = all(v['knownAssignments'] >= 100 and v['weeks'] >= 6 for v in report['support'].values()) and report['laterAwards'] >= 20 and report['unknownOutcomes'] == 0
        contrasts = []
        for record in arms['menu']:
            rows = [r for r in observations if r['seed'] == record['seed']]
            known = bool(rows) and all(r['outcome'] is not None for r in rows)
            contrasts.append({'seed': record['seed'], 'assigned': len(rows), 'completeOutcomes': known, 'ipwContrasts': {outcome: sum((r['outcome'] == outcome) / r['probability'] * (1 if r['arm'] == 'premium' else -1) for r in rows) / len(rows) for outcome in ['same_day', 'later', 'no_purchase']} if known else None})
        report['weeklyAssignmentContrasts'] = contrasts
        if all(r['completeOutcomes'] for r in contrasts): report['menuEffects'] = {outcome: probability_summary([r['ipwContrasts'][outcome] for r in contrasts]) for outcome in ['same_day', 'later', 'no_purchase']}
        report['decision'] = 'Support permits separately frozen model assessment, not promotion or a causal claim for untested menus.' if report['supportPassed'] else 'Insufficient support; do not extend, fit or promote.'
    (ROOT / f'docs/{NAME}-results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ['terminal', 'completed', 'expected', 'paired', 'supportPassed']}))


if __name__ == '__main__': main()
