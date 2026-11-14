import hashlib
import json
from datetime import datetime,timedelta,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
NAME='option-specific-development-v1'
path=ROOT/f'experiments/{NAME}-continuation.json'
if path.exists():raise RuntimeError('Never repeat a continuation')
plan=json.loads((ROOT/f'experiments/{NAME}.json').read_text())
result=json.loads((ROOT/plan['report']).read_text())
assert len(result['cases'])==6
assert sum(c['status']=='completed' for c in result['cases'])==5
pending=[c['trial'] for c in result['cases'] if c['status']=='not_started' and not c.get('worldId')]
assert len(pending)==1 and pending[0]['id'].endswith('-6')
assert not any(c['status'] in ['failed','running','creating','creation_unknown'] for c in result['cases'])
for file,expected in plan['files'].items():assert hashlib.sha256((ROOT/file).read_bytes()).hexdigest()==expected,file
for file in [f'experiments/{NAME}-capacity-amendment.json','experiments/team-capacity-policy.json']:
 plan['files'][file]=hashlib.sha256((ROOT/file).read_bytes()).hexdigest()
now=datetime.now(timezone.utc)
plan.update(frozenAt=now.isoformat(),attempts=f'experiments/{NAME}-continuation-attempts.jsonl',report=f'docs/{NAME}-continuation-runs.json',continuationOf=f'experiments/{NAME}.json',reason='Only never-created sixth case, after user-directed creation cancellation. No failed or completed case repeated.')
plan['schedule'].update(workers=1,capacity=8,trials=pending,createUntil=int((now+timedelta(minutes=30)).timestamp()*1000),mutateUntil=int((now+timedelta(minutes=45)).timestamp()*1000))
path.write_text(json.dumps(plan,indent=2)+'\n')
print(path.relative_to(ROOT))
