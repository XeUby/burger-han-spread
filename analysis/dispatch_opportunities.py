import json
from pathlib import Path
from collections import defaultdict, Counter
from statistics import median

ROOT=Path(__file__).resolve().parents[1]
WORLDS=['w7972495096c0af8b9de8','wb865ff1c21970cb0fef2','wd415d7ae809d2fec7776']
WORLDS=['w7972495096c0af8b9de8','wb865ff1c21970cb0fef2','wd415561aaf36894b76de','wbcb207675e32e9aff20f','wb915d7ae809d2fec7776']
def read(w,k):return json.load(open(ROOT/f'runs/{w}.{k}.json'))
roads={(r['from'],r['to']):r for r in json.load(open(ROOT/'docs/map.json'))['roads']}
def road(a,b):return roads[(a,b)]
def km(a,b):return road(a,b)['km']
def minutes(a,b):return 0 if a==b else road(a,b)['minutes']
def next_open(stop,arrival):
    arrival=max(arrival,stop['window']['from'])
    if stop['privateAddress'] or not stop.get('hours'):return arrival if arrival<=stop['window']['to'] else None
    h=stop['hours']
    for day in range(arrival//1440,stop['window']['to']//1440+1):
        weekday=day%7
        hours=h['saturday'] if weekday==5 else h if weekday in h['weekdays'] else None
        if not hours:continue
        result=max(arrival,day*1440+hours['opens'])
        if result<day*1440+hours['closes'] and result<=stop['window']['to']:return result
    return None

report=[]
all_matches=[]
for w in WORLDS:
    meta,snap,events,reveal,drivers=[read(w,k) for k in ['meta','snapshot','events','reveal','drivers']]
    profiles={d['id']:d for d in drivers}
    requests={r['request']['id']:r for r in reveal['requests']}
    gigs={g['id']:g for g in snap['gigs']}
    current_orders={}
    posts=sorted(gigs.values(),key=lambda g:g['postedAt']);post_index=0
    state={};assigned={};last_delivery={};chains=[];handoffs=[];bundle_pairs={};last_fee={}
    def eligible(g,d):return (not g['audience']['experienced'] or d['rating']>=4.8 and d['completedGigs']>=50) and (not g['audience']['manualLicence'] or d['licence']=='manual')
    def leg_of(g):
        p=next(s for s in g['stops'] if s['kind']=='pickup')
        o=current_orders.get(p['orderId'])
        return (o,o['legs'][p['leg']]) if o else (None,None)
    def route_fits(g,start_place,at):
        o,leg=leg_of(g)
        if not o or len(g['stops'])!=2:return None
        pickup=next_open(leg['pickup'],at+minutes(start_place,leg['pickup']['placeId'])+15)
        if pickup is None or pickup>o['lastPickupAt']-30:return None
        work=road(leg['pickup']['placeId'],leg['delivery']['placeId'])['minutes']
        extras=(30 if g['stops'][0].get('withPlates') else 0)+(40 if g['stops'][0].get('withCharging') else 0)
        delivery=next_open(leg['delivery'],pickup+int(work*1.15)+20+extras)
        if delivery is None or delivery>o['deadline'] or pickup//1440!=at//1440:return None
        return pickup,delivery
    for e in events:
        at=e['at'];kind=e['kind']
        if kind in ['order_won','order_changed']:current_orders[e['order']['id']]=e['order']
        while post_index<len(posts) and posts[post_index]['postedAt']<=at:
            g=posts[post_index];post_index+=1
            orderids={s['orderId'] for s in g['stops']}
            for gid in list(state):
                if state[gid]=='open' and any(s['orderId'] in orderids for s in gigs[gid]['stops']):state[gid]='withdrawn'
            state[g['id']]='open'
            o,leg=leg_of(g)
            if not o or len(g['stops'])!=2:continue
            for gid,otherstate in state.items():
                if otherstate!='open' or gid==g['id']:continue
                other=gigs[gid];oo,ll=leg_of(other)
                if not oo or len(other['stops'])!=2:continue
                for first,second in [(g,other),(other,g)]:
                    a,la=leg_of(first);b,lb=leg_of(second)
                    connector=km(la['delivery']['placeId'],lb['pickup']['placeId'])
                    loop=km(la['pickup']['placeId'],lb['delivery']['placeId'])
                    drive=road(la['pickup']['placeId'],la['delivery']['placeId'])['minutes']+minutes(la['delivery']['placeId'],lb['pickup']['placeId'])+road(lb['pickup']['placeId'],lb['delivery']['placeId'])['minutes']
                    if connector>35 or drive>720:continue
                    r1=route_fits(first,la['pickup']['placeId'],at)
                    r2=route_fits(second,la['delivery']['placeId'],r1[1]) if r1 else None
                    if not r2:continue
                    key=tuple(sorted([g['id'],gid]))
                    candidate=dict(at=at,orders=[a['id'],b['id']],gigs=[first['id'],second['id']],connectorKm=connector,endsNearStartKm=loop,driveMinutes=drive,returnLoop=loop<=35)
                    if key not in bundle_pairs or candidate['connectorKm']<bundle_pairs[key]['connectorKm']:bundle_pairs[key]=candidate
        if kind=='gig_viewed':last_fee[e['gigId']]=next((v['feeCents'] for v in reversed(reveal['views']) if v['gigId']==e['gigId'] and v['at']<=at),None)
        if kind=='gig_booked':state[e['gigId']]='booked';assigned[e['gigId']]=e['driverId']
        elif kind in ['gig_dropped','no_show']:state[e['gigId']]='open';assigned.pop(e['gigId'],None)
        elif kind=='gig_expired':state[e['gigId']]='withdrawn'
        elif kind=='order_cancelled':
            for cg in e['gigs']:
                if cg['outcome'] in ['withdrawn','released']:state[cg['gigId']]='withdrawn'
        elif kind=='gig_started':state[e['gigId']]='working'
        elif kind=='picked_up':
            driver=assigned.get(e['gigId'])
            if driver in last_delivery:
                old=last_delivery[driver]
                if at//1440==old['at']//1440 and at>=old['at']:
                    chains.append(dict(driver=driver,gapMinutes=at-old['at'],deadheadKm=km(old['placeId'],e['placeId']),fromPlace=old['placeId'],toPlace=e['placeId']))
        elif kind=='delivered':
            state[e['gigId']]='done'
            driver=assigned.get(e['gigId'])
            if not driver:continue
            last_delivery[driver]=e
            d=profiles[driver];home=d['homePlaceId'];here=e['placeId']
            for gid,gstate in state.items():
                if gstate!='open':continue
                g=gigs[gid];o,leg=leg_of(g)
                if not o or not eligible(g,d) or len(g['stops'])!=2:continue
                origin=leg['pickup']['placeId'];destination=leg['delivery']['placeId']
                deadhead=km(here,origin)
                if deadhead>30 or leg['pickup']['window']['from']>at+90:continue
                fit=route_fits(g,here,at)
                if not fit:continue
                home_before=km(here,home);home_after=km(destination,home)
                homeward=home_after<=30 or home_after+30<=home_before
                price=last_fee.get(gid)
                if not price:
                    schedule=g['schedule'];price=schedule[0]['feeCents']
                handoffs.append(dict(world=w,at=at,driver=driver,home=home,here=here,gigId=gid,orderId=o['id'],fromPlace=origin,toPlace=destination,deadheadKm=deadhead,homeDistanceBefore=home_before,homeDistanceAfter=home_after,homeward=homeward,pickupAt=fit[0],deliveryAt=fit[1],observedFeeCents=price))
    unique_homeward={m['gigId']:m for m in handoffs if m['homeward']}
    unique_any={m['gigId']:m for m in handoffs}
    bundle_gigs={gid for pair in bundle_pairs.values() for gid in pair['gigs']}
    loops=[p for p in bundle_pairs.values() if p['returnLoop']]
    tradeins=[]
    for entry in reveal['requests']:
        r=entry['request']
        if len(r['legs'])!=2:continue
        leg=r['legs'][0];second=r['legs'][1]
        drive=road(leg['pickup']['placeId'],leg['delivery']['placeId'])['minutes']+minutes(leg['delivery']['placeId'],second['pickup']['placeId'])+road(second['pickup']['placeId'],second['delivery']['placeId'])['minutes']
        tradeins.append(dict(id=r['id'],note=r['note'],km=road(leg['pickup']['placeId'],leg['delivery']['placeId'])['km'],driveMinutes=drive,listPriceCents=r['options'][0]['listPriceCents'],referenceFeeCents=r['referenceFeeCents'],ratio=r['options'][0]['listPriceCents']/r['referenceFeeCents'],slotLead=leg['delivery']['window']['from']-r['respondBy'],premium=any(l['car']['premium'] for l in r['legs'])))
    report.append(dict(world=w,seed=meta['seed'],deliveries=sum(e['kind']=='delivered' for e in events),driversUsed=len(set(e['driverId'] for e in events if e['kind']=='gig_booked')),naturalSameDayChains=len(chains),naturalNearbyChains=sum(c['deadheadKm']<=30 for c in chains),handoffMatches=len(handoffs),uniqueHandoffGigs=len(unique_any),homewardMatches=sum(m['homeward'] for m in handoffs),uniqueHomewardGigs=len(unique_homeward),optimistic25PercentSavingEuros=sum(m['observedFeeCents']*.25 for m in unique_homeward.values())/100,availableBundlePairs=len(bundle_pairs),availableBundleGigs=len(bundle_gigs),availableReturnLoopPairs=len(loops),tradeinRequests=len(tradeins),tradeinMedianListToRef=median(t['ratio'] for t in tradeins) if tradeins else None,tradeinNoNoteWithin240min=[t for t in tradeins if not t['note'] and t['driveMinutes']<=240],tradeins=tradeins,homewardHandoffs=list(unique_homeward.values()),bundles=list(bundle_pairs.values())))
    all_matches.extend(handoffs)
out=dict(scope='Only five named development worlds; no new/unseen validation outcomes.',limitations=['Handoff matches are optimistic feasibility screens. They do not reveal a driver remaining working time, desired gigs, reservation fee or offer-reading probability.','Actual earlier offers could change future assignments. Potential savings are not an estimated treatment effect.','Bundle candidates only include already-won simultaneously open single-leg gigs. Retrospective pair overlap is not a guaranteed match.'],worlds=report)
json.dump(out,open(ROOT/'docs/dispatch-opportunities.json','w'),indent=2)
for r in report:print(json.dumps({k:v for k,v in r.items() if k not in ['tradeins','homewardHandoffs','bundles','tradeinNoNoteWithin240min']}))
print('simpleTradeins',sum(len(r['tradeinNoNoteWithin240min']) for r in report))
