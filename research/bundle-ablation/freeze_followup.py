import copy
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = 'bundle-payment-followup-v1'
path = ROOT / f'experiments/{NAME}.json'
if path.exists():
    raise RuntimeError('Never overwrite a frozen follow-up')
original = json.loads((ROOT / 'experiments/bundle-payment-ablation-v1.json').read_text())
for file, digest in original['files'].items():
    assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest, file
now = datetime.now(timezone.utc)
protocol = {
    'frozenAt': now.isoformat(),
    'role': 'One bounded supplementary attempt to resolve the portfolio bundle-payment contrast, after the original four attempts failed on HTTP502.',
    'originalPanel': 'experiments/bundle-payment-ablation-v1.json',
    'originalOutcomes': 'docs/bundle-payment-ablation-v1-results.json',
    'interruptionRecord': 'docs/bundle-payment-ablation-v1-interruption.json',
    'seeds': original['archivedSeeds'],
    'selection': 'All four interrupted portfolio-high cases; none selected by profit. Familiar development seeds, not new independent weeks.',
    'policy': 'Exact original frozen bundle, settings, dependencies and 600-second budget. No recovery changes or economic tuning. Original source archive retained.',
    'stopping': 'Four new worlds only, at most eight unfinished team worlds. No replacements or automatic retries. Any interruption remains visible. This follow-up does not overwrite or complete the original attempt record.',
    'analysis': 'Show all original operational failures beside supplementary outcomes. Complete supplementary scores may support descriptive payment/architecture contrasts against exact archived arms on the same four development seeds, conditional on successful execution. Do not call the original factorial complete. No promotion or untouched validation.',
    'authorization': 'Unranked research only; no ranked submissions, finals, deletion or forks.',
}
protocol_path = ROOT / f'experiments/{NAME}-protocol.json'
protocol_path.write_text(json.dumps(protocol, indent=2) + '\n')
plan = copy.deepcopy(original)
plan.update(frozenAt=now.isoformat(), protocol=str(protocol_path.relative_to(ROOT)), protocolSha256=hashlib.sha256(protocol_path.read_bytes()).hexdigest(), attempts=f'experiments/{NAME}-attempts.jsonl', report=f'docs/{NAME}-runs.json', originalPanel='experiments/bundle-payment-ablation-v1.json', originalOutcomes='docs/bundle-payment-ablation-v1-results.json')
plan['files'][str(protocol_path.relative_to(ROOT))] = plan['protocolSha256']
plan['schedule'].update(workers=4, createUntil=int((now+timedelta(minutes=30)).timestamp()*1000), mutateUntil=int((now+timedelta(minutes=45)).timestamp()*1000))
plan['schedule']['trials'] = [dict(t, id=t['id'].replace('bundle-payment-ablation-v1', NAME)) for t in original['schedule']['trials'] if '-portfolio-high-' in t['id']]
assert len(plan['schedule']['trials']) == 4
path.write_text(json.dumps(plan, indent=2) + '\n')
print(path.relative_to(ROOT))
