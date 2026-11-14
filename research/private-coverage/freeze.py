import hashlib
import io
import json
import secrets
import shutil
import subprocess
import tarfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = 'private-coverage-development-v2'
bundle = ROOT / f'runs/frozen/{NAME}'
manifest_path = ROOT / f'experiments/{NAME}.json'
assert not bundle.exists() and not manifest_path.exists(), 'Never overwrite a study'
read = lambda path: json.loads((ROOT / path).read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
old = read('experiments/bundle-payment-ablation-v1.json')
for file, expected in old['bundleFiles'].items():
    assert sha(ROOT / old['bundle'] / file) == expected
estimate = read('experiments/level8-estimate-v1.json')
settings = next(t['settings'] for t in estimate['trials'] if t['label'].endswith('-payments'))
known = {json.loads(p.read_text()).get('seed') for p in (ROOT / 'runs').glob('*.meta.json')}
previous = read('experiments/private-coverage-development-v1.json')
seeds = list(dict.fromkeys(t['seed'] for t in previous['schedule']['trials']))
assignment_seeds = {t['seed']: t['settings']['randomSeed'] for t in previous['schedule']['trials'] if t['settings']['privateCoverage']}
assert len(set(seeds)) == 8 and not set(seeds) & known
now = datetime.now(timezone.utc)
for arm in ['control', 'coverage']:
    source = estimate['bundle'] if arm == 'control' else old['bundle']
    shutil.copytree(ROOT / source, bundle / arm, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))

def translate(file):
    return (ROOT / file).read_text().replace('../../src/', './').replace('../../vendor/', '../vendor/').replace('../../experiments/booking-response-prior.json', './booking-prior.json').replace('../../experiments/portfolio-prior.json', './portfolio-prior.json').replace('../value/policy.ts', './mechanisms.ts').replace('../portfolio/policy.ts', './portfolio.ts').replace('../graph/candidates.ts', './graph/candidates.ts')

(bundle / 'coverage/src/portfolio.ts').write_text(translate('research/portfolio/policy.ts'))
(bundle / 'coverage/src/policy.ts').write_text(translate('research/private-coverage/policy.ts'))
(bundle / 'coverage/src/graph').mkdir()
for name in ['candidates.ts', 'constraints.ts']:
    (bundle / f'coverage/src/graph/{name}').write_text((ROOT / f'research/graph/{name}').read_text().replace('../../src/', '../'))
(bundle / 'src').mkdir()
(bundle / 'src/run.ts').write_text("""import { practice as control } from '../control/src/run.ts'
import { practice as coverage } from '../coverage/src/run.ts'
export async function practice(client: Parameters<typeof control>[0], options: Parameters<typeof control>[1] & {settings: Record<string, unknown>}) {
  const {privateCoverage, ...settings} = options.settings
  if (typeof privateCoverage !== 'boolean' || options.board) throw new Error('Explicit unranked arm required')
  return privateCoverage ? coverage(client as unknown as Parameters<typeof coverage>[0], {...options, settings: {...settings, privateCoverage: true}}) : control(client, {...options, settings})
}
""")
shutil.copy2(bundle / 'control/tsconfig.json', bundle / 'tsconfig.json')
control_files = estimate['files']
assert control_files
for file, expected in control_files.items():
    assert sha(bundle / 'control' / file) == expected
arms = {}
for arm in ['control', 'coverage']:
    revision = hashlib.sha256()
    for file in sorted((bundle / arm / 'src').glob('*.ts')):
        revision.update(file.name.encode()); revision.update(file.read_bytes())
    defaults = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', 'const m=await import(process.argv[1]);console.log(JSON.stringify(m.defaults))', (bundle / arm / 'src/policy.ts').as_uri()], text=True))
    arms[arm] = {'revision': revision.hexdigest(), 'defaults': defaults}
protocol = {'frozenAt': now.isoformat(), 'design': 'docs/private-coverage-study-design.md', 'role': 'Eight fresh paired development weeks, sixteen unranked worlds; bounded randomized private-work coverage, no promotion', 'seeds': seeds, 'seedRole': 'All seeds are reserved for development now and excluded from untouched validation.', 'assignment': 'SHA256(private-coverage:randomSeed:requestId) low bit gives equal quote/decline assignment conditional on logged eligibility. Per-week randomSeed is frozen in each coverage trial.', 'stopping': 'Exactly sixteen worlds; no replacement or tuning. Runtime failure stops creation; private visit failure stops only further exploration within that week while existing obligations continue.', 'operations': {'workers': 4, 'capacity': 8, 'mode': 'practice', 'sharedLock': 'runs/team-world-creation.lock'}, 'authorization': 'Unranked only; no ranking, finals, forks or deletion.'}
protocol_path = ROOT / f'experiments/{NAME}-protocol.json'
protocol_path.write_text(json.dumps(protocol, indent=2) + '\n')
trials = []
for i, seed in enumerate(seeds, 1):
    for arm in (['control', 'coverage'] if i % 2 else ['coverage', 'control']):
        config = {**settings, 'privateCoverage': arm == 'coverage'}
        if arm == 'coverage': config['randomSeed'] = assignment_seeds[seed]
        trials.append({'id': f'{NAME}-{arm}-{i}', 'seed': seed, 'level': 8, 'settings': config})
bundle_files = {str(p.relative_to(bundle)): sha(p) for p in sorted(bundle.rglob('*')) if p.is_file()}
files = {str((bundle / file).relative_to(ROOT)): digest for file, digest in bundle_files.items()}
for file in ['research/runner/run.ts', 'research/runner/schedule.ts', 'research/runner/spread.ts', 'research/runner/deadline.ts', 'vendor/typescript/spread.ts', 'docs/private-coverage-study-design.md', 'docs/private-coverage-screen.json', str(protocol_path.relative_to(ROOT))]: files[file] = sha(ROOT / file)
plan = {'frozenAt': now.isoformat(), 'bundle': str(bundle.relative_to(ROOT)), 'files': files, 'bundleFiles': bundle_files, 'arms': arms, 'protocol': str(protocol_path.relative_to(ROOT)), 'pythonExecutable': old['pythonExecutable'], 'pythonVersions': old['pythonVersions'], 'attempts': f'experiments/{NAME}-attempts.jsonl', 'report': f'docs/{NAME}-runs.json', 'schedule': {'mode': 'practice', 'workers': 4, 'capacity': 8, 'createUntil': int((now + timedelta(minutes=90)).timestamp()*1000), 'mutateUntil': int((now + timedelta(minutes=100)).timestamp()*1000), 'trials': trials}}
manifest_path.write_text(json.dumps(plan, indent=2) + '\n')
with tarfile.open(ROOT / f'experiments/{NAME}-source.tar.gz', 'w:gz') as archive:
    for name in bundle_files:
        data = (bundle / name).read_bytes(); member = tarfile.TarInfo(name); member.size = len(data); member.mtime = 0; archive.addfile(member, io.BytesIO(data))
print(json.dumps({'manifest': str(manifest_path.relative_to(ROOT)), 'newWorlds': 16, 'freshDevelopmentSeeds': 8}))
