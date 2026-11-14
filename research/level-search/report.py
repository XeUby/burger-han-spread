"""Audit every planned development world and report paired, level-specific contrasts."""
import hashlib,json,statistics,sys
from collections import Counter
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'analysis'))
from frontier_validation import load_world
path=Path(sys.argv[1]);plan=json.loads(path.read_text())
attemptFiles=plan.get('attemptFiles',[plan['attempts']])
attempts=[json.loads(line) for file in attemptFiles for line in (root/file).read_text().splitlines()]
records=[]
for trial in plan['trials']:
 matching=[r for r in attempts if all(r.get(k)==trial[k] for k in ['label','seed','level'])]
 created=[r for r in matching if r['event']=='created'];assert len(created)<=1
 row={**trial,'status':'not-started','attempts':matching}
 if created:
  world=created[0]['worldId'];row.update(worldId=world,status='unfinished')
  completed=[r for r in matching if r['event']=='completed'];assert len(completed)<=1
  if completed:
   expected={'revision':plan['revision'],'settings':trial['settings']}
   result=load_world(root,world,trial['seed'],expected)
   meta=json.loads((root/f'runs/{world}.meta.json').read_text());assert meta['level']==trial['level']
   events=json.loads((root/f'runs/{world}.events.json').read_text());ledger=Counter()
   for event in events:
    if event['kind']=='ledger':ledger[event['line']['kind']]+=event['line']['cents']
   row.update(status='complete',result=result,ledgerCents=dict(ledger),failedVisits=sum(e['kind']=='visit_failed' for e in events),errors=json.loads((root/f'runs/{world}.errors.json').read_text()),recoveries=json.loads((root/f'runs/{world}.recoveries.json').read_text()))
 interruptions=[r for r in matching if r['event']=='failed']
 row['operationalInterruptions']=interruptions
 if any(r.get('worldId') or not any(message in r.get('error','') for message in ['New ranked attempts held by user','New world creation held for scheduler handover']) for r in interruptions):row['status']='failed'
 records.append(row)
assert sum(len(r['attempts']) for r in records)==len(attempts)
terminal=all(r['status']=='complete' for r in records)
summary=[];interactions=[]
if terminal:
 for level in plan['levels']:
  selected=[r for r in records if r['level']==level]
  controls={r['seed']:r for r in selected if r['label'].endswith('-control')}
  assert set(controls)==set(plan['seeds'])
  for label in sorted({r['label'] for r in selected}):
   arm=[r for r in selected if r['label']==label];assert len(arm)==len(plan['seeds'])
   gains=[r['result']['marginCents']-controls[r['seed']]['result']['marginCents'] for r in arm]
   row={'level':level,'label':label,'uniqueSeedBlocks':len(plan['seeds']),'meanProfitEuros':statistics.mean(r['result']['marginCents'] for r in arm)/100,'meanPairedGainEuros':statistics.mean(gains)/100,'worstPairedGainEuros':min(gains)/100,'meanOrders':statistics.mean(r['result']['wonOrders'] for r in arm),'qualifiedWeeks':sum(r['result']['ranked'] for r in arm),'minimumOnTimeShare':min(r['result']['onTimeShare'] for r in arm),'aggregateOnTimeShare':sum(r['result']['onTimeOrders'] for r in arm)/sum(r['result']['wonOrders'] for r in arm),'undeliveredOrders':sum(r['result']['undeliveredOrders'] for r in arm),'failedVisits':sum(r['failedVisits'] for r in arm),'actionErrors':sum(len(r['errors']) for r in arm),'recoveries':sum(len(r['recoveries']) for r in arm),'meanDriverFeesEuros':-statistics.mean(r['ledgerCents'].get('driver_fee',0) for r in arm)/100,'meanLateRefundsEuros':-statistics.mean(r['ledgerCents'].get('late_refund',0) for r in arm)/100,'totalFinesEuros':-sum(r['ledgerCents'].get('fine',0) for r in arm)/100}
   row['developmentGatePassed']=not label.endswith('-control') and row['meanPairedGainEuros']>=1500 and row['worstPairedGainEuros']>=0 and row['qualifiedWeeks']==len(plan['seeds']) and row['minimumOnTimeShare']>=.92 and row['undeliveredOrders']==row['failedVisits']==0
   row['promotionAllowed']=False
   summary.append(row)
  if 'economics' in plan['variants']:
   for seed in plan['seeds']:
    values={r['label'].removeprefix('levels-factorial-'):r['result']['marginCents'] for r in selected if r['seed']==seed}
    interactions.append({'level':level,'seed':seed,'interactionEuros':(values['coupled']-values['economics']-values['admission']+values['control'])/100})
report={'generatedAt':datetime.now(timezone.utc).isoformat(),'plan':str(path),'planSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'terminal':terminal,'completed':sum(r['status']=='complete' for r in records),'planned':len(records),'uniqueSeedBlocks':len(plan['seeds']),'interpretation':'Exploratory development only. Repeated worlds and levels are not independent seed replications. No pooling across levels to hide a failure. A passing development gate does not authorize ranking or establish safety.','summary':summary,'interactions':interactions,'records':records}
out=root/plan['report'].replace('.json','-analysis.json');out.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['terminal','completed','planned','uniqueSeedBlocks','summary','interactions']},indent=2))
