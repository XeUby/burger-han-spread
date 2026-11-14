import hashlib
import json
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from research.value.report import load_world, paired, summarize

NAME = 'private-coverage-development-v2'
read = lambda path: json.loads((ROOT / path).read_text())
sha = lambda path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def exposures(world, events, decisions, snapshot):
    assignments = [d for d in decisions if d['kind'] == 'private_randomized']
    gigs = {g['id']: {s['orderId'] for s in g['stops']} for g in snapshot['gigs']}
    for d in decisions:
        if d['kind'] == 'post': gigs.setdefault(d['gigId'], set()).update(s['orderId'] for s in d['post']['stops'])
    awards, losses, cancelled = set(), set(), set()
    ledger, visits = defaultdict(Counter), defaultdict(list)
    states = {}
    unallocated = []
    affected = set()
    global_unknown = False
    for event in events:
        kind = event['kind']
        if kind in ['order_won', 'order_changed']: states[event['order']['id']] = event['order']
        if kind == 'order_won': awards.add(event['order']['id'])
        if kind == 'order_lost': losses.add(event['requestId'])
        if kind == 'order_cancelled': cancelled.add(event['orderId'])
        if kind in ['picked_up', 'delivered']:
            order = states[event['orderId']]
            stop = order['legs'][event['leg']]['pickup' if kind == 'picked_up' else 'delivery']
            visits[event['orderId']].append({'kind': kind, 'at': event['at'], 'leg': event['leg'], 'private': stop['privateAddress'], 'window': stop['window'], 'moreThan30MinutesAfterPrivateWindow': stop['privateAddress'] and event['at'] > stop['window']['to'] + 30})
        if kind != 'ledger': continue
        line = event['line']
        members = gigs.get(line.get('gigId'), set())
        order_id = line.get('orderId')
        if len(members) > 1:
            affected.update(members); unallocated.append(line)
        elif order_id:
            ledger[order_id][line['kind']] += line['cents']
        elif len(members) == 1:
            ledger[next(iter(members))][line['kind']] += line['cents']
        else:
            unallocated.append(line)
            global_unknown = global_unknown or line['cents'] < 0
    if global_unknown: affected.update(awards)
    rows = []
    for assignment in assignments:
        request = assignment['requestId']
        actions = [d for d in decisions if d['kind'] == 'action_result' and d['action']['type'] == 'quote' and d['action']['requestId'] == request and d['action'] == assignment['action']]
        assert len(actions) <= 1, 'Duplicate assigned quote'
        result = actions[0].get('result') if actions else None
        known = bool(result and result.get('ok') and request in awards | losses)
        contribution = sum(ledger[request].values()) if known and request not in affected else None
        rows.append({**assignment, 'worldId': world, 'actionResult': result, 'won': request in awards, 'lost': request in losses, 'cancelled': request in cancelled, 'contributionCents': contribution, 'allocatedLedger': dict(ledger[request]), 'sharedCostUnknown': request in affected, 'visits': visits[request], 'failedVisits': [e for e in events if e['kind'] == 'visit_failed' and e['orderId'] == request]})
    return rows, unallocated


def main():
    plan = read(f'experiments/{NAME}.json')
    for file, expected in plan['files'].items(): assert sha(file) == expected, file
    attempts_path = ROOT / plan['attempts']
    attempts = [json.loads(line) for line in attempts_path.read_text().splitlines()] if attempts_path.exists() else []
    records, observations, unallocated = [], [], []
    for trial in plan['schedule']['trials']:
        arm = 'coverage' if trial['settings']['privateCoverage'] else 'control'
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
            if arm == 'control': config.pop('privateCoverage')
            outcome = load_world(ROOT, world, trial['seed'], {'revision': plan['arms'][arm]['revision'], 'settings': config})
            events = read(f'runs/{world}.events.json'); decisions = read(f'runs/{world}.decisions.json'); snapshot = read(f'runs/{world}.snapshot.json')
            ledger = Counter()
            for e in events:
                if e['kind'] == 'ledger': ledger[e['line']['kind']] += e['line']['cents']
            assert sum(ledger.values()) == outcome['marginCents']
            row.update(score={k: outcome[k] for k in ['marginCents', 'revenueCents', 'wonOrders', 'onTimeOrders', 'onTimeShare', 'undeliveredOrders', 'ranked']}, ledger=dict(ledger), failedVisits=sum(e['kind'] == 'visit_failed' for e in events), actionErrors=read(f'runs/{world}.errors.json'), recoveries=read(f'runs/{world}.recoveries.json'), mechanisms=dict(Counter(d['kind'] for d in decisions)))
            if arm == 'coverage':
                rows, unknown = exposures(world, events, decisions, snapshot)
                observations.extend({**r, 'seed': trial['seed']} for r in rows)
                unallocated.extend({'worldId': world, 'line': line} for line in unknown)
                row['funnel'] = dict(Counter(d['reason'] for d in decisions if d['kind'] == 'private_funnel'))
        elif arm == 'coverage' and 'decisions' in row['artifactHashes']:
            partial = read(f'runs/{world}.decisions.json')
            observations.extend({**d, 'worldId': world, 'seed': trial['seed'], 'followupIncomplete': True, 'contributionCents': None} for d in partial if d['kind'] == 'private_randomized')
        records.append(row)
    problems = [a for a in attempts if a['event'] in ['failed', 'creation_unknown', 'scheduler_failed']]
    terminal = all(r['status'] == 'complete' for r in records) and not problems
    report = {'scope': 'Eight paired fresh-at-freeze development weeks; randomized private acquisition coverage, no promotion.', 'terminal': terminal, 'expected': 16, 'completed': sum(r['status'] == 'complete' for r in records), 'records': records, 'operationalProblems': problems, 'summary': {}, 'paired': None, 'supportPassed': False, 'limitations': ['Sequential assignments interfere through capacity and dealer trust; direct contribution omits displacement. Whole-week pairs capture package effects.', 'Eight development seed blocks, not independent request rows; all seeds are now excluded from untouched validation.', 'Shared costs and unknown mutation outcomes remain unallocated, never zero-imputed.', 'One quote rule cannot identify price elasticity or menu-choice behavior.'], 'observations': observations, 'unallocatedLedger': unallocated}
    if terminal:
        arms = {arm: [r for r in records if r['arm'] == arm] for arm in ['control', 'coverage']}
        control = {r['seed']: r for r in arms['control']}
        report['summary'] = {arm: summarize(rows) for arm, rows in arms.items()}
        report['paired'] = paired([r['score']['marginCents'] - control[r['seed']]['score']['marginCents'] for r in arms['coverage']])
        support = {arm: {'assigned': sum(r['arm'] == arm for r in observations), 'weeks': len({r['seed'] for r in observations if r['arm'] == arm}), 'wins': sum(r['arm'] == arm and r['won'] for r in observations), 'knownContribution': sum(r['arm'] == arm and r['contributionCents'] is not None for r in observations)} for arm in ['decline', 'quote']}
        report['support'] = support
        report['supportPassed'] = all(s['assigned'] >= 12 and s['weeks'] >= 3 for s in support.values()) and sum(s['wins'] for s in support.values()) >= 10
        report['knownCostWins'] = sum(r['won'] and r['contributionCents'] is not None for r in observations)
        report['privateOutcomes'] = {'awards': sum(r['won'] for r in observations), 'cancelled': sum(r['cancelled'] for r in observations), 'failedVisits': sum(len(r['failedVisits']) for r in observations), 'privateVisitsOver30MinutesLate': sum(v['moreThan30MinutesAfterPrivateWindow'] for r in observations for v in r['visits']), 'unknownContributions': sum(r['contributionCents'] is None for r in observations)}
        contrasts = []
        for record in arms['coverage']:
            rows = [r for r in observations if r['seed'] == record['seed']]
            known = bool(rows) and all(r['contributionCents'] is not None for r in rows)
            contrasts.append({'seed': record['seed'], 'assigned': len(rows), 'completeContribution': known, 'ipwMeanContributionCents': sum(r['contributionCents'] / r['probability'] * (1 if r['arm'] == 'quote' else -1) for r in rows) / len(rows) if known else None, 'armMeansCents': {arm: statistics.mean(r['contributionCents'] for r in rows if r['arm'] == arm) if known and any(r['arm'] == arm for r in rows) else None for arm in ['decline', 'quote']}})
        report['weeklyAssignmentContrasts'] = contrasts
        if all(r['completeContribution'] for r in contrasts): report['assignmentContrast'] = paired([r['ipwMeanContributionCents'] for r in contrasts])
        report['decision'] = 'Support allows separately frozen held-out model checks only; no scaling or promotion.' if report['supportPassed'] and report['knownCostWins'] >= 10 else 'Insufficient support for cost-model fitting or scaling private acquisition; retain all outcomes.'
    (ROOT / f'docs/{NAME}-results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ['terminal', 'completed', 'expected', 'paired', 'supportPassed']}, indent=2))


if __name__ == '__main__': main()
