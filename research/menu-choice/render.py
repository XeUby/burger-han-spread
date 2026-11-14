import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = 'menu-choice-development-v1'
r = json.loads((ROOT / f'docs/{NAME}-results.json').read_text())
assert r['terminal'], 'Do not render an economic conclusion from an incomplete panel'
audit = json.loads((ROOT / f'docs/{NAME}-assignment-audit.json').read_text())
assert audit['completePanel']
operations = json.loads((ROOT / f'docs/{NAME}-operations.json').read_text())
assert {case['worldId'] for case in operations['cases']} == {row['worldId'] for row in r['records']}
assert all(case['status'] == 'completed' and case['official']['ended'] and case['official']['kind'] == 'practice' and case['official']['season'] is None for case in operations['cases'])
p = r['paired']
c, m = r['summary']['control'], r['summary']['menu']
lines = [
    '# Randomized menu-choice development results', '',
    f"Completed all {r['expected']} planned unranked worlds on eight fresh-at-freeze development seed pairs. No replacement or promotion.", '',
    f"Whole-week package effect: **€{p['meanEuros']:,.2f}/week**, descriptive paired-t 95% interval **[€{p['t95Euros'][0]:,.2f}, €{p['t95Euros'][1]:,.2f}]**; {p['wins']} positive pairs and {p['losses']} negative pairs. Whole-pair bootstrap interval [€{p['bootstrap95Euros'][0]:,.2f}, €{p['bootstrap95Euros'][1]:,.2f}].", '',
    'Retain the incumbent. The observed package does not establish a profit improvement; passing the choice-support gate permits model assessment only.', '',
    'This comparison includes bounded menu-price exploration and suppression of unsupported scalar demand updates for both assigned arms. It cannot isolate the weekly profit effect of the same-day premium alone.', '',
    '| Outcome | Preserved control | Menu exploration |', '|---|---:|---:|',
]
metrics = [
    ('Mean weekly profit', 'meanProfitEuros', 'money'), ('Qualified weeks', 'qualified', 'count'),
    ('Mean orders', 'meanOrders', 'number'), ('Aggregate on time', 'aggregateOnTime', 'percent'),
    ('Lowest weekly on time', 'minimumOnTime', 'percent'), ('Mean driver payments', 'meanDriverPaymentsEuros', 'money'),
    ('Mean late refunds', 'meanRefundsEuros', 'money'), ('Undelivered orders', 'undelivered', 'count'),
    ('Failed visits', 'failedVisits', 'count'), ('Fines, total', 'finesEuros', 'money'),
    ('Action errors', 'actionErrors', 'count'), ('Recoveries', 'recoveries', 'count'),
    ('Qualification one-sided 95% lower bound', 'qualificationLower95', 'percent'),
]
def display(x, kind):
    return f'€{x:,.2f}' if kind == 'money' else f'{x:.2%}' if kind == 'percent' else str(x) if kind == 'count' else f'{x:.2f}'
for label, key, kind in metrics: lines.append(f'| {label} | {display(c[key], kind)} | {display(m[key], kind)} |')
lines += ['', 'Qualification bounds assume independent weekly seeds. These eight development pairs cannot establish reliable qualification or leaderboard superiority.', '', '## Randomized choice outcomes', '', '| Assignment | Known outcomes | Same-day awards | Later awards | No purchase |', '|---|---:|---:|---:|---:|']
for arm in ['original', 'premium']:
    rows = [x for x in r['observations'] if x['arm'] == arm]
    values = [sum(x['outcome'] == outcome for x in rows) for outcome in ['same_day', 'later', 'no_purchase']]
    lines.append(f"| {arm} | {sum(x['outcome'] is not None for x in rows)} | {values[0]} | {values[1]} | {values[2]} |")
lines += ['', f"Unknown assignment outcomes: {r['unknownOutcomes']}. Support gate passed: {r['supportPassed']}. {r['decision']}", '', 'The primary contrasts below compare premium minus original per randomized eligible request, using probability weights within each week and equal week weights. They include no purchase and are not conditioned on winning. Interference through capacity and trust limits transport beyond this exploratory policy.', '', '| Outcome | Mean change, percentage points | Descriptive week-level 95% interval |', '|---|---:|---:|']
for outcome, effect in r.get('menuEffects', {}).items():
    lo, hi = effect['descriptivePairedT95PercentagePoints']
    lines.append(f"| {outcome} | {effect['meanDifferencePercentagePoints']:+.2f} | [{lo:+.2f}, {hi:+.2f}] |")
lines += ['', 'These prespecified inverse-probability contrasts need not sum to zero in this finite sample because realized assignment counts differ. The counts above are descriptive; no alternative estimator has replaced the frozen primary analysis. The three intervals are unadjusted development diagnostics, not simultaneous confirmatory claims.', '', '## Operational evidence', '', f"Independent audit checked {audit['assignmentsChecked']} assignments for deterministic allocation, menu preservation, exact same-day price change, eligibility, caps and matching transmitted/acknowledged actions. Official inventory verified all sixteen worlds ended and were unranked. Maximum concurrent study worlds: {operations['ownConcurrencyAudit']['maximumConcurrentStudyWorlds']}; including the retained interrupted private world, the own unfinished-world bound was {operations['ownConcurrencyAudit']['maximumOwnUnfinishedBound']}.", '', 'The full outcome report retains all ledgers, cancellations, action errors, runtime failures, individual world results and artifact hashes. Frozen source, protocol and journal remain in `experiments/menu-choice-development-v1*`. Reproduce with the report, assignment checker, official runner audit, concurrency audit and this renderer under `research/menu-choice/`.', '']
(ROOT / f'docs/{NAME}-results.md').write_text('\n'.join(lines))
