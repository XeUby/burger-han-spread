import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'experiments/coverage-development-v1.json'
plan=json.loads(source.read_text())
if (ROOT/plan['attempts']).exists():raise RuntimeError('Cannot amend a study after attempts begin')
name='coverage-development-v2'
target=ROOT/f'experiments/{name}.json'
if target.exists():raise RuntimeError('Never overwrite registration')
design='docs/coverage-identification-plan.md'
plan['files'][design]=hashlib.sha256((ROOT/design).read_bytes()).hexdigest()
plan['identificationPlan']=design
plan['supersedesUnlaunched']='experiments/coverage-development-v1.json'
now=datetime.now(timezone.utc)
plan['frozenAt']=now.isoformat()
plan['attempts']=f'experiments/{name}-attempts.jsonl'
plan['report']=f'docs/{name}-runs.json'
plan['schedule']['createUntil']=int((now+timedelta(minutes=45)).timestamp()*1000)
plan['schedule']['mutateUntil']=int((now+timedelta(minutes=60)).timestamp()*1000)
for trial in plan['schedule']['trials']:trial['id']=trial['id'].replace('coverage-development-v1',name)
plan['amendment']='Before any execution: add precise hypotheses, estimands, attribution/censoring rules, support requirements, simple model baselines and development decision rules. Policy, seeds, assigned regimes and action randomization seeds are unchanged. v1 is retained unlaunched, not counted as outcomes.'
target.write_text(json.dumps(plan,indent=2)+'\n')
print(target.relative_to(ROOT))
