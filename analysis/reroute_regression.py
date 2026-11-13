import json
from pathlib import Path
from collections import Counter

ROOT=Path(__file__).resolve().parents[1]
WORLDS={'before':'w8e1fd9795d32b6d0de92','after':'w6fb9cdd546c36f5fa418'}
ORDER='R00809'
def read(world,kind):return json.load(open(ROOT/f'runs/{world}.{kind}.json'))
def extract(world):
    meta=read(world,'meta')
    if meta['seed']!='formal-unseen-20261113-08':raise RuntimeError('Unexpected seed in regression allowlist')
    path=ROOT/f'runs/{world}.snapshot.json'
    if not path.exists():return dict(status='pending',**meta)
    snap=read(world,'snapshot')
    if snap['now']<snap['endsAt']:return dict(status='pending',**meta)
    events,reveal,score=[read(world,k) for k in ['events','reveal','score']]
    request=next(r for r in reveal['requests'] if r['request']['id']==ORDER)
    order=next(o for o in snap['orders'] if o['id']==ORDER)
    gigs=[g for g in snap['gigs'] if any(s['orderId']==ORDER for s in g['stops'])]
    gids={g['id'] for g in gigs}
    ledger=[e['line'] for e in events if e['kind']=='ledger' and e['line'].get('orderId')==ORDER]
    timeline=[e for e in events if e.get('order',{}).get('id')==ORDER or e.get('orderId')==ORDER or e.get('gigId') in gids or e['kind']=='ledger' and e['line'].get('orderId')==ORDER]
    views=[v for v in reveal['views'] if v['gigId'] in gids]
    bookings=[e for e in timeline if e['kind']=='gig_booked']
    picked=[e for e in timeline if e['kind']=='picked_up']
    delivered=[e for e in timeline if e['kind']=='delivered']
    changes=[e for e in timeline if e['kind']=='order_changed']
    fee_views=[]
    for g in gigs:
        vs=sorted((v for v in views if v['gigId']==g['id']),key=lambda v:v['at'])
        fee_views.append(dict(gigId=g['id'],postedAt=g['postedAt'],status=g['status'],firstViewedAt=vs[0]['at'] if vs else None,firstViewedFeeCents=vs[0]['feeCents'] if vs else None,maxViewedFeeCents=max((v['feeCents'] for v in vs),default=None),views=len(vs),finalSchedule=g['schedule']))
    total=sum(l['cents'] for l in ledger)
    delivered_at=max(order['deliveredAt']) if all(t is not None for t in order['deliveredAt']) else None
    return dict(status='complete',**meta,worldScore=score,request=request,order=order,changes=changes,bookings=bookings,pickups=picked,deliveries=delivered,deliveredAt=delivered_at,onTime=delivered_at is not None and delivered_at<=order['deadline'],marginCents=total,ledger=ledger,gigs=fee_views,eventCounts=dict(Counter(e['kind'] for e in timeline)),timeline=[e for e in timeline if e['kind'] not in ['gig_viewed','offer_answered']],offerOutcomes=dict(Counter(e['answer'] for e in timeline if e['kind']=='offer_answered')))

data={label:extract(world) for label,world in WORLDS.items()}
if any(r['status']!='complete' for r in data.values()):
    print(json.dumps({k:dict(worldId=r['worldId'],status=r['status']) for k,r in data.items()},indent=2))
    raise SystemExit(0)
before,after=data['before'],data['after']
assert before['settings']==after['settings']
assert before['request']==after['request']
roads={(r['from'],r['to']):r for r in json.load(open(ROOT/'docs/map.json'))['roads']}
original=before['request']['request']['legs'][0]
changed=before['order']['legs'][0]
old_road=roads[(original['pickup']['placeId'],original['delivery']['placeId'])]
new_road=roads[(changed['pickup']['placeId'],changed['delivery']['placeId'])]
factor=(45+new_road['minutes'])/(45+old_road['minutes'])
report=dict(scope='A targeted same-seed regression after a bug was discovered in round-one validation. This seed is now development data. No fresh formal-unseen-20261113-09 through -16 outcomes are read or included.',method='Read only the two explicitly allowlisted completed worlds, compare R00809 and their terminal ledger/score, and assert identical settings and original request/quote/outcome. Whole-week changes also include effects on other rerouted jobs and downstream driver/trust interactions.',mechanism=dict(originalRoad=old_road,changedRoad=new_road,fixedMobilizationMinutes=45,feeScale=factor,originalOpeningFloorCents=2000,expectedNewOpeningFloorCents=round(2000*factor)),runs=data,differences=dict(orderMarginCents=after['marginCents']-before['marginCents'],worldMarginCents=after['worldScore']['marginCents']-before['worldScore']['marginCents'],worldOnTimeShare=after['worldScore']['onTimeShare']-before['worldScore']['onTimeShare'],worldUndeliveredShare=after['worldScore']['undeliveredShare']-before['worldScore']['undeliveredShare']),limitations=['This regression tests one previously observed failure, not generalization.','Original customer price cannot change after the dealer changes the route; a successful recovery can still lose money.','The same-seed full-week result is not an estimate of the isolated effect on R00809 because corrected fees can change other orders and downstream decisions.'])
json.dump(report,open(ROOT/'docs/reroute-regression.json','w'),indent=2)
def eur(cents):return f'−€{-cents/100:,.2f}' if cents<0 else f'€{cents/100:,.2f}'
def when(t):
    if t is None:return 'Not delivered'
    days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
    return f'{days[(t//1440)%7]} {t%1440//60:02d}:{t%60:02d} (minute {t})'
def field(label,run):
    if label=='Status':return run['order']['status']
    if label=='Delivery':return when(run['deliveredAt'])
    if label=='On time':return 'Yes' if run['onTime'] else 'No'
    if label=='Customer price':return eur(run['order']['priceCents'])
    if label=='Driver fees':return eur(-sum(l['cents'] for l in run['ledger'] if l['kind']=='driver_fee'))
    if label=='Undelivered penalty':return eur(-sum(l['cents'] for l in run['ledger'] if l['kind']=='undelivered_penalty'))
    if label=='Order net margin':return eur(run['marginCents'])
    if label=='Whole-week margin':return eur(run['worldScore']['marginCents'])
    if label=='Whole-week on-time share':return f'{run["worldScore"]["onTimeShare"]:.2%}'
    if label=='Whole-week undelivered share':return f'{run["worldScore"]["undeliveredShare"]:.2%}'
    if label=='Qualified':return 'Yes' if run['worldScore']['ranked'] else 'No'
outcome='The corrected dispatcher delivers the previously stranded order on time.' if after['onTime'] else 'The corrected dispatcher delivers the previously stranded order, but late.' if after['deliveredAt'] is not None else 'The previously stranded order remains undelivered after the correction.'
lines=['# Reroute regression: R00809','',outcome,'','## Scope','',report['scope'],'',report['method'],'','## Failure and correction','',f'Order `R00809` was won for {eur(before["order"]["priceCents"])} as a local Jyväskylä trip: {old_road["km"]} km and {old_road["minutes"]} map minutes. At minute {before["changes"][0]["at"]}, the dealer changed delivery to Kuopio: {new_road["km"]} km and {new_road["minutes"]} map minutes. Its deadline remained {when(before["order"]["deadline"])}.','',f'The original dispatcher continued pricing the gig from the local request, with a €20 opening floor and €50 maximum rescue fee. No driver booked it, and the week ended with a {eur(-sum(l["cents"] for l in before["ledger"] if l["kind"]=="undelivered_penalty"))} penalty.','',f'The correction scales fees by `(45 + changed road minutes) / (45 + original road minutes)`, never below one, and evaluates supply at the current pickup. Here the multiplier is `(45 + {new_road["minutes"]}) / (45 + {old_road["minutes"]}) = {factor:.6f}`. The customer quote remains unchanged.','','## Result','','| Measure | Before correction | After correction |','|---|---:|---:|']
for label in ['Status','Delivery','On time','Customer price','Driver fees','Undelivered penalty','Order net margin','Whole-week margin','Whole-week on-time share','Whole-week undelivered share','Qualified']:
    lines.append(f'| {label} | {field(label,before)} | {field(label,after)} |')
lines += ['',f'The order contribution changes by **{eur(report["differences"]["orderMarginCents"])}**. The full-week margin changes by **{eur(report["differences"]["worldMarginCents"])}**; this broader difference also reflects other affected orders and dispatch interactions.', '', 'The corrected job booked for €43.14, below the old €50 rescue ceiling. The useful change was making a suitable fee available while the car could still be moved on time, rather than only increasing the eventual maximum.', '', '## Corrected event trace','']
for e in after['timeline']:
    k=e['kind']
    if k=='order_won':desc=f'Order won for {eur(e["order"]["priceCents"])}.'
    elif k=='order_changed':desc='Delivery changed from Jyväskylä to Kuopio.'
    elif k=='gig_booked':desc=f'Driver {e["driverId"]} booked gig {e["gigId"]} for {eur(e["feeCents"])}.'
    elif k=='gig_started':desc=f'Driver left for gig {e["gigId"]}.'
    elif k=='picked_up':desc=f'Car picked up in {e["placeId"]}.'
    elif k=='delivered':desc=f'Car delivered in {e["placeId"]}.'
    elif k=='ledger':desc=f'{e["line"]["kind"]}: {eur(e["line"]["cents"])}.'
    else:desc=k
    lines.append(f'- {when(e["at"])}: {desc}')
lines += ['','## Provenance and reproduction','',f'- Before: `{before["worldId"]}`, source `{before["revision"]}`.',f'- After: `{after["worldId"]}`, source `{after["revision"]}`.','- Seed: `formal-unseen-20261113-08`; identical policy settings and original request/quote were checked.','- Both processes used their respective frozen sources; this report does not certify any broader mutable development runs.','','The machine-readable report includes terminal scores, complete order ledgers, fee observations and relevant events. Reproduce without API calls:','','```bash','python3 analysis/reroute_regression.py','```','','This is an outcome report for a known regression. It is not used to retune admission or prices, and it does not replace the separate fresh validation panel.']
(ROOT/'docs/reroute-regression.md').write_text('\n'.join(lines)+'\n')
print(json.dumps(dict(before=dict(status=before['order']['status'],delivered=before['deliveredAt'],margin=before['marginCents']),after=dict(status=after['order']['status'],delivered=after['deliveredAt'],margin=after['marginCents']),differences=report['differences']),indent=2))
