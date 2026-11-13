"""Paired-seed sweeps, at most two concurrent worlds by default."""
import argparse
import json
from argparse import Namespace
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from config import load_env

def main():
    load_env()
    from pricing import Policy
    from transport import ResilientClient
    from run import practice
    p=argparse.ArgumentParser()
    p.add_argument('--seeds',nargs='+',required=True)
    p.add_argument('--workers',type=int,choices=range(1,5),default=2)
    p.add_argument('--baseline',action='store_true')
    p.add_argument('--output',default='results/benchmark.json')
    args=p.parse_args()
    policy=Policy()
    def task(seed):
        opts=Namespace(seed=seed,level=8,board=False,resume=None,baseline=args.baseline)
        try:
            return practice(ResilientClient(),opts,policy)
        except Exception as error:
            return {'seed':seed,'error':str(error)}
    results=[]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for future in as_completed([pool.submit(task,s) for s in args.seeds]):
            results.append(future.result())
            Path(args.output).write_text(json.dumps(results,indent=2),encoding='utf-8')
    valid=[r for r in results if r.get('score',{}).get('ranked')]
    print(f'Ranked {len(valid)}/{len(results)}; errors {sum("error" in r for r in results)}',flush=True)

if __name__=='__main__': main()
