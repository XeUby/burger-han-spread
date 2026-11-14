import hashlib
import json
import statistics
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path):
    return json.loads((ROOT / path).read_text())


def conditional_fee(outcomes, revenue):
    probabilities = [(o['revenueCents'] + o['penaltyCents'] / 2) / revenue for o in outcomes]
    assert all(0 < p <= 1.001 for p in probabilities)
    return statistics.mean(o['fulfillmentCents'] / p for o, p in zip(outcomes, probabilities))


def audit(record, arm):
    world = record['worldId']
    for kind, expected in record['artifactHashes'].items():
        assert hashlib.sha256((ROOT / f'runs/{world}.{kind}.json').read_bytes()).hexdigest() == expected
    events = read(f'runs/{world}.events.json')
    snapshot = read(f'runs/{world}.snapshot.json')
    decisions = read(f'runs/{world}.decisions.json')
    awards = {e['order']['id']: e['order'] for e in events if e['kind'] == 'order_won'}
    cancelled = {e['orderId'] for e in events if e['kind'] == 'order_cancelled'}
    gigs = {g['id']: {s['orderId'] for s in g['stops']} for g in snapshot['gigs']}
    bundled = set().union(*(ids for ids in gigs.values() if len(ids) > 1))
    costs = Counter()
    for e in events:
        if e['kind'] != 'ledger' or e['line']['kind'] != 'driver_fee':
            continue
        line = e['line']
        ids = gigs[line['gigId']]
        if len(ids) == 1:
            costs[next(iter(ids))] -= line['cents']
    latest = None
    predictions = {}
    excluded = Counter()
    for d in decisions:
        if d['kind'] == 'portfolio_solve':
            latest = d
            continue
        if d['kind'] != 'portfolio_action' or d['action']['type'] != 'quote' or not d.get('result', {}).get('ok') or d['plan']['kind'] != 'quote':
            continue
        request = d['action']['requestId']
        if request not in awards:
            continue
        assert latest and latest['at'] == d['at']
        selected = [a for a in latest['input']['alternatives'] if a['id'] in latest['result']['selected'] and latest['plans'][a['id']].get('requestId') == request and latest['plans'][a['id']]['kind'] == 'quote']
        assert len(selected) == 1
        candidate = selected[0]
        plan = latest['plans'][candidate['id']]
        reason = 'anchoredQuote' if plan.get('anchor') else 'cancelled' if request in cancelled else 'everBundled' if request in bundled else None
        if reason:
            excluded[reason] += 1
            continue
        assert not plan['owned']
        revenue = min(d['action']['prices'].values())
        # Revenue plus half the failure penalty recovers win-weighted quoted revenue.
        predicted = conditional_fee(candidate['outcomes'], revenue)
        predictions[request] = {'requestId': request, 'predictedFeeCents': predicted, 'actualFeeCents': costs[request], 'menuOptions': len(d['action']['prices']), 'awardedOption': awards[request]['option'], 'paymentMultiplier': plan.get('multiplier'), 'quotedAt': d['at']}
    rows = list(predictions.values())
    assert len(rows) + sum(excluded.values()) == len(awards)
    def totals(items):
        predicted = sum(r['predictedFeeCents'] for r in items)
        actual = sum(r['actualFeeCents'] for r in items)
        return {'orders': len(items), 'predictedEuros': predicted / 100, 'actualEuros': actual / 100, 'actualMinusPredictedEuros': (actual - predicted) / 100, 'actualToPredicted': actual / predicted if predicted else None}
    return {'arm': arm, 'seed': record['seed'], 'worldId': world, 'awards': len(awards), 'excluded': dict(excluded), 'totals': totals(rows), 'byOption': {option: totals([r for r in rows if r['awardedOption'] == option]) for option in sorted({r['awardedOption'] for r in rows})}, 'orders': rows}


def main():
    incumbent = [r for r in read('docs/level8-estimate-v1-results.json')['records'] if r['label'].endswith('-payments')]
    option = read('docs/option-specific-development-v1-results.json')['records']
    records = [audit(r, arm) for arm, panel in [('incumbent', incumbent), ('singleOption', option)] for r in panel]
    summary = {}
    for arm in ['incumbent', 'singleOption']:
        rows = [r for r in records if r['arm'] == arm]
        summary[arm] = {'weeks': len(rows), 'eligibleOrders': sum(r['totals']['orders'] for r in rows), 'awards': sum(r['awards'] for r in rows), 'meanWeeklyActualMinusPredictedEuros': statistics.mean(r['totals']['actualMinusPredictedEuros'] for r in rows), 'meanWeeklyActualToPredicted': statistics.mean(r['totals']['actualToPredicted'] for r in rows), 'weeksUnderpredicted': sum(r['totals']['actualMinusPredictedEuros'] > 0 for r in rows)}
    report = {'scope': 'Retrospective accepted-work diagnostic on familiar development weeks; no new experiment or causal cost estimate.', 'method': 'Recover conditional solo fulfillment fees from the executed quote scenario outcomes using (revenue + penalty/2)/minimum quoted price as win probability. Average scenario conditional costs equally. Compare all realized driver-fee ledger lines for the same order, including later solo reposts. Exclude anchored acquisitions, cancelled orders and every order ever included in a multi-order posted gig; do not allocate shared fees.', 'limitations': ['Eligibility depends on later bundling and awards: this selected sample does not validate costs for all acquired or rejected work.', 'Scenario averages are not posterior probabilities conditional on winning; quote outcome rounding introduces small reconstruction error.', 'Menu option choice, later replanning and hypothetical quote payment multipliers can differ from realized execution; differences diagnose the combined forecast, not a causal component.', 'Panels have eight and six familiar overlapping seeds; order counts are not independent replication. This audit is not a policy comparison.', 'Driver fees exclude refunds, release fees, penalties and capacity value; no full economic-model validation is claimed.'], 'summary': summary, 'records': records}
    (ROOT / 'docs/fulfillment-cost-diagnostic.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
