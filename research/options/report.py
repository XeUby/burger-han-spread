import hashlib
import json
import statistics
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from research.value.report import load_world,paired,summarize
NAME='option-specific-development-v1'
def read(path):return json.loads((ROOT/path).read_text())
def digest(path):return hashlib.sha256((ROOT/path).read_bytes()).hexdigest()
plan=read(f'experiments/{NAME}.json')
plans=[plan]
continuation=ROOT/f'experiments/{NAME}-continuation.json'
if continuation.exists():plans.append(json.loads(continuation.read_text()))
attempts=[]
for manifest in plans:
 for file,expected in manifest['files'].items():assert digest(file)==expected,file
 if (ROOT/manifest['attempts']).exists():attempts += [json.loads(line) for line in (ROOT/manifest['attempts']).read_text().splitlines()]
revision=hashlib.sha256()
for file in sorted((ROOT/plan['bundle']/'src').glob('*.ts')):revision.update(file.name.encode());revision.update(file.read_bytes())
defaults=json.loads(subprocess.check_output(['node','--input-type=module','-e','const {defaults}=await import(process.argv[1]);console.log(JSON.stringify(defaults))',(ROOT/plan['bundle']/'src/policy.ts').as_uri()],text=True))
archived=read('docs/level8-estimate-v1-results.json')
controls={r['seed']:r for r in archived['records'] if r['label'].endswith('-payments')}
records=[];references=[]
for trial in plan['schedule']['trials']:
 starts=[a for a in attempts if a['event']=='created' and a['case']['trial']['id']==trial['id']]
 assert len(starts)<=1,'Duplicate world for planned case'
 row={'seed':trial['seed'],'label':trial['id'],'status':'not_started','level':8}
 ref=controls[trial['seed']]
 for kind,expected in ref['artifactHashes'].items():assert digest(f"runs/{ref['worldId']}.{kind}.json")==expected
 references.append(ref)
 if not starts:records.append(row);continue
 world=starts[0]['case']['worldId'];row['worldId']=world
 failures=[a for a in attempts if a['event'] in ['failed','creation_unknown'] and a.get('case',{}).get('trial',{}).get('id')==trial['id']]
 complete=any(a['event']=='completed' and a['case']['worldId']==world for a in attempts)
 row.update(status='complete' if complete else 'failed' if failures else 'running',runtimeFailures=failures,artifactHashes={kind:digest(f'runs/{world}.{kind}.json') for kind in ['meta','events','decisions','errors','recoveries','score','snapshot'] if (ROOT/f'runs/{world}.{kind}.json').exists()})
 if complete:
  outcome=load_world(ROOT,world,trial['seed'],{'revision':revision.hexdigest(),'settings':{**defaults,**trial['settings']}})
  events=read(f'runs/{world}.events.json');decisions=read(f'runs/{world}.decisions.json');ledger=Counter()
  for e in events:
   if e['kind']=='ledger':ledger[e['line']['kind']]+=e['line']['cents']
  assert sum(ledger.values())==outcome['marginCents']
  solves=[d for d in decisions if d['kind']=='portfolio_solve']
  quotes=[d for d in decisions if d['kind']=='action_result' and d['action']['type']=='quote' and (d.get('result') or {}).get('ok') and any(p<100_000_000 for p in d['action']['prices'].values())]
  row.update(score={k:outcome[k] for k in ['marginCents','revenueCents','wonOrders','onTimeOrders','onTimeShare','undeliveredOrders','ranked']},ledger=dict(ledger),failedVisits=sum(e['kind']=='visit_failed' for e in events),actionErrors=read(f'runs/{world}.errors.json'),recoveries=read(f'runs/{world}.recoveries.json'),mechanisms=dict(Counter(d['kind'] for d in decisions)),candidateAudit={'solves':len(solves),'maximumAlternatives':max([len(d['input']['alternatives']) for d in solves]+[0]),'omitted':sum(d['omitted'] for d in solves),'framesAtAlternativeCap':sum(len(d['input']['alternatives'])>=360 for d in solves),'statuses':dict(Counter(d['result']['status'] for d in solves)),'substantiveQuotes':len(quotes),'multiOptionQuotes':sum(len(d['action']['prices'])>1 for d in quotes),'awardedOptions':dict(Counter(e['order']['option'] for e in events if e['kind']=='order_won'))})
 records.append(row)
terminal=all(r['status']=='complete' for r in records)
report={'scope':'Six familiar matched development seeds, one option-specific policy versus exact archived candidate. No promotion or rank claim.','terminal':terminal,'completed':sum(r['status']=='complete' for r in records),'expected':6,'records':records,'references':references,'summary':{},'paired':None,'developmentGatePassed':False,'capacityAmendment':f'experiments/{NAME}-capacity-amendment.json','limitations':['Economic model and demand/menu-choice approximations remain unvalidated.','Option enumeration also increases alternative cap120to360; inspect omissions and solver statuses.','Six reused weeks are development; descriptive intervals are not untouched validation.','Original creation was cancelled after five cases to apply the user four-own-run limit. A separately recorded continuation may run only the never-created case.']}
if terminal:
 report['summary']={'optionSpecific':summarize(records),'candidate':summarize(references)}
 report['paired']=paired([r['score']['marginCents']-controls[r['seed']]['score']['marginCents'] for r in records])
 kinds=set().union(*(r['ledger'] for r in records),*(r['ledger'] for r in references))
 report['meanLedgerDifferenceEuros']={k:statistics.mean(r['ledger'].get(k,0)-controls[r['seed']]['ledger'].get(k,0) for r in records)/100 for k in kinds}
 assert abs(sum(report['meanLedgerDifferenceEuros'].values())-report['paired']['meanEuros'])<1e-8
 summary=report['summary']['optionSpecific']
 report['developmentGatePassed']=report['paired']['meanEuros']>=1500 and summary['qualified']==6 and summary['minimumOnTime']>=.92 and summary['undelivered']==summary['failedVisits']==summary['finesEuros']==0
 report['decision']='Eligible only for a separately frozen next structural comparison; not promotion' if report['developmentGatePassed'] else 'Reject this option-specific policy as a replacement. Preserve incumbent and adverse evidence; do not tune it on these six seeds.'
(ROOT/f'docs/{NAME}-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['terminal','completed','expected','paired','developmentGatePassed']},indent=2))
