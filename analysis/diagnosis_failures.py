import json
from pathlib import Path
from collections import defaultdict, Counter

ROOT=Path(__file__).resolve().parents[1]
WORLDS={'baseline':'w7ae145e3ea74526ee4bf','notes':'wa91ce8c1daea7f4c9cc6','adaptive':'wb081cd387816513c47a1'}
def read(world,suffix): return json.load(open(ROOT/f'runs/{world}.{suffix}.json'))
roads={(r['from'],r['to']):r for r in json.load(open(ROOT/'docs/map.json'))['roads']}
drivers=read(WORLDS['notes'],'drivers')
output={}
for label,world in WORLDS.items():
    snap,events,reveal=[read(world,s) for s in ['snapshot','events','reveal']]
    requests={r['request']['id']:r for r in reveal['requests']}
    orders={o['id']:o for o in snap['orders']}
    truths={o['orderId']:o for o in reveal['orders']}
    gigs={g['id']:g for g in snap['gigs']}
    by_order=defaultdict(list)
    for g in gigs.values():
        for oid in set(s['orderId'] for s in g['stops']): by_order[oid].append(g['id'])
    bookings=set(); active={}; pending={}; atquote={}; deadline_at_won={}; views=defaultdict(list)
    for e in events:
        k=e['kind']
        if k=='price_request':
            r=e['request'];day=r['legs'][0]['pickup']['window']['from']//1440;place=r['legs'][0]['pickup']['placeId']
            state=defaultdict(float)
            for oid in set(active)|{oid for oid,until in pending.items() if until>e['at']}:
                other=requests[oid]['request']['legs'][0];otherday=other['pickup']['window']['from']//1440
                km=roads[(place,other['pickup']['placeId'])]['km']
                if km>70:continue
                weight=1 if km<=30 else .5
                age='same' if otherday==day else 'older' if otherday<day else 'future'
                isbooked=any(g in bookings for g in by_order[oid])
                state[age+'Active']+=weight
                if not isbooked:state[age+'Unbooked']+=weight
            atquote[r['id']]=dict(state)
            quote=requests[r['id']]['quote']
            if quote and min(quote.values())<1e7:pending[r['id']]=r['respondBy']
        elif k=='order_won':
            active[e['order']['id']]=e['order'];pending.pop(e['order']['id'],None);deadline_at_won[e['order']['id']]=e['order']['lastPickupAt']
        elif k=='order_lost':pending.pop(e['requestId'],None)
        elif k=='order_cancelled':active.pop(e['orderId'],None)
        elif k=='delivered':active.pop(e['orderId'],None);bookings.discard(e['gigId'])
        elif k=='gig_booked':bookings.add(e['gigId'])
        elif k in ['gig_dropped','no_show']:bookings.discard(e['gigId'])
        elif k=='gig_viewed':views[e['gigId']].append(e)
    rows=[]
    for oid,o in orders.items():
        if o['status']=='cancelled':continue
        r=requests[oid]['request'];leg=r['legs'][0];truth=truths[oid]['legs'][0];gids=set(by_order[oid]);timeline=[]
        supply=0
        for d in drivers:
            if truth['manualGearbox'] and d['licence']!='manual':continue
            if leg['car']['premium'] and (d['rating']<4.8 or d['completedGigs']<50):continue
            km=roads[(d['homePlaceId'],leg['pickup']['placeId'])]['km']
            supply+=1 if km<=35 else .35 if km<=70 else 0
        ledger=[]
        for e in events:
            if e['kind']=='ledger' and e['line'].get('orderId')==oid:ledger.append(e['line'])
            if e.get('gigId') in gids and e['kind']!='gig_viewed':timeline.append({k:v for k,v in e.items() if k not in ['seq']})
            elif e.get('orderId')==oid and e['kind'] in ['deadline_close','order_changed','visit_failed']:timeline.append(e)
        cost=-sum(l['cents'] for l in ledger if l['kind']=='driver_fee')
        firstbook=min((e['at'] for e in timeline if e['kind']=='gig_booked'),default=None)
        firstpost=min(gigs[g]['postedAt'] for g in gids)
        late=max(o['deliveredAt'])>o['deadline']
        rows.append(dict(id=oid,late=late,fromPlace=leg['pickup']['placeId'],toPlace=leg['delivery']['placeId'],km=roads[(leg['pickup']['placeId'],leg['delivery']['placeId'])]['km'],arrived=r['arrivedAt'],ready=leg['pickup']['window']['from'],deadline=o['deadline'],lastPickup=deadline_at_won[oid],delivered=max(o['deliveredAt']),option=o['option'],note=r['note'],supply=round(supply,2),backlogLimit=max(2,round(supply*.04,2)),atQuote=atquote[oid],fee=round(cost/100,2),reference=r['referenceFeeCents']/100,price=o['priceCents']/100,profit=sum(l['cents'] for l in ledger)/100,firstBook=firstbook,bookDelay=firstbook-firstpost if firstbook else None,truth=truth,timeline=timeline,allViews=len([v for g in gids for v in views[g]])))
    lateids=set(r['id'] for r in rows if r['late'])
    output[label]=dict(worldId=world,late=sorted(lateids),won=len(rows),events=dict(Counter(e['kind'] for e in events)),rows=rows)
base={r['id']:r for r in output['baseline']['rows']}
for label,data in output.items():
    for r in data['rows']:
        r['baseline']='notWon' if r['id'] not in base else 'late' if base[r['id']]['late'] else 'onTime'
json.dump(output,open(ROOT/'docs/diagnosis-failures.json','w'),indent=2)
for label,data in output.items():
    print(label,data['won'],len(data['late']),data['events'])
    for r in data['rows']:
        if r['late']:print(json.dumps({k:v for k,v in r.items() if k not in ['truth','timeline','note']},ensure_ascii=False))
