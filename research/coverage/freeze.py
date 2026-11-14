import hashlib
import io
import json
import secrets
import shutil
import tarfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = 'coverage-development-v1'
path = ROOT / f'experiments/{NAME}.json'
bundle = ROOT / f'runs/frozen/{NAME}'
if path.exists() or bundle.exists(): raise RuntimeError('Never overwrite a frozen study')
old = json.loads((ROOT / 'experiments/bundle-payment-ablation-v1.json').read_text())
for file, digest in old['files'].items():
    assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest, file
estimate = json.loads((ROOT / 'experiments/level8-estimate-v1.json').read_text())
seeds = list(dict.fromkeys(t['seed'] for t in estimate['trials']))
assert len(seeds) == 8
settings = next(t['settings'] for t in estimate['trials'] if t['label'].endswith('-payments'))
nonce = secrets.token_hex(16)
ordered = sorted(seeds, key=lambda seed: hashlib.sha256(f'{nonce}:{seed}'.encode()).hexdigest())
delayed = set(ordered[:4])
now = datetime.now(timezone.utc)
protocol = {
 'frozenAt': now.isoformat(), 'role': 'Bounded randomized development coverage, not promotion or a fitted replacement dispatcher',
 'seeds': seeds, 'seedRole': 'All eight familiar level8-estimate development weeks; exact archived candidate outcomes retained as whole-policy references. No new independent weeks claimed.',
 'assignmentNonce': nonce, 'weeklyRegime': 'First four seeds sorted by SHA256(nonce:seed) get60minute delayed intermediate escalation, remaining four get0. Opening and last rescue steps and urgent schedules unchanged. Analyze week-level effects; four versus four is weak evidence and post counts do not increase sample size.',
 'acquisition': 'At most24 assignments/week and6/day among incumbent-excluded requests with a graph-feasible plain-note public single-leg option and180minutes booking slack. At most2 exploratory quotes/jobs pending or unbooked. Choose latest-start option, then randomize1/3 each decline,1.25list,1.50list, with1.35baseFee floor. Log realized prices when floors collapse arms. Other work, including private/trade-in and unresolved notes, is logged but excluded from this first safe-fulfillment coverage panel.',
 'payments': 'First40 nonurgent posts with at least360minutes pickup slack, including portfolio direct actions, randomize opening multipliers0.92/1/1.08 at1/3 each, capped at next step. Record actual action and original schedule; no invented unchosen outcome.',
 'offers': 'First40 existing-policy targeted offers randomize price multipliers1/1.08 at1/2 each. This tests price conditional on targeting, not the value of offers versus no offer. Expirations remain distinct from declines.',
 'randomization': 'SHA256 with independent domains and frozen per-week random seeds; rejection sampling eliminates modulo bias. Probability is conditional on recorded eligibility and prior trajectory. Budgets count assignments, including controls and failed actions.',
 'analysis': 'Retain decision-time features, every assignment and action result, booking/drop/offer/cancellation/censoring outcomes, all weekly ledgers and reliability metrics. Estimate descriptive effects clustered by underlying week; no IID-order confidence claims or causal comparisons to historically rejected unassigned requests. Interventions interfere within week; weekly regime estimates concern the full exploratory policy.',
 'stopping': 'Exactly8planned worlds;8workers;8unfinished team cap under shared lock. Original600second runtime budget. Any runtime failure stops new creation; active jobs finish. No retries or replacements; preserve partial evidence.',
 'decision': 'Use coverage to choose interpretable action-conditioned cost/booking models and structural acquisition tests. Reject savings that become escalation/refunds or qualification failures. No threshold sweep or promotion from this panel.',
 'authorization': 'Unranked only, no ranked submissions/test finals/finals/deletion/forks',
}
protocol_path = ROOT / f'experiments/{NAME}-protocol.json';protocol_path.write_text(json.dumps(protocol,indent=2)+'\n')
shutil.copytree(ROOT / old['bundle'],bundle,ignore=shutil.ignore_patterns('__pycache__'))
source=(ROOT/'research/coverage/policy.ts').read_text().replace('../portfolio/policy.ts','./portfolio.ts').replace('../graph/candidates.ts','./graph/candidates.ts').replace('../../vendor/','../vendor/')
(bundle/'src/policy.ts').write_text(source)
(bundle/'src/graph').mkdir()
for name in ['candidates.ts','constraints.ts']:
    source=(ROOT/f'research/graph/{name}').read_text().replace('../../src/','../')
    (bundle/f'src/graph/{name}').write_text(source)
trials=[{'id':f'{NAME}-{i+1}', 'level':8,'seed':seed,'settings':{**settings,'coverage':True,'escalationDelay':60 if seed in delayed else 0,'randomSeed':int.from_bytes(hashlib.sha256(f'{nonce}:actions:{seed}'.encode()).digest()[:4],'big') or 1}} for i,seed in enumerate(seeds)]
bundle_files={str(p.relative_to(bundle)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(bundle.rglob('*')) if p.is_file()}
files={str((bundle/name).relative_to(ROOT)):digest for name,digest in bundle_files.items()}
for file in ['research/runner/run.ts','research/runner/schedule.ts','research/runner/spread.ts','research/runner/deadline.ts','vendor/typescript/spread.ts',str(protocol_path.relative_to(ROOT))]:files[file]=hashlib.sha256((ROOT/file).read_bytes()).hexdigest()
plan={'frozenAt':now.isoformat(),'bundle':str(bundle.relative_to(ROOT)),'files':files,'bundleFiles':bundle_files,'protocol':str(protocol_path.relative_to(ROOT)),'protocolSha256':files[str(protocol_path.relative_to(ROOT))],'pythonExecutable':old['pythonExecutable'],'pythonVersions':old['pythonVersions'],'attempts':f'experiments/{NAME}-attempts.jsonl','report':f'docs/{NAME}-runs.json','schedule':{'mode':'practice','workers':8,'capacity':8,'createUntil':int((now+timedelta(minutes=45)).timestamp()*1000),'mutateUntil':int((now+timedelta(minutes=60)).timestamp()*1000),'trials':trials},'archivedPlan':'experiments/level8-estimate-v1.json'}
path.write_text(json.dumps(plan,indent=2)+'\n')
with tarfile.open(ROOT/f'experiments/{NAME}-source.tar.gz','w:gz') as archive:
 for name in bundle_files:
    data=(bundle/name).read_bytes();member=tarfile.TarInfo(name);member.size=len(data);member.mtime=0;archive.addfile(member,io.BytesIO(data))
print(json.dumps({'manifest':str(path.relative_to(ROOT)),'worlds':len(trials),'delayedWeeks':len(delayed)}))
