import json
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = {
    'baseline': ['wc0e4705e1d3ee56724b4', 'w3ea5ca2f5b8e9b30987b', 'w7ae145e3ea74526ee4bf', 'w1937eaf885387948933b', 'w4b0c114dfc99d7eb4329'],
    'floor-only-original-notes': ['w02a4c43da3febb915ee0', 'wcb25f567eb387833fa43'],
    'expanded-notes': ['wa91ce8c1daea7f4c9cc6', 'w50fa55273a0979412d8f'],
    'adaptive': ['wb081cd387816513c47a1', 'w425c685b27f98760e324'],
    'early-offers': ['w3591ff0a651c0c537534', 'wb3d622258c94129d2be0'],
    'lower-fee': ['w424199fbdd008fcbd84e', 'wf3fc8555ff7371f60d31'],
    'longer-lanes': ['w3fca9ffa55f37ab764d3', 'w1a6d8e9945cd53876178'],
    'adaptive-queue': ['w407935d7c04a30632ccf', 'w991dc1f588362b881fd3'],
    'adaptive-long-queue': ['w7972495096c0af8b9de8', 'wb865ff1c21970cb0fef2', 'wd415561aaf36894b76de', 'wbcb207675e32e9aff20f', 'wb915d7ae809d2fec7776'],
    'adaptive-long-queue-slope8': ['w1bffb098519f0532dddf', 'w5cef648043cabe2ee04d'],
    'pickup-slack': ['w9afefc9b7af4685ebbe7', 'w1161968626d8d95ecec7'],
}
DESCRIPTIONS = {
    'baseline': 'Frozen original note parser and fixed-price dispatcher; price=1.42, fee=1.05, margin=0.28, fixed floor addition=1000 cents, maxKm=400, local daily capacity=0.18, minDrivers=12.',
    'floor-only-original-notes': 'Original note parser and admission/fee policy; quote margin floor 0.28→0.10 and fixed floor addition €10→€0.',
    'expanded-notes': 'Expanded safe harmless-note/equipment phrases; otherwise the baseline economic settings.',
    'adaptive': 'Expanded notes plus online demand optimization, margin floor=0.10, fixed addition=0, trustStep=0.01. These changes form one coupled treatment.',
    'early-offers': 'Expanded notes plus earlier direct offers and activity/location-aware targeting; baseline price/fee settings.',
    'lower-fee': 'Expanded notes and fee factor 1.05→0.95. Because quote floors derive from this fee, this changes both posted fees and quoted prices.',
    'longer-lanes': 'Expanded notes and maxKm 400→550, preserving supply and capacity gates.',
    'adaptive-queue': 'Adaptive treatment plus same-day local queue ceiling four, preserving feasible later quote options.',
    'adaptive-long-queue': 'Adaptive treatment plus same-day queue ceiling four and maxKm=550; demandSlope=14, early offers and pickup slack disabled. Selected candidate.',
    'adaptive-long-queue-slope8': 'Selected candidate with logistic demandSlope=8 instead of 14.',
    'pickup-slack': 'Selected candidate plus explicit conservative pickup cutoffs (safetySlack=true).',
}
def read(path):
    return json.load(open(path))

records=[]
for variant, worlds in MANIFEST.items():
    for world in worlds:
        meta=read(ROOT/f'runs/{world}.meta.json')
        if meta['seed'].startswith('formal-unseen-'):
            raise RuntimeError('A validation world entered the development allowlist')
        score_path=ROOT/f'runs/{world}.score.json'
        snapshot_path=ROOT/f'runs/{world}.snapshot.json'
        complete=False
        if score_path.exists() and snapshot_path.exists():
            snapshot=read(snapshot_path)
            complete=snapshot['now']>=snapshot['endsAt']
        record=dict(variant=variant,**meta,status='complete' if complete else 'pending',sourceArchiveAvailable=(ROOT/f'runs/sources/{meta["revision"]}').is_dir(),revisionMeaning='Recorded disk-source snapshot hash at world creation; not a certified runtime digest for development batches.')
        if complete:
            score=read(score_path)
            record['score']=score
            record['lateOrders']=sum(o['status']!='cancelled' and any(t is None or t>o['deadline'] for t in o['deliveredAt']) for o in snapshot['orders'])
            assert record['lateOrders']==round(score['wonOrders']*(1-score['onTimeShare']))
        records.append(record)

def select(variant, seed):
    return next(r for r in records if r['variant']==variant and r['seed']==seed)

def comparison(candidate, baseline):
    if candidate['status']!='complete' or baseline['status']!='complete':
        return dict(seed=candidate['seed'],candidateWorldId=candidate['worldId'],baselineWorldId=baseline['worldId'],status='pending')
    c,b=candidate['score'],baseline['score']
    return dict(seed=candidate['seed'],candidateWorldId=candidate['worldId'],baselineWorldId=baseline['worldId'],status='complete',baselineMarginCents=b['marginCents'],candidateMarginCents=c['marginCents'],differenceCents=c['marginCents']-b['marginCents'],relativeChange=c['marginCents']/b['marginCents']-1,baselineOnTimeShare=b['onTimeShare'],candidateOnTimeShare=c['onTimeShare'],baselineRanked=b['ranked'],candidateRanked=c['ranked'],baselineWon=b['wonOrders'],candidateWon=c['wonOrders'])

paired={variant:[comparison(select(variant,seed),select('baseline',seed)) for seed in ['holdout-2','holdout-3']] for variant in MANIFEST if variant!='baseline'}
confirmation=[comparison(select('adaptive-long-queue',seed),select('baseline',seed)) for seed in ['spread-1','validate-1','holdout-2','holdout-3','holdout-4']]
finished=[r for r in records if r['status']=='complete']
confirmed=[r for r in confirmation if r['status']=='complete']
summary=dict(recordedRuns=len(records),completedRuns=len(finished),pendingRuns=len(records)-len(finished),rankedRuns=sum(r['score']['ranked'] for r in finished),newRunsThisTurn=len(records)-2,reusedBaselineRuns=2,confirmationSeeds=len(confirmed),baselineMeanMarginCents=mean(r['baselineMarginCents'] for r in confirmed),candidateMeanMarginCents=mean(r['candidateMarginCents'] for r in confirmed),meanPairedGainCents=mean(r['differenceCents'] for r in confirmed),aggregateRelativeGain=sum(r['candidateMarginCents'] for r in confirmed)/sum(r['baselineMarginCents'] for r in confirmed)-1,positivePairedGains=sum(r['differenceCents']>0 for r in confirmed),candidateWorstOnTimeShare=min(r['candidateOnTimeShare'] for r in confirmed),baselineWorstOnTimeShare=min(r['baselineOnTimeShare'] for r in confirmed),candidateQualified=sum(r['candidateRanked'] for r in confirmed),baselineQualified=sum(r['baselineRanked'] for r in confirmed))
report=dict(scope='Development experiments only. No formal-unseen-* outcome file is read by this script.',method='Fixed world allowlist; each score verified against a terminal snapshot. Whole weeks are the comparison unit. holdout-2/3 names predate this task and these seeds are development seeds, not held-out validation.',sourceProvenance='Node batch processes load modules at process start, whereas disk source snapshots are taken at each world creation. Source was edited while development batches ran. A later trial may therefore record newer disk files than its loaded modules, notably pickup-slack on holdout-3. These IDs identify disk snapshots, not certified runtime digests. The original baseline archive remained unchanged. The later unseen-validation process started after source freeze and is outside this report.',descriptions=DESCRIPTIONS,summary=summary,pairedScreen=paired,fiveSeedConfirmation=confirmation,records=records,limitations=['Sequentially selected development comparisons do not establish unbiased generalization or global optimality.','Five-seed confirmation uses the same candidate settings but several recorded disk-source snapshots; development runtime provenance is not fully certified.','Lower-fee changes the quoted floor as well as fulfillment fees. Adaptive combines online pricing, a lower floor and a higher trust multiplier.','Early offers also alter driver targeting. Expanded-note gains interact with congestion, trust and future driver choices.','Two original baseline worlds are reused; 26 worlds were newly run in this turn when every listed experiment completes.','No unseen validation result is included.'])
json.dump(report,open(ROOT/'docs/experiments.json','w'),indent=2)

def eur(cents): return f'€{cents/100:,.2f}'
def result(r):
    if r['status']!='complete':return 'Pending'
    return f'{eur(r["score"]["marginCents"])} / {r["score"]["onTimeShare"]:.2%}'

lines=['# Development experiments', '', 'The selected policy combines adaptive prices, a same-day queue ceiling of four and a 550 km lane limit. On the five development seeds it improves margin in every paired comparison. The unseen validation results are deliberately excluded from this report.', '', '## Method and scope', '', 'These are deterministic level 8 practice worlds. Comparisons use the same seeds, treating complete weeks as the experimental unit. The names `holdout-2` and `holdout-3` are historical; both were repeatedly used for development and are not unseen validation. Policies were selected sequentially, so the screening results are descriptive and subject to selection bias.', '', f'The manifest contains {summary["recordedRuns"]} runs: {summary["newRunsThisTurn"]} new experiments and two reused original-baseline worlds. At generation, {summary["completedRuns"]} were complete and {summary["pendingRuns"]} pending; {summary["rankedRuns"]}/{summary["completedRuns"]} completed runs met the game’s 90% delivery minimum. Each score was checked against a terminal snapshot and its late-order count.', '', '## Paired screen', '', 'Cells show net margin / on-time share. All comparisons use the original baseline below; treatment descriptions identify the appropriate narrower ablation.', '', '| Policy | holdout-2 | holdout-3 | Mean paired margin change vs original |', '|---|---:|---:|---:|']
for variant in MANIFEST:
    rs=[select(variant,s) for s in ['holdout-2','holdout-3']]
    deltas=[r['score']['marginCents']-select('baseline',r['seed'])['score']['marginCents'] for r in rs if r['status']=='complete']
    delta='—' if variant=='baseline' else eur(mean(deltas)) + (' (one completed seed)' if len(deltas)==1 else '') if deltas else 'Pending'
    lines.append(f'| {variant} | {result(rs[0])} | {result(rs[1])} | {delta} |')
lines += ['', '## What each experiment changes', '']
for variant in MANIFEST:
    lines.append(f'- **{variant}:** {DESCRIPTIONS[variant]}')
lines += ['', 'Lower-fee is a coupled price-and-cost experiment because the posted fee feeds the quote floor. Adaptive pricing is also a coupled treatment: online demand learning, the lower quote floor and a trust step of 1% all change together. Neither is a single-switch causal estimate of its label alone. Comparing expanded notes with the original baseline isolates the note-coverage change more closely, while demand and driver behavior still respond endogenously.', '', 'The floor-only change improves the low-margin week but reduces margin and reliability on the difficult week. Broader notes alone show the same tradeoff. Early offers give mixed small margin changes relative to expanded notes. Adding the queue ceiling to the adaptive treatment improves both paired margins and raises difficult-week on-time delivery from 94.14% to 96.55%; extending that combination to 550 km adds profit on both seeds. The slope-8 sensitivity test raises the two-seed mean by €110.58 relative to slope 14 but changes sign across seeds (+€560.67, −€339.51). Only the slope-14 settings received the five-seed confirmation below; the two-seed screen does not establish either slope as globally best.', '', '## Five-seed confirmation of the selected settings', '', '| Seed | Baseline margin | Selected margin | Gain | Baseline on-time | Selected on-time |', '|---|---:|---:|---:|---:|---:|']
for r in confirmation:
    if r['status']=='complete':lines.append(f'| {r["seed"]} | {eur(r["baselineMarginCents"])} | {eur(r["candidateMarginCents"])} | {eur(r["differenceCents"])} | {r["baselineOnTimeShare"]:.2%} | {r["candidateOnTimeShare"]:.2%} |')
    else:lines.append(f'| {r["seed"]} | Pending | Pending | — | — | — |')
lines += ['',f'Across these five development seeds, mean margin changes from **{eur(summary["baselineMeanMarginCents"])} to {eur(summary["candidateMeanMarginCents"])}**, a paired gain of **{eur(summary["meanPairedGainCents"])} ({summary["aggregateRelativeGain"]:.1%})**. The candidate qualifies on {summary["candidateQualified"]}/{summary["confirmationSeeds"]} and has a worst observed on-time share of {summary["candidateWorstOnTimeShare"]:.2%}. This is confirmation across development seeds, not an estimate from unseen worlds.', '', 'The selected setting vector is `adaptive=true`, `margin=0.10`, `priceFloor=0`, `trustStep=0.01`, `sameDayBacklog=4`, `maxKm=550`, `demandSlope=14`, `fee=1.05`, `capacity=0.18`, `minDrivers=12`, `backlog=0.04`, with early offers and pickup slack disabled. In the earliest selected runs, slope 14 and disabled pickup slack were code defaults rather than explicit metadata fields.', '', '## Source provenance', '', report['sourceProvenance'], '', 'The five selected runs must not be described as five validations of the final frozen source. Their complete configurations and recorded disk snapshot IDs are preserved below and in [experiments.json](experiments.json).', '', '## Run manifest', '', 'Full hashes identify the disk snapshots recorded in launch metadata. For newer runs, those files are archived under `runs/sources/<revision>/`; availability is recorded in the JSON. The original baseline source is also frozen in `experiments/baseline/`.', '', '| Variant | Seed | World ID | Status | Recorded disk-source SHA-256 |', '|---|---|---|---|---|']
for r in records:lines.append(f'| {r["variant"]} | {r["seed"]} | `{r["worldId"]}` | {r["status"]} | `{r["revision"]}` |')
lines += ['', '## Reproduction and limits', '', 'The report reads an explicit allowlist of development worlds. It never discovers or reads unseen score files. Rebuild it from the saved development files:', '', '```bash', 'python3 analysis/summarize_experiments.py', '```', '', 'The complete settings, raw score fields, late-order counts, source snapshot availability, paired differences and qualification results are in [experiments.json](experiments.json). Saved metadata and files make the reported scores auditable; the development batch provenance limitation means they do not always certify an exact runtime replay. Rerunning an old configuration against the current source is also not an exact reproduction.', '', 'No observed practice result proves global optimality, guarantees the secret final, or estimates the probability of qualification with high precision. The whole-week samples are small, and optimizing repeatedly on these seeds introduces selection bias. Unseen validation must remain separate.']
(ROOT/'docs/experiments.md').write_text('\n'.join(lines)+'\n')
print(json.dumps(summary,indent=2))
for variant in MANIFEST:print(variant,*[result(select(variant,s)) for s in ['holdout-2','holdout-3']])
