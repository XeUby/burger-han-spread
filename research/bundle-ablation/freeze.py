import hashlib
import io
import json
import shutil
import tarfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = 'bundle-payment-ablation-v1'
bundle = ROOT / f'runs/frozen/{NAME}'
path = ROOT / f'experiments/{NAME}.json'
if path.exists() or bundle.exists():
    raise RuntimeError('Never overwrite a frozen ablation')
old = json.loads((ROOT / 'experiments/level8-estimate-v1.json').read_text())
for name, expected in old['files'].items():
    assert hashlib.sha256((ROOT / old['bundle'] / name).read_bytes()).hexdigest() == expected, name
shutil.copytree(ROOT / old['bundle'], bundle, ignore=shutil.ignore_patterns('__pycache__'))
def translated(source):
    return (ROOT / source).read_text().replace('../../src/', './').replace('../../vendor/', '../vendor/').replace('../../experiments/booking-response-prior.json', './booking-prior.json').replace('../../experiments/portfolio-prior.json', './portfolio-prior.json').replace('../value/policy.ts', './mechanisms.ts').replace('../portfolio/policy.ts', './portfolio.ts')
(bundle / 'src/portfolio.ts').write_text(translated('research/portfolio/policy.ts'))
(bundle / 'src/policy.ts').write_text(translated('research/bundle-ablation/policy.ts'))
seeds = list(dict.fromkeys(t['seed'] for t in old['trials']))[:4]
settings = {arm: next(t['settings'] for t in old['trials'] if t['label'].endswith('-' + arm)) for arm in ['benchmark', 'payments']}
now = datetime.now(timezone.utc)
protocol = {
 'frozenAt': now.isoformat(), 'role': 'Four-block whole-week architecture-package x bundle-payment development ablation; not promotion',
 'motivation': 'Independently reproduced10848cent versus9221cent bundle opening fees on identical held orders. Original gain confounded bundle-payment convention with architecture.',
 'seeds': seeds, 'seedChoice': 'First four seeds in the already completed level8-estimate-v1 manifest, in manifest order; not selected by outcomes. All are development.',
 'arms': {'control-high': 'Archived benchmark', 'portfolio-low': 'Archived payments candidate', 'control-low': 'New crossed arm', 'portfolio-high': 'New crossed arm'},
 'factorDefinition': 'Architecture is the complete retained policy package: incumbent versus portfolio plus future/payment-choice flags. This does not isolate mathematical optimization alone.',
 'paymentDefinition': 'High uses raw held/prospective solo schedules as bundle inputs. Low applies the existing0.85 opening payout before bundle construction. The resulting entire bundle ladder can change. Live open-anchor schedules remain as posted, with no inverse rounding. Solo posting, later rescue logic, feasibility and all other settings are unchanged. In the portfolio, changed bundle inputs also affect the existing modeled savings and route selection; this is a policy-level intervention, not an isolated posted-fee effect.',
 'reuse': 'Eight exact archived full weeks form control-high and portfolio-low. Those convention branches explicitly delegate to original behavior; tests compare control posts and complete portfolio frames. Do not reclassify these familiar outcomes as fresh validation.',
 'comparisons': ['Control low minus control high', 'Portfolio low minus portfolio high', 'Portfolio high minus control high', 'Portfolio low minus control low', '(Portfolio low - portfolio high) - (Control low - control high)'],
 'stopping': 'Complete all eight new cases regardless of profit. No retries or replacements on creation uncertainty; retain every pending, failed, partial and completed case. Runtime failure stops new creation while existing jobs retain their outcomes. Original600-second policy budget remains. No mid-panel tuning.',
 'operations': {'workers': 8, 'maximumUnfinishedTeamWorlds': 8, 'sharedLock': 'runs/team-world-creation.lock', 'ranked': False, 'testFinal': False, 'final': False},
 'analysis': 'Four underlying seed blocks, sixteen policy outcomes including eight archived cases. Report all per-week ledger, reliability and operational outcomes plus descriptive paired-t/bootstrap intervals and exact qualification bounds. No multiplicity-adjusted promotion claim. Fixed full-week regimes capture within-week learning; post-level interventions cannot substitute.',
 'decision': 'Determine whether lower bundle payments explain most of the old candidate gain and whether the portfolio retains positive value at matched convention. Report interactions and contradictions. No automatic promotion from four blocks.',
}
protocol_path = ROOT / f'experiments/{NAME}-protocol.json'
protocol_path.write_text(json.dumps(protocol, indent=2) + '\n')
trials = []
for seed in seeds:
    for label, arm, convention in [('control-low', 'benchmark', 'low'), ('portfolio-high', 'payments', 'high')]:
        trials.append({'id': f'{NAME}-{label}-{seeds.index(seed)+1}', 'level': 8, 'seed': seed, 'settings': {**settings[arm], 'bundlePayment': convention}})
bundle_files = {str(p.relative_to(bundle)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(bundle.rglob('*')) if p.is_file()}
files = {str((bundle / name).relative_to(ROOT)): digest for name, digest in bundle_files.items()}
for source in ['research/runner/run.ts', 'research/runner/schedule.ts', 'research/runner/spread.ts', 'research/runner/deadline.ts', 'vendor/typescript/spread.ts', str(protocol_path.relative_to(ROOT))]:
    files[source] = hashlib.sha256((ROOT / source).read_bytes()).hexdigest()
plan = {'frozenAt': now.isoformat(), 'bundle': str(bundle.relative_to(ROOT)), 'files': files, 'bundleFiles': bundle_files, 'protocol': str(protocol_path.relative_to(ROOT)), 'protocolSha256': files[str(protocol_path.relative_to(ROOT))], 'pythonExecutable': old['pythonExecutable'], 'pythonVersions': old['pythonVersions'], 'attempts': f'experiments/{NAME}-attempts.jsonl', 'report': f'docs/{NAME}-runs.json', 'schedule': {'mode': 'practice', 'workers': 8, 'capacity': 8, 'createUntil': int((now+timedelta(minutes=45)).timestamp()*1000), 'mutateUntil': int((now+timedelta(minutes=60)).timestamp()*1000), 'trials': trials}, 'archivedPlan': 'experiments/level8-estimate-v1.json', 'archivedSeeds': seeds}
path.write_text(json.dumps(plan, indent=2) + '\n')
with tarfile.open(ROOT / f'experiments/{NAME}-source.tar.gz', 'w:gz') as archive:
    for name in bundle_files:
        data = (bundle / name).read_bytes()
        member = tarfile.TarInfo(name); member.size = len(data); member.mtime = 0
        archive.addfile(member, io.BytesIO(data))
print(json.dumps({'manifest': str(path), 'newWorlds': len(trials), 'reusedWorlds': 8, 'underlyingBlocks': 4}))
