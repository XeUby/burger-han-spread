import json
import statistics
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
read = lambda path: json.loads((ROOT / path).read_text())
report = read('docs/level8-estimate-v1-results.json')
rows = []
for record in report['records']:
    if not record['label'].endswith('-payments'):
        continue
    world = record['worldId']
    events = read(f'runs/{world}.events.json')
    requests = {e['request']['id']: e['request'] for e in events if e['kind'] == 'price_request'}
    won = {e['order']['id'] for e in events if e['kind'] == 'order_won'}
    decisions = read(f'runs/{world}.decisions.json')
    counts = Counter(requests=len(requests), awards=len(won))
    categories = Counter()
    latest = None
    frames = Counter()
    quoted = set()
    declined = set()
    considered = set()
    quote_risks = []
    future_costs = []
    for d in decisions:
        if d['kind'] == 'portfolio_solve':
            latest = d
            frames['total'] += 1
            frames['optimal'] += d['result']['status'] == 'OPTIMAL'
            frames['fallback'] += d['result']['usedBaselineFallback']
            frames['candidateCapReached'] += len(d['input']['alternatives']) >= 120
            frames['omittedCandidates'] += d['omitted']
            offered = {p['requestId'] for p in d['plans'].values() if p['kind'] == 'quote'}
            considered.update(offered)
            frames['multipleRequests'] += len({p['requestId'] for p in d['plans'].values() if p.get('requestId')}) > 1
            continue
        if d['kind'] != 'portfolio_action' or d['action']['type'] != 'quote' or not d.get('result', {}).get('ok'):
            continue
        request_id = d['action']['requestId']
        request = requests[request_id]
        assert latest and latest['at'] == d['at']
        plans = latest['plans']
        quote_ids = [key for key, p in plans.items() if p['kind'] == 'quote' and p.get('requestId') == request_id]
        category = 'multiLeg' if len(request['legs']) > 1 else 'privateSingle' if any(s['privateAddress'] for leg in request['legs'] for s in [leg['pickup'], leg['delivery']]) else 'publicSingle'
        if d['plan']['kind'] == 'decline':
            declined.add(request_id)
            cause = 'noQuoteCandidate' if not quote_ids else 'solverDecline'
            counts[cause] += 1
            categories[f'{cause}:{category}'] += 1
            if request['note']:
                categories[f'{cause}:hasNoteOverlapping'] += 1
        else:
            quoted.add(request_id)
            counts['realQuotes'] += 1
            counts['quotedAwards'] += request_id in won
            counts['anchoredQuotes'] += bool(d['plan'].get('anchor'))
            counts['multipleOptionsQuoted'] += len(d['action']['prices']) > 1
            chosen = [c for c in latest['input']['alternatives'] if c['id'] in latest['result']['selected'] and plans[c['id']].get('requestId') == request_id and plans[c['id']]['kind'] == 'quote']
            assert len(chosen) == 1
            quote_risks.append(statistics.mean(o['late'] / 10000 for o in chosen[0]['outcomes']))
            future_costs.append(statistics.mean(o['futureCents'] / 100 for o in chosen[0]['outcomes']))
    for request in requests.values():
        category = 'multiLeg' if len(request['legs']) > 1 else 'privateSingle' if any(s['privateAddress'] for leg in request['legs'] for s in [leg['pickup'], leg['delivery']]) else 'publicSingle'
        categories[f'arrivals:{category}'] += 1
    counts['uniqueRequestsWithAnyQuoteCandidate'] = len(considered)
    counts['noExecutedPortfolioQuote'] = len(set(requests) - quoted - declined)
    counts['quoteLost'] = len(quoted - won)
    counts['portfolioOverflow'] = sum(d['kind'] == 'portfolio_overflow' for d in decisions)
    counts['expiredWaiting'] = sum(d['kind'] == 'portfolio_baseline_expired' for d in decisions)
    counts['bookings'] = sum(e['kind'] == 'gig_booked' for e in events)
    counts['drops'] = sum(e['kind'] == 'gig_dropped' for e in events)
    counts['noShows'] = sum(e['kind'] == 'no_show' for e in events)
    assert not quoted & declined
    assert won <= quoted
    assert len(requests) == counts['noQuoteCandidate'] + counts['solverDecline'] + counts['realQuotes'] + counts['noExecutedPortfolioQuote']
    rows.append({'worldId': world, 'seed': record['seed'], 'counts': dict(counts), 'categories': dict(categories), 'frames': dict(frames), 'meanQuotedModeledLateOrders': statistics.mean(quote_risks), 'meanQuotedFutureValueEuros': statistics.mean(future_costs)})
    print(world, dict(counts), flush=True)
result = {
    'scope': 'Decision coverage audit of eight frozen development candidate weeks. No counterfactual profit inferred for rejected work.',
    'records': rows,
    'totals': {key: dict(sum((Counter(r[key]) for r in rows), Counter())) for key in ['counts', 'categories', 'frames']},
    'limitations': ['No candidate does not imply profitable opportunity. Public-single exclusions still mix note, safety, feasibility and old admission gates.', 'Solver declines mix economic values and coupled constraints. The audit does not causally assign their loss.', 'Awards include later cancellations; scoreboard wonOrders excludes cancelled work.', 'Request rows and solver frames are not independent weeks.'],
}
assert result['totals']['counts']['noQuoteCandidate'] == sum(result['totals']['categories'].get('noQuoteCandidate:' + name, 0) for name in ['multiLeg', 'privateSingle', 'publicSingle'])
(ROOT / 'docs/level8-architecture-audit.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result['totals'], indent=2))
