import hashlib
import io
import json
import shutil
import tarfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
NAME='quote-payment-development-v1'
path=ROOT/f'experiments/{NAME}.json'
bundle=ROOT/f'runs/frozen/{NAME}'
if path.exists() or bundle.exists():raise RuntimeError('Never overwrite a frozen study')
old=json.loads((ROOT/'experiments/bundle-payment-ablation-v1.json').read_text())
for file,digest in old['files'].items():assert hashlib.sha256((ROOT/file).read_bytes()).hexdigest()==digest,file
estimate=json.loads((ROOT/'experiments/level8-estimate-v1.json').read_text())
seeds=list(dict.fromkeys(t['seed'] for t in estimate['trials']))[:6]
settings=next(t['settings'] for t in estimate['trials'] if t['label'].endswith('-payments'))
now=datetime.now(timezone.utc)
protocol={'frozenAt':now.isoformat(),'role':'Six familiar matched development weeks; quote payment consistency ablation','design':'docs/quote-payment-study-design.md','seeds':seeds,'selection':'First six level8-estimate-v1 seeds; repeatedly used development only.','changes':'Remove premium-payment quote alternatives; preserve default quotes, menus, admission, economics, owned-job payment choices and execution. Filter after original frame generation and audit omissions.','controls':'Exact archived portfolio-payments outcomes; disabled and retained-frame conformance tested.','analysis':'All paired weekly outcomes, uncertainty, qualification bounds, removal counts, selected multipliers and failures.','gate':'Mean paired gain>=1500euros/week, all six qualifying, minimum weekly on-time>=.92, no undelivered, failed visits, fines or runtime failures. No promotion.','stopping':'Exactly six new worlds, no retries, replacements, tuning or outcome-based stopping. Failure stops new creation; active cases retain outcomes.600second world budget.','operations':{'workers':4,'capacity':8,'sharedLock':'runs/team-world-creation.lock','mode':'practice'},'authorization':'Unranked only; no ranking, finals, deletion or forks.'}
protocol_path=ROOT/f'experiments/{NAME}-protocol.json';protocol_path.write_text(json.dumps(protocol,indent=2)+'\n')
shutil.copytree(ROOT/old['bundle'],bundle,ignore=shutil.ignore_patterns('__pycache__'))
def translated(file):
 return (ROOT/file).read_text().replace('../../src/','./').replace('../../vendor/','../vendor/').replace('../../experiments/booking-response-prior.json','./booking-prior.json').replace('../../experiments/portfolio-prior.json','./portfolio-prior.json').replace('../value/policy.ts','./mechanisms.ts').replace('../portfolio/policy.ts','./portfolio.ts')
(bundle/'src/portfolio.ts').write_text(translated('research/portfolio/policy.ts'))
(bundle/'src/policy.ts').write_text(translated('research/quote-payment/policy.ts'))
bundle_files={str(p.relative_to(bundle)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(bundle.rglob('*')) if p.is_file()}
files={str((bundle/file).relative_to(ROOT)):digest for file,digest in bundle_files.items()}
for file in ['research/runner/run.ts','research/runner/schedule.ts','research/runner/spread.ts','research/runner/deadline.ts','vendor/typescript/spread.ts','docs/quote-payment-study-design.md',str(protocol_path.relative_to(ROOT))]:files[file]=hashlib.sha256((ROOT/file).read_bytes()).hexdigest()
plan={'frozenAt':now.isoformat(),'bundle':str(bundle.relative_to(ROOT)),'files':files,'bundleFiles':bundle_files,'protocol':str(protocol_path.relative_to(ROOT)),'protocolSha256':files[str(protocol_path.relative_to(ROOT))],'pythonExecutable':old['pythonExecutable'],'pythonVersions':old['pythonVersions'],'attempts':f'experiments/{NAME}-attempts.jsonl','report':f'docs/{NAME}-runs.json','archivedPlan':'experiments/level8-estimate-v1.json','schedule':{'mode':'practice','workers':4,'capacity':8,'createUntil':int((now+timedelta(minutes=45)).timestamp()*1000),'mutateUntil':int((now+timedelta(minutes=60)).timestamp()*1000),'trials':[{'id':f'{NAME}-{i+1}','seed':seed,'level':8,'settings':{**settings,'defaultQuotePayment':True}} for i,seed in enumerate(seeds)]}}
path.write_text(json.dumps(plan,indent=2)+'\n')
with tarfile.open(ROOT/f'experiments/{NAME}-source.tar.gz','w:gz') as archive:
 for name in bundle_files:
  data=(bundle/name).read_bytes();member=tarfile.TarInfo(name);member.size=len(data);member.mtime=0;archive.addfile(member,io.BytesIO(data))
print(json.dumps({'manifest':str(path.relative_to(ROOT)),'newWorlds':6,'archivedReferences':6}))
