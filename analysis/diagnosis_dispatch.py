import json
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean, median

ROOT = Path(__file__).resolve().parents[1]
FINAL = ['w7ae145e3ea74526ee4bf', 'w1937eaf885387948933b', 'w65288bae5e4a8c3d8f5e']
AGGRESSIVE = ['w23dc3ed7976dc481981f', 'w815d24fedae64f9f5cf4', 'w27f9f6d54106931d0f1d']
roads = {(r['from'], r['to']): r for r in json.load(open(ROOT/'docs/map.json'))['roads']}

def load(world, suffix):
    return json.load(open(ROOT/f'runs/{world}.{suffix}.json'))

def quantiles(xs):
    if not xs:
        return None
    xs = sorted(xs)
    return dict(mean=mean(xs), median=median(xs), p90=xs[int(.9*(len(xs)-1))], p95=xs[int(.95*(len(xs)-1))], max=max(xs))

def cohort(worlds):
    rows, offers, runs = [], [], []
    for world in worlds:
        events, reveal, snap = [load(world, s) for s in ['events','reveal','snapshot']]
        requests = {r['request']['id']: r for r in reveal['requests']}
        orders = {o['id']: o for o in snap['orders']}
        gigs = {g['id']: g for g in snap['gigs']}
        by_order = defaultdict(list)
        for g in gigs.values():
            for oid in set(s['orderId'] for s in g['stops']):
                by_order[oid].append(g)
        first_view = {}
        for v in sorted(reveal['views'], key=lambda v:v['at']):
            g = gigs.get(v['gigId'])
            if g:
                for oid in set(s['orderId'] for s in g['stops']):
                    first_view.setdefault(oid, v)
        offer_records = [e for e in events if e['kind']=='offer_answered']
        offers += [dict(world=world, **e) for e in offer_records]
        booked_gigs = set()
        active_orders = {}
        quoted_pending = {}
        backlog = {}
        for e in events:
            k = e['kind']
            if k == 'price_request':
                req = e['request']
                first = req['legs'][0]
                day = first['pickup']['window']['from']//1440
                place = first['pickup']['placeId']
                n = 0
                ids = set(active_orders) | {i for i,until in quoted_pending.items() if until>e['at']}
                for oid in ids:
                    other = requests[oid]['request']['legs'][0]
                    if other['pickup']['window']['from']//1440 != day:
                        continue
                    if any(g['id'] in booked_gigs for g in by_order[oid]):
                        continue
                    dist = roads[(place,other['pickup']['placeId'])]['km']
                    if dist<=70:
                        n += 1 if dist<=30 else .5
                backlog[req['id']] = n
                quoted = requests[req['id']]['quote']
                if quoted and min(quoted.values())<10000000:
                    quoted_pending[req['id']] = req['respondBy']
            elif k == 'order_won':
                active_orders[e['order']['id']] = e['order']
                quoted_pending.pop(e['order']['id'],None)
            elif k == 'order_lost':
                quoted_pending.pop(e['requestId'],None)
            elif k == 'order_cancelled':
                active_orders.pop(e['orderId'],None)
            elif k == 'delivered':
                # All evaluated policies accepted one car per order.
                active_orders.pop(e['orderId'],None)
                booked_gigs.discard(e['gigId'])
            elif k == 'gig_booked':
                booked_gigs.add(e['gigId'])
            elif k in ['gig_dropped','no_show']:
                booked_gigs.discard(e['gigId'])
        for oid,o in orders.items():
            if o['status']=='cancelled':
                continue
            req=requests[oid]['request']
            leg=req['legs'][0]
            my_gigs=by_order[oid]
            gids=set(g['id'] for g in my_gigs)
            my_events=[e for e in events if e.get('gigId') in gids]
            books=[e for e in my_events if e['kind']=='gig_booked']
            first=min((e['at'] for e in books), default=None)
            posted=min(g['postedAt'] for g in my_gigs)
            view=first_view.get(oid)
            opening=view['feeCents'] if view else (books[0]['feeCents'] if books else None)
            cost=-sum(e['line']['cents'] for e in events if e['kind']=='ledger' and e['line'].get('orderId')==oid and e['line']['kind']=='driver_fee')
            late=any(t is None or t>o['deadline'] for t in o['deliveredAt'])
            net=sum(e['line']['cents'] for e in events if e['kind']=='ledger' and e['line'].get('orderId')==oid)
            ready=leg['pickup']['window']['from']
            local_offers=[e for e in offer_records if e['gigId'] in gids]
            rows.append(dict(world=world, id=oid, late=late, margin=net, cost=cost, reference=req['referenceFeeCents'], opening=opening, feeRatio=cost/req['referenceFeeCents'], raiseRatio=cost/opening if opening else None, bookDelay=first-posted if first is not None else None, futureReady=ready>req['respondBy']+180, bookAfterReady=first-ready if first is not None else None, backlog=backlog.get(oid,0), km=roads[(leg['pickup']['placeId'],leg['delivery']['placeId'])]['km'], offered=bool(local_offers), offersAccepted=sum(e['answer']=='accepted' for e in local_offers), drops=sum(e['kind']=='gig_dropped' for e in my_events), sameDay=o['option']=='same_day'))
        runs.append(dict(world=world, offers=dict(Counter(e['answer'] for e in offer_records))))
    return rows,offers,runs

def summary(rows):
    return dict(n=len(rows), late=sum(r['late'] for r in rows), marginEuros=sum(r['margin'] for r in rows)/100,
                costRatio=sum(r['cost'] for r in rows)/sum(r['reference'] for r in rows) if rows else None,
                feeRatios=quantiles([r['feeRatio'] for r in rows]), raised=sum(r['raiseRatio']>1.05 for r in rows if r['raiseRatio'] is not None),
                raisedExtraEuros=sum(max(0,r['cost']-r['opening']) for r in rows if r['opening'] is not None)/100,
                bookDelay=quantiles([r['bookDelay'] for r in rows if r['bookDelay'] is not None]),
                offered=sum(r['offered'] for r in rows), offerWins=sum(r['offersAccepted'] for r in rows), drops=sum(r['drops'] for r in rows))

def group(rows, fn):
    return {key:summary([r for r in rows if fn(r)==key]) for key in sorted(set(map(fn,rows)))}

result = {}
for name,worlds in [('final',FINAL),('aggressive',AGGRESSIVE)]:
    rows,offers,runs=cohort(worlds)
    result[name] = dict(summary=summary(rows), offers=dict(Counter(e['answer'] for e in offers)), runs=runs,
        byBacklog=group(rows,lambda r:'0' if r['backlog']==0 else '0.5-2' if r['backlog']<=2 else '2.5-4' if r['backlog']<=4 else '4.5+'),
        byDistance=group(rows,lambda r:'0-70' if r['km']<70 else '70-150' if r['km']<150 else '150-250' if r['km']<250 else '250-400' if r['km']<400 else '400+'),
        byReady=group(rows,lambda r:'future' if r['futureReady'] else 'nearNow'),
        byRaised=group(rows,lambda r:'raised' if r['raiseRatio'] is not None and r['raiseRatio']>1.05 else 'opening'),
        byOffer=group(rows,lambda r:'offered' if r['offered'] else 'notOffered'),
        byDelay=group(rows,lambda r:'0-10' if r['bookDelay'] is not None and r['bookDelay']<=10 else '11-60' if r['bookDelay'] is not None and r['bookDelay']<=60 else '61-180' if r['bookDelay'] is not None and r['bookDelay']<=180 else '181+'))
json.dump(result,open(ROOT/'docs/diagnosis-dispatch.json','w'),indent=2)
print(json.dumps({name:{key:value for key,value in data.items() if key in ['summary','offers','byRaised','byOffer','byBacklog','byReady']} for name,data in result.items()},indent=2))
