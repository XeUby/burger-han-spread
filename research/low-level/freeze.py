import hashlib,json
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[2]
p=root/'experiments/plans/levels-first-option.json'
assert not p.exists()
prior=json.loads((root/'experiments/plans/levels-factorial.json').read_text())
base=json.loads((root/'experiments/final-config.json').read_text())
variants={'control':{**base,'firstOptionOnly':False,'openingCostAdmission':False},'first-option':{**base,'firstOptionOnly':True,'openingCostAdmission':False},'first-option-cost':{**base,'firstOptionOnly':True,'openingCostAdmission':True}}
bundle='research/low-level/bundle'
h=hashlib.sha256()
for f in sorted((root/bundle/'src').glob('*.ts')): h.update(f.name.encode());h.update(f.read_bytes())
trials=[{'level':level,'seed':seed,'settings':settings,'label':'levels-'+label} for seed in prior['seeds'] for level in [1,2,3] for label,settings in variants.items()]
plan={'frozenAt':datetime.now(timezone.utc).isoformat(),'bundle':bundle,'revision':h.hexdigest(),'role':'development only; never promotion evidence','seeds':prior['seeds'],'levels':[1,2,3],'variants':variants,'trials':trials,'attempts':'experiments/levels-first-option-attempts.jsonl','report':'docs/levels-first-option.json','mechanism':'Atlevels1-3 every quote wins the original first option. Restrict feasibility and economics to that option. Separately compare accepting when actual opening pay can fit the existing10%margin, keeping original driver payments and all original regional admission limits.','evidence':'In the failed abundant level1development probe149won requests did not offer their original first option, and34of those were late. This association does not estimate the causal effect of fixing the bug.','contrasts':{'first-option':'Semantic feasibility correction alone versus exact incumbent.','first-option-cost':'Semantic correction plus admission threshold based on actual opening pay versus correction alone. Driver pay itself is unchanged.'},'falsification':'Reject for promotion if any level lacks a mean paired gain of1500euros, any development week loses profit, any week is below92%on-time, or any order is undelivered or visit fails. These development gates only allow an independent validation proposal.','noInference':'Three seed blocks, not27independentweeks. Levels2and3 share base worlds. No inference about levels4-8. No post-hoc parameter rescue.','conformance':'The disabled control must reproduce existing level1 factorial control event histories on the same seeds; otherwise audit before interpreting contrasts.','independentValidation':'Freeze selected exact source/settings and fresh unique seeds before play under search-integrity.json. Do not spend remaining ranked attempts on this development evidence.','deadline':'No ranked actions after09:00 Helsinki; failure to finish sufficient validation beforehand leaves ranked attempts unused.'}
p.write_text(json.dumps(plan,indent=2)+'\n')
print(json.dumps({'trials':len(trials),'revision':h.hexdigest(),'uniqueSeeds':len(prior['seeds'])}))
