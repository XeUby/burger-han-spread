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
NAME = 'menu-choice-development-v1'
bundle = ROOT / f'runs/frozen/{NAME}'
manifest = ROOT / f'experiments/{NAME}.json'
assert not bundle.exists() and not manifest.exists(), 'Never overwrite a freeze'
read = lambda p: json.loads((ROOT / p).read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
estimate = read('experiments/level8-estimate-v1.json')
old = read('experiments/bundle-payment-ablation-v1.json')
for name, expected in estimate['files'].items(): assert sha(ROOT / estimate['bundle'] / name) == expected
settings = next(t['settings'] for t in estimate['trials'] if t['label'].endswith('-payments'))
existing = '\n'.join(p.read_text() for p in (ROOT / 'experiments').glob('*.json'))
seeds = [f'{NAME}-{secrets.token_hex(12)}' for _ in range(8)]
assert len(set(seeds)) == 8 and all(seed not in existing for seed in seeds)
now = datetime.now(timezone.utc)
for arm in ['control', 'menu']:
    shutil.copytree(ROOT / estimate['bundle'], bundle / arm, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    for name in ['bridge.ts', 'solver.py']: shutil.copy2(ROOT / f'research/portfolio/{name}', bundle / arm / 'src' / name)
for name, expected in estimate['files'].items():
    if name not in ['src/bridge.ts', 'src/solver.py']: assert sha(bundle / 'control' / name) == expected
(bundle / 'menu/src/policy.ts').rename(bundle / 'menu/src/portfolio.ts')
source = (ROOT / 'research/menu-choice/policy.ts').read_text().replace('../portfolio/policy.ts', './portfolio.ts').replace('../portfolio/bridge.ts', './bridge.ts').replace('../../vendor/', '../vendor/')
(bundle / 'menu/src/policy.ts').write_text(source)
(bundle / 'src').mkdir()
(bundle / 'src/run.ts').write_text("""import { practice as control } from '../control/src/run.ts'
import { practice as menu } from '../menu/src/run.ts'
export async function practice(client: Parameters<typeof control>[0], options: Parameters<typeof control>[1] & {settings: Record<string, unknown>}) {
  const {menuChoice, ...settings} = options.settings
  if (typeof menuChoice !== 'boolean' || options.board) throw new Error('Explicit unranked menu-study arm required')
  return menuChoice ? menu(client as unknown as Parameters<typeof menu>[0], {...options, settings: {...settings, menuChoice: true}}) : control(client, {...options, settings})
}
""")
shutil.copy2(bundle / 'control/tsconfig.json', bundle / 'tsconfig.json')
subprocess.run(['npx', 'tsc', '--noEmit', '-p', str(bundle / 'tsconfig.json')], cwd=ROOT, check=True)
arms = {}
for arm in ['control', 'menu']:
    revision = hashlib.sha256()
    for p in sorted((bundle / arm / 'src').glob('*.ts')):
        revision.update(p.name.encode()); revision.update(p.read_bytes())
    defaults = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', 'const m=await import(process.argv[1]);console.log(JSON.stringify(m.defaults))', (bundle / arm / 'src/policy.ts').as_uri()], text=True))
    arms[arm] = {'revision': revision.hexdigest(), 'defaults': defaults}
protocol = {'frozenAt': now.isoformat(), 'design': 'docs/menu-choice-study-design.md', 'role': 'Eight fresh paired development seeds, sixteen unranked worlds; randomized menu-choice evidence, no promotion', 'seeds': seeds, 'seedRole': 'Reserved development now; excluded from untouched validation', 'assignment': 'SHA256(menu-choice:randomSeed:requestId) low bit, independently seeded per exploratory week; original versus 10% same-day premium with probability 1/2 each', 'stopping': 'Fixed panel, no replacements or tuning. Runtime failure stops new creation and preserves active outcomes.', 'operations': {'workers': 3, 'capacity': 8, 'mode': 'practice', 'sharedLock': 'runs/team-world-creation.lock', 'existingOwnUnfinished': ['wf488bd0523f1119e8cd7']}, 'controlChange': 'Only bridge readiness handshake and solver ready message; all other original benchmark files hash-identical', 'authorization': 'Unranked only; no rankings, finals, forks or deletion.'}
protocol_path = ROOT / f'experiments/{NAME}-protocol.json'
protocol_path.write_text(json.dumps(protocol, indent=2) + '\n')
trials = []
for i, seed in enumerate(seeds, 1):
    random_seed = secrets.randbits(32)
    for arm in (['control', 'menu'] if i % 2 else ['menu', 'control']):
        config = {**settings, 'menuChoice': arm == 'menu'}
        if arm == 'menu': config['randomSeed'] = random_seed
        trials.append({'id': f'{NAME}-{arm}-{i}', 'seed': seed, 'level': 8, 'settings': config})
bundle_files = {str(p.relative_to(bundle)): sha(p) for p in sorted(bundle.rglob('*')) if p.is_file()}
files = {str((bundle / p).relative_to(ROOT)): digest for p, digest in bundle_files.items()}
for p in ['research/runner/run.ts', 'research/runner/schedule.ts', 'research/runner/spread.ts', 'research/runner/deadline.ts', 'vendor/typescript/spread.ts', 'research/menu-choice/policy.ts', 'research/menu-choice/report.py', 'research/value/report.py', 'research/menu-choice/freeze.py', 'docs/menu-choice-study-design.md', 'docs/menu-choice-screen.json', str(protocol_path.relative_to(ROOT))]: files[p] = sha(ROOT / p)
plan = {'frozenAt': now.isoformat(), 'bundle': str(bundle.relative_to(ROOT)), 'files': files, 'bundleFiles': bundle_files, 'arms': arms, 'protocol': str(protocol_path.relative_to(ROOT)), 'pythonExecutable': old['pythonExecutable'], 'pythonVersions': old['pythonVersions'], 'attempts': f'experiments/{NAME}-attempts.jsonl', 'report': f'docs/{NAME}-runs.json', 'schedule': {'mode': 'practice', 'workers': 3, 'capacity': 8, 'createUntil': int((now + timedelta(minutes=90)).timestamp()*1000), 'mutateUntil': int((now + timedelta(minutes=100)).timestamp()*1000), 'trials': trials}}
manifest.write_text(json.dumps(plan, indent=2) + '\n')
with tarfile.open(ROOT / f'experiments/{NAME}-source.tar.gz', 'w:gz') as archive:
    for name in bundle_files:
        data = (bundle / name).read_bytes(); member = tarfile.TarInfo(name); member.size = len(data); member.mtime = 0; archive.addfile(member, io.BytesIO(data))
print(json.dumps({'manifest': str(manifest.relative_to(ROOT)), 'worlds': 16, 'freshSeeds': 8, 'newWorkers': 3}))
