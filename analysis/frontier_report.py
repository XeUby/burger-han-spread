import json
from pathlib import Path
from collections import Counter, defaultdict
from statistics import mean

ROOT=Path(__file__).resolve().parents[1]
SEEDS=['formal-unseen-20261113-14','formal-unseen-20261113-15']
BASE={'formal-unseen-20261113-14':'w8b85572a9b6fc286e4ec','formal-unseen-20261113-15':'w735d87d8fe1b99845667'}
DESCRIPTIONS={
 'frontier-volume':'Larger daily capacity0.35 and unbooked allowance0.08, minimum supply8, max700km; four parameter changes together.',
 'frontier-shadow':'Capacity0.50, backlog0.12, minimum supply8, max700km, and expected cost multiplier2.0; tests aggressive cost-based pricing jointly with looser admission.',
 'frontier-lowfee':'Volume settings plus opening fee0.85 instead of1.05. Also changes quote floors and demand-model cost inputs; not an isolated payout experiment.',
 'frontier-auction':'Defer commercial admission until five minutes before response, with an initial losing placeholder; prioritize due requests by expected contribution and reserve pending capacity later.',
 'frontier-private':'Allow feasible private-address single-car work while retaining baseline price/capacity settings.',
 'frontier-trade':'Allow feasible two-leg trade-ins while retaining baseline price/capacity settings.',
 'frontier-menu':'Same-day menu price multiplier1.12; later options unchanged.',
 'frontier-volume-auction':'Combines the larger volume admission settings with deferred quote-window allocation.',
 'frontier-readiness':'Readiness-aware admission/timing treatment; inspect the full stored settings and frozen source.',
 'frontier-place':'Place-aware demand treatment; inspect the full stored settings and frozen source.',
 'frontier-bundles':'Hold safe public single-car posts for up to15 minutes and match feasible sequential pairs; retain baseline admission and prices.',
 'frontier-volume-bundles':'Pairing plus capacity0.35, backlog0.08, minimum supply8 and maximum700km.',
 'frontier-auction-bundles':'Pairing plus deferred commercial quoting five minutes before the response deadline.',
 'frontier-hold-control':'Hold posts for15 minutes but disable route pairing; isolates the posting delay.',
 'frontier-long-bundles':'Pairing plus maximum700km, retaining baseline capacity, backlog and minimum supply.',
 'frontier-home':'Cheap direct offers to qualified drivers living near the destination, retaining baseline admission.',
 'frontier-home-volume':'Destination-home offers plus the four broader volume settings.',
}
INTERRUPTED={w:'HTTP 502 during execution; coordinator reported server interruption. No terminal score exists, so this is not a failed delivery-policy result.' for w in ['waeca76492dc84a5916dc','w0e07ef2533e2ef02bd0e','wa5afd1798215289a4e96']}
def read(path):return json.load(open(path))
def load(world,variant):
    meta=read(ROOT/f'runs/{world}.meta.json')
    if meta['seed'] not in SEEDS:raise RuntimeError('Not a permitted development seed')
    result=dict(variant=variant,**meta,status='incomplete',actionErrors=read(error_path) if (error_path:=ROOT/f'runs/{world}.errors.json').exists() else [],interruption=INTERRUPTED.get(world))
    snapshot=ROOT/f'runs/{world}.snapshot.json'
    if not snapshot.exists():return result
    snap=read(snapshot)
    if snap['now']<snap['endsAt']:return result
    if any(not (ROOT/f'runs/{world}.{kind}.json').exists() for kind in ['score','reveal','events']):return result
    score=read(ROOT/f'runs/{world}.score.json')
    reveal=read(ROOT/f'runs/{world}.reveal.json')
    events=read(ROOT/f'runs/{world}.events.json')
    orders={o['id']:o for o in snap['orders']}
    ledger=[e['line'] for e in events if e['kind']=='ledger']
    sums=defaultdict(int)
    order_lines=defaultdict(lambda:defaultdict(int))
    for l in ledger:sums[l['kind']]+=l['cents'];order_lines[l.get('orderId')][l['kind']]+=l['cents']
    if sum(sums.values())!=score['marginCents']:raise RuntimeError('Ledger does not reconcile')
    request_rows=[]
    for rr in reveal['requests']:
        r=rr['request'];o=orders.get(r['id']);money=dict(order_lines[r['id']])
        leg_deadlines=[min(o['deadline'],leg['delivery']['window']['to']+30) if leg['delivery']['privateAddress'] else o['deadline'] for leg in o['legs']] if o else []
        request_rows.append(dict(id=r['id'],dealer=r['dealerId'],arrived=r['arrivedAt'],respondBy=r['respondBy'],fromPlace=r['legs'][0]['pickup']['placeId'],toPlace=r['legs'][0]['delivery']['placeId'],quote=rr['quote'],outcome=rr['outcome'],option=rr['option'],commercial=bool(rr['quote']) and min(rr['quote'].values())<10000000,won=bool(o and o['status']!='cancelled'),cancelled=bool(o and o['status']=='cancelled'),late=bool(o and o['status']!='cancelled' and any(t is None or t>leg_deadlines[i] for i,t in enumerate(o['deliveredAt']))),legDeadlines=leg_deadlines,priceCents=o['priceCents'] if o else None,marginCents=sum(money.values()),ledger=money))
    request_ids={r['id'] for r in request_rows}
    shared_lines=[line for line in ledger if line.get('orderId') not in request_ids]
    shared_cents=sum(line['cents'] for line in shared_lines)
    assert sum(r['marginCents'] for r in request_rows)+shared_cents==score['marginCents']
    result.update(status='complete',score=score,ledger=dict(sums),sharedLedger=shared_lines,sharedLedgerCents=shared_cents,commercialQuotes=sum(r['commercial'] for r in request_rows),unquoted=sum(r['outcome']=='unquoted' for r in request_rows),lateOrders=sum(r['late'] for r in request_rows),requests=request_rows)
    assert result['lateOrders']==round(score['wonOrders']*(1-score['onTimeShare']))
    return result

records=[load(w,'baseline') for w in BASE.values()]
for path in sorted((ROOT/'runs').glob('*.meta.json')):
    meta=read(path)
    # Filter metadata before opening any outcome file; future validation is excluded.
    if meta.get('label','').startswith('frontier') and meta.get('seed') in SEEDS:
        records.append(load(meta['worldId'],meta['label']))

baseline={r['seed']:r for r in records if r['variant']=='baseline'}
comparisons=[]
for record in records:
    if record['variant']=='baseline' or record['status']!='complete':continue
    base=baseline[record['seed']]
    a,b=record['score'],base['score']
    comparisons.append(dict(variant=record['variant'],seed=record['seed'],worldId=record['worldId'],baselineWorldId=base['worldId'],marginCents=a['marginCents'],baselineMarginCents=b['marginCents'],gainCents=a['marginCents']-b['marginCents'],relativeGain=a['marginCents']/b['marginCents']-1,onTimeShare=a['onTimeShare'],baselineOnTimeShare=b['onTimeShare'],qualified=a['ranked'],won=a['wonOrders'],baselineWon=b['wonOrders']))

def aggregate(rows):
    return dict(orders=len(rows),late=sum(r['late'] for r in rows),profitCents=sum(r['marginCents'] for r in rows),ledger={key:sum(r['ledger'].get(key,0) for r in rows) for key in sorted(set(key for r in rows for key in r['ledger']))})

attribution=[]
for record in records:
    if record['variant']!='frontier-auction' or record['status']!='complete':continue
    base=baseline[record['seed']]
    rmap={r['id']:r for r in record['requests']};bmap={r['id']:r for r in base['requests']}
    rwon={k for k,r in rmap.items() if r['won']};bwon={k for k,r in bmap.items() if r['won']}
    common=rwon&bwon;new=rwon-bwon;removed=bwon-rwon
    common_before=aggregate([bmap[k] for k in common]);common_after=aggregate([rmap[k] for k in common])
    newstats=aggregate([rmap[k] for k in new]);removedstats=aggregate([bmap[k] for k in removed])
    cancellations_before=sum(r['marginCents'] for r in base['requests'] if r['cancelled'])
    cancellations_after=sum(r['marginCents'] for r in record['requests'] if r['cancelled'])
    decomposition=dict(commonOrdersProfitChange=common_after['profitCents']-common_before['profitCents'],newOrdersProfit=newstats['profitCents'],removedOrdersProfit=-removedstats['profitCents'],cancelledOrdersCostChange=cancellations_after-cancellations_before)
    assert sum(decomposition.values())==record['score']['marginCents']-base['score']['marginCents']
    attribution.append(dict(seed=record['seed'],worldId=record['worldId'],commercialQuotesBefore=base['commercialQuotes'],commercialQuotesAfter=record['commercialQuotes'],decompositionCents=decomposition,newWins=newstats,removedWins=removedstats,commonBefore=common_before,commonAfter=common_after,newWinDetails=[rmap[k] for k in sorted(new)],removedWinDetails=[bmap[k] for k in sorted(removed)],commonOptionChanges=sum(rmap[k]['option']!=bmap[k]['option'] for k in common),commonPriceChangeCents=sum(rmap[k]['priceCents']-bmap[k]['priceCents'] for k in common)))

probes=[]
bundle_probe_path=ROOT/'runs/bundle-probe-mechanics-bundle-01.json'
if bundle_probe_path.exists():
    p=read(bundle_probe_path)
    probes.append(dict(type='multi-pickup mechanics probe',seed=p['seed'],baseWorldId=p['worldId'],file=str(bundle_probe_path.relative_to(ROOT)),requests=len(p.get('orders',[])),totalProbes=len(p['actions']),result=p.get('result'),deleted=p.get('deleted'),actions=p['actions'],interpretation='One ordinary post action with pickup-pickup-delivery-delivery was rejected: a driver moves one car at a time. Stopped on rejection and deleted the probe world. No fee, profit or timing treatment was tested.'))
probe_path=ROOT/'runs/menu-probe-mechanics-menu-01.json'
if probe_path.exists():
    p=read(probe_path)
    rows=[]
    for r in p['rows']:
        single=[x for x in r['probes'] if len(x['prices'])==1]
        multi=[x for x in r['probes'] if len(x['prices'])>1]
        rows.append(dict(requestId=r['request']['id'],options=[o['kind'] for o in r['request']['options']],probes=len(r['probes']),singleOptionWon=dict(Counter(x.get('option') for x in single if x['outcome']=='won')),multiOptionWon=dict(Counter(x.get('option') for x in multi if x['outcome']=='won')),allOutcomes=dict(Counter(x['outcome'] for x in r['probes']))))
    probes.append(dict(type='menu-choice branch probes',seed=p['seed'],baseWorldId=p['base'],file=str(probe_path.relative_to(ROOT)),requests=len(rows),totalProbes=sum(r['probes'] for r in rows),rows=rows,interpretation='Paired decision-point forks characterize menu choice on a few requests. They are not full-policy weeks, independent samples, or profit benchmarks. Search brackets named win are not evidence of an actual winning quote unless a recorded probe won.'))

variants=sorted(set(r['variant'] for r in records if r['variant']!='baseline'))
summaries={v:dict(completed=len(rs:=[r for r in comparisons if r['variant']==v]),qualified=sum(r['qualified'] for r in rs),meanMarginCents=mean(r['marginCents'] for r in rs) if rs else None,meanPairedGainCents=mean(r['gainCents'] for r in rs) if rs else None,worstOnTimeShare=min((r['onTimeShare'] for r in rs),default=None),bothSeedsComplete={r['seed'] for r in rs}==set(SEEDS)) for v in variants}
report=dict(scope='Stage-two development screens on explicit seeds14 and15 only. The earlier final-validation seeds are now reused as development data. Future holdout outcomes are excluded before any score read.',baselineSource='f8a730aaed7e169b0e8df8fd1dee9cc5543a69ccaf93ea1780fb78d31747befb',descriptions=DESCRIPTIONS,summary=summaries,pairedComparisons=comparisons,auctionAttribution=attribution,mechanisticProbes=probes,records=records,interruptions=INTERRUPTED,lateDefinition='An order is late if any leg is undelivered or exceeds its deadline; a private delivery uses min(order deadline, booked slot end + 30 minutes). The derived count reconciles to the terminal score.',limitations=['Two-seed adaptive screening is descriptive and cannot certify generalization or optimality.','Volume, shadow and lowfee labels represent coupled treatments; inspect full settings.','Order-set and ledger attribution is arithmetic on observed paths, not a causal mediation analysis.','Decision-point fork probes are not counted as full-week policy trials.','No future holdout outcomes were inspected.','Only terminal snapshots with score, reveal and events enter aggregate outcomes. Interrupted/incomplete attempts remain in the run manifest; their lack of a score is not a policy delivery failure.'])
details={r['worldId']:r['requests'] for r in records if 'requests' in r}
json.dump(details,open(ROOT/'runs/frontier-request-details.json','w'))
report['requestDetailsFile']='runs/frontier-request-details.json'
report['records']=[{key:value for key,value in r.items() if key!='requests'} for r in records]
json.dump(report,open(ROOT/'docs/frontier-experiments.json','w'),indent=2)
def eur(c):return f'−€{-c/100:,.2f}' if c<0 else f'€{c/100:,.2f}'
lines=['# Stage-two frontier experiments','','This report separates full-week policy screens from small mechanistic probes. Only the two explicitly named development seeds are used; fresh future holdouts are excluded.','','## Paired policy screen','','Seeds14 and15 were originally validation data. Their use here makes them development data for this stage. Cells show profit / on-time share; a missing result remains pending.','','| Policy | Seed14 | Seed15 | Mean gain versus baseline | Qualified completed runs |','|---|---:|---:|---:|---:|']
for v in ['baseline']+variants:
    cells=[]
    for seed in SEEDS:
        matches=[r for r in records if r['variant']==v and r['seed']==seed]
        complete=[r for r in matches if r['status']=='complete']
        cells.append('; '.join(f'{eur(r["score"]["marginCents"])} / {r["score"]["onTimeShare"]:.2%}' for r in complete) if complete else 'Incomplete / pending')
    s=summaries.get(v)
    gain=eur(s['meanPairedGainCents']) if s and s['meanPairedGainCents'] is not None else '—'
    qualified=f'{s["qualified"]}/{s["completed"]}' if s else '2/2'
    lines.append(f'| {v} | {cells[0]} | {cells[1]} | {gain} | {qualified} |')
lines+=['','## Treatment definitions','']
for v in variants:lines.append(f'- **{v}:** {DESCRIPTIONS.get(v,"See complete settings in the JSON manifest.")}')
lines+=['','Lowfee changes posted fees, minimum quote prices and the expected fulfillment cost passed to the demand optimizer. Shadow combines a cost multiplier change with capacity and lane changes. These comparisons cannot identify each component separately.','','## Auction attribution','','The auction treatment waits until five minutes before each response deadline, then quotes commercially. Winning decisions still occur at the dealer’s original response deadline, so this does not intentionally delay dispatch after an order is won. It shortens the time a speculative quote reserves capacity, uses more recent market/state evidence and sorts simultaneously due decisions by expected contribution. The following decomposition describes where the observed profit difference came from.','','| Seed | Commercial quotes, before→after | Common wins: profit change | New wins: profit | Removed wins: subtraction | Cancellation difference |','|---|---:|---:|---:|---:|---:|']
for a in attribution:
    d=a['decompositionCents'];lines.append(f'| {a["seed"].rsplit("-",1)[1]} | {a["commercialQuotesBefore"]}→{a["commercialQuotesAfter"]} | {eur(d["commonOrdersProfitChange"])} | {eur(d["newOrdersProfit"])} ({a["newWins"]["orders"]} orders) | {eur(d["removedOrdersProfit"])} ({a["removedWins"]["orders"]} orders) | {eur(d["cancelledOrdersCostChange"])} |')
lines+=['','Driver assignments, fees and dealer trust can change after admission changes. Therefore a common-order profit change is not an isolated treatment effect; the four components simply reconcile exactly to the whole-week difference.','', 'Shared-gig fees have no order identifier. They remain in whole-week totals and are stored separately as `sharedLedger`; request-level margins exclude them and must not be treated as net profit for bundled orders. Every report verifies that request-level lines plus shared lines equal the terminal score.','','## Mechanistic probes','']
for p in probes:lines.append(f'- **{p["type"]}**, seed `{p["seed"]}`: {p["requests"]} request states and {p["totalProbes"]} branch decisions. {p["interpretation"]}')
if not probes:lines.append('No completed probe artifact was available when this report was generated.')
lines+=['','## Operational interruptions','','Only a terminal snapshot with score, reveal and events enters the comparison. Private-delivery deadlines use the booked slot end plus 30 minutes, bounded by the order deadline; every leg must be on time. All derived late counts and ledger totals reconcile to the recorded score.','']
for w,reason in INTERRUPTED.items():lines.append(f'- `{w}`: {reason} Source: coordinator report of runtime stderr; the saved action-error array is separate from transport errors.')
lines+=['','## Run manifest','','| Label | Seed | World | Status | Source snapshot |','|---|---|---|---|---|']
for r in records:lines.append(f'| {r["variant"]} | {r["seed"]} | `{r["worldId"]}` | {r["status"]} | `{r["revision"]}` |')
lines+=['','Full settings, score fields, shared-gig ledger lines and source identifiers are in [frontier-experiments.json](frontier-experiments.json). The local request-level ledger detail is written to `runs/frontier-request-details.json`, alongside the ignored raw run artifacts. Rebuild using the strict seed allowlist:','','```bash','python3 analysis/frontier_report.py','```','','These are two-seed development results. A selected immutable candidate still needs a new independent validation panel.']
(ROOT/'docs/frontier-experiments.md').write_text('\n'.join(lines)+'\n')
print(json.dumps(dict(summaries=summaries,auctionAttribution=[{k:v for k,v in a.items() if k not in ['newWinDetails','removedWinDetails']} for a in attribution],probes=[{k:v for k,v in p.items() if k!='rows'} for p in probes]),indent=2))
