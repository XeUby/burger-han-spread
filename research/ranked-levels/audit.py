"""Check every authorized ranked world against server identity and local terminal evidence."""
import hashlib,json,sys
from pathlib import Path
from collections import Counter
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'analysis'))
from frontier_validation import order_counts
protocol=json.loads((root/'experiments/levels-deadline-protocol.json').read_text())
inventory=json.loads((root/'docs/levels-final-server.json').read_text())
worlds=[w for w in inventory['worlds'] if w['season']==protocol['season'] and w['level'] in range(1,8) and w['boardRun']]
assert len({(w['level'],w['boardRun']) for w in worlds})==len(worlds)
logs=[]
for name in ['levels-ranked','levels-deadline-ranked','levels-deadline-eight-ranked']:
 p=root/f'experiments/{name}-attempts.jsonl'
 if p.exists(): logs += [json.loads(line) for line in p.read_text().splitlines()]
rows=[]
for w in sorted(worlds,key=lambda w:(w['level'],w['boardRun'])):
 world=w['worldId'];row={**w,'status':'unfinished'}
 starts=[r for r in logs if r.get('worldId')==world and r['event']=='created'];assert len(starts)==1
 assert starts[0]['level']==w['level'] and starts[0]['run']==w['boardRun']
 finishes=[r for r in logs if r.get('worldId')==world and r['event']=='completed'];assert len(finishes)<=1
 row['startedAt']=starts[0]['at']
 assert row['startedAt']<protocol['stopRankedRequestsAt']
 if w['ended']:
  assert len(finishes)==1
  row['completedAt']=finishes[0]['completedAt'];assert row['completedAt']<protocol['stopRankedRequestsAt']
  files={}
  def read(kind):
   p=root/f'runs/{world}.{kind}.json';b=p.read_bytes();files[kind]={'path':str(p.relative_to(root)),'sha256':hashlib.sha256(b).hexdigest()};return json.loads(b)
  meta=read('meta');score=read('score');snapshot=read('snapshot');events=read('events');errors=read('errors');recoveries=read('recoveries')
  assert snapshot['now']==snapshot['endsAt']
  initial=w['level']<=4 and w['boardRun']==1
  expected=json.loads((root/'experiments/final-config.json').read_text()) if initial else protocol['policies'][str(w['level'])]
  revision=json.loads((root/'experiments/current-selection.json').read_text())['runtimeRevision'] if initial else protocol['revision']
  assert meta['worldId']==world and meta['level']==w['level'] and meta['revision']==revision and meta['settings']==expected
  counts=order_counts(snapshot['orders']);assert counts['wonOrders']==score['wonOrders']
  assert abs(counts['onTimeOrders']/counts['wonOrders']-score['onTimeShare'])<1e-12
  assert abs(counts['undeliveredOrders']/counts['wonOrders']-score['undeliveredShare'])<1e-12
  ledger=Counter()
  for e in events:
   if e['kind']=='ledger':ledger[e['line']['kind']]+=e['line']['cents']
  assert sum(ledger.values())==score['marginCents']
  board=next(b for b in inventory['boards'] if b['level']==w['level'])
  season=next(s for s in [board['current'],board['previous']] if s and s['season']==protocol['season'])
  team=next(t for t in season['teams'] if t['team']=='burger-han')
  run=next(r for r in team['runs'] if r['run']==w['boardRun'])
  assert run['marginCents']==score['marginCents'] and run['wonOrders']==score['wonOrders'] and run['ranked']==score['ranked'] and abs(run['onTimeShare']-score['onTimeShare'])<1e-12 and run['deletedAt'] is None
  row.update(status='complete',policy='initial level8 transfer' if initial else 'frozen deadline policy',revision=revision,settings=expected,score=score,counts=counts,ledgerCents=dict(ledger),failedVisits=sum(e['kind']=='visit_failed' for e in events),errors=errors,recoveries=recoveries,files=files)
 rows.append(row)
summary=[]
for level in range(1,8):
 arm=[r for r in rows if r['level']==level and r['status']=='complete']
 b=next(b for b in inventory['boards'] if b['level']==level)
 season=next(s for s in [b['current'],b['previous']] if s and s['season']==protocol['season'])
 team=next(t for t in season['teams'] if t['team']=='burger-han')
 summary.append({'level':level,'completed':len(arm),'qualifiedWeeks':sum(r['score']['ranked'] for r in arm),'totalProfitEuros':sum(r['score']['marginCents'] for r in arm)/100,'meanProfitEuros':sum(r['score']['marginCents'] for r in arm)/100/len(arm) if arm else None,'onTimeShare':sum(r['counts']['onTimeOrders'] for r in arm)/sum(r['score']['wonOrders'] for r in arm) if arm else None,'orders':sum(r['score']['wonOrders'] for r in arm),'undelivered':sum(r['counts']['undeliveredOrders'] for r in arm),'failedVisits':sum(r['failedVisits'] for r in arm),'actionErrors':sum(len(r['errors']) for r in arm),'recoveries':sum(len(r['recoveries']) for r in arm),'finesEuros':-sum(r['ledgerCents'].get('fine',0) for r in arm)/100,'officialRank':team['rank'],'officialQualified':team['ranked'],'officialPlayed':team['played']})
complete=len(rows)==35 and all(r['status']=='complete' for r in rows)
report={'generatedAt':datetime.now(timezone.utc).isoformat(),'season':protocol['season'],'complete':complete,'completed':sum(r['status']=='complete' for r in rows),'lastCompletedAt':max((r['completedAt'] for r in rows if r['status']=='complete'),default=None),'cutoffHelsinki':protocol['userDeadline'],'evidenceStatus':protocol['evidenceStatus'],'policyChanges':'Initial first runs atlevels1-4used old control. Remaining31use one frozen level-aware deadline policy. Operational concurrency changed from4to8without changing policy settings.','statisticalLimit':'Official ranking scores are retained outcomes, not a fresh paired validation panel or a reliability guarantee. No policy tuning from ranked results.','summary':summary,'worlds':rows,'nonWorldFailures':[r for r in logs if r['event']=='failed' and not r.get('worldId')]}
(root/'docs/levels-ranked-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['complete','completed','lastCompletedAt','summary']},indent=2))
