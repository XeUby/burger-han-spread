"""Serial V2 benchmark on five matched level-8 weeks. Requires team credentials."""
import argparse
import json
from pathlib import Path
from config import load_env
from v2_engine import V2Config,evaluate_scores
from v2_runner import practice

def main():
    load_env()
    from transport import ResilientClient
    p=argparse.ArgumentParser()
    p.add_argument('--seeds',nargs='+',required=True)
    p.add_argument('--price',type=float,default=V2Config.price_multiplier)
    p.add_argument('--fee',type=float,default=V2Config.fee_multiplier)
    p.add_argument('--max-open',type=int,default=V2Config.max_open)
    p.add_argument('--min-nearby',type=int,default=V2Config.min_nearby_drivers)
    args=p.parse_args()
    config=V2Config(price_multiplier=args.price,fee_multiplier=args.fee,max_open=args.max_open,min_nearby_drivers=args.min_nearby)
    records=[]
    output=Path('results-v2')/'benchmark.json'
    output.parent.mkdir(exist_ok=True)
    for seed in args.seeds:
        request=argparse.Namespace(seed=seed,level=8,board=False,resume=None)
        try: records.append(practice(ResilientClient(),request,config))
        except Exception as exc: records.append({'seed':seed,'error':f'{type(exc).__name__}: {exc}'})
        output.write_text(json.dumps(records,indent=2),encoding='utf-8')
    scores=[r['score'] for r in records if 'score' in r]
    result=evaluate_scores(scores)
    result['errors']=sum('error' in r for r in records)
    result['complete']=len(scores)==len(args.seeds)
    result['target_100k_reached']=result['target_100k_reached'] and result['complete'] and not result['errors']
    print(json.dumps(result,indent=2))
if __name__=='__main__': main()
