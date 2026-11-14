"""Separate V2 runner using the official Spread SDK and inherited dispatch lifecycle."""
import argparse
import json
import time
from pathlib import Path
from config import load_env
from v2_engine import V2Config, quote_v2, fee_schedule_v2

def make_desk():
    from strategy import Desk as BaseDesk
    class V2Desk(BaseDesk):
        def __init__(self,world,level,now,config=None):
            super().__init__(world,level,now)
            self.v2_config=config or V2Config()
        def quote(self,request):
            self.requests[request['id']]=request
            prices=quote_v2(request,self.now,self.roads,self.drivers,self.orders,self.v2_config)
            if self.level<=3 and (not prices or max(prices.values())>=100_000_000): return
            if prices: self.outbox.append({'type':'quote','requestId':request['id'],'prices':prices})
        def fees_for(self,order,cars):
            request=self.requests[order['id']]
            return fee_schedule_v2(self.now,request['referenceFeeCents'],cars,len(order['legs']),
                                   order['id'] in self.urgent,self.level,self.v2_config)
    return V2Desk

def practice(client,args,config):
    from spread.client import Unreachable
    from spread.starter import WAKE_ON, DAY, report
    Desk=make_desk()
    world=client.world(args.resume) if args.resume else client.create(level=args.level,seed=args.seed,board=args.board)
    outdir=Path('results-v2')/world.id
    outdir.mkdir(parents=True,exist_ok=True)
    snap=world.snapshot()
    desk=Desk(world,args.level,snap['now'],config)
    last_seq=-1
    if args.resume:
        history=world.events()
        desk.rejoin(snap,history)
        last_seq=history[-1]['seq'] if history else -1
    started=time.monotonic()
    with (outdir/'events.jsonl').open('a' if args.resume else 'w',encoding='utf-8') as log:
        while desk.now<snap['endsAt']:
            day=desk.now//DAY
            actions,desk.outbox=desk.outbox,[]
            try:
                step=world.advance(until=WAKE_ON,max=min(snap['endsAt'],(day+1)*DAY),actions=actions)
            except Unreachable:
                print('V2 interrupted; reconstructing from server state.',flush=True)
                for attempt in range(12):
                    time.sleep(5)
                    try:
                        history=world.events()
                        snap=world.snapshot()
                        desk=Desk(world,args.level,snap['now'],config)
                        desk.rejoin(snap,history)
                        for ev in history:
                            if ev['seq']>last_seq: log.write(json.dumps(ev,ensure_ascii=False)+'\n')
                        last_seq=history[-1]['seq'] if history else -1
                        break
                    except Unreachable:
                        if attempt==11: raise
                continue
            desk.read_results(actions,step.get('results',[]))
            desk.now=step['now']
            for ev in step['events']:
                if ev['seq']<=last_seq: continue
                last_seq=ev['seq']
                log.write(json.dumps(ev,ensure_ascii=False)+'\n')
                desk.handle(ev)
            if desk.now//DAY>day: report(f'Day {day+1}',world.score())
    score=world.score()
    summary={'world_id':world.id,'seed':args.seed,'level':args.level,
             'config':vars(config).copy(),'score':score,
             'elapsed_seconds':round(time.monotonic()-started,2),
             'refused_actions':dict(desk.failures)}
    (outdir/'run.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
    if not args.board:
        try: (outdir/'reveal.json').write_text(json.dumps(world.reveal(),ensure_ascii=False),encoding='utf-8')
        except Unreachable: print('Reveal unavailable; score saved.',flush=True)
    print(json.dumps(summary,indent=2),flush=True)
    return summary

def final(client,config):
    from spread.client import Unreachable
    from spread.starter import next_final, report
    Desk=make_desk()
    world=None
    while True:
        try:
            if world is None:
                world=next_final(client)
                print(f'V2 live world: {world.id}',flush=True)
            history=world.events()
            snap=world.snapshot()
            if snap['now']>=snap['endsAt']:
                report('V2 final',world.score())
                return
            desk=Desk(world,8,snap['now'],config)
            desk.rejoin(snap,history)
            desk.send()
            last_seq=history[-1]['seq'] if history else -1
            outdir=Path('results-v2')/('final-'+world.id)
            outdir.mkdir(parents=True,exist_ok=True)
            with (outdir/'events.jsonl').open('a',encoding='utf-8',buffering=1) as log:
                for event in world.stream(after=last_seq,idle=1.0):
                    if event is None: desk.now=client.final()['now']
                    elif event['seq']>last_seq:
                        last_seq=event['seq']
                        desk.now=max(desk.now,event['at'])
                        log.write(json.dumps(event,ensure_ascii=False)+'\n')
                        if event['kind']!='price_request' or event['request']['respondBy']>desk.now:
                            desk.handle(event)
                    desk.send()
                    if desk.now>=snap['endsAt']:
                        score=world.score()
                        (outdir/'score.json').write_text(json.dumps(score,indent=2),encoding='utf-8')
                        report('V2 final',score)
                        return
        except Unreachable as exc:
            print(f'V2 connection lost: {exc}; retrying in 5s',flush=True)
            time.sleep(5)

def main():
    load_env()
    from transport import ResilientClient
    p=argparse.ArgumentParser(description='Burger Han V2 independent experimental runner')
    p.add_argument('--seed',default=None)
    p.add_argument('--level',type=int,choices=range(1,9),default=8)
    p.add_argument('--board',action='store_true')
    p.add_argument('--final',action='store_true')
    p.add_argument('--resume',default=None)
    p.add_argument('--price',type=float,default=V2Config.price_multiplier)
    p.add_argument('--fee',type=float,default=V2Config.fee_multiplier)
    p.add_argument('--max-drive',type=int,default=V2Config.max_drive_minutes)
    p.add_argument('--max-open',type=int,default=V2Config.max_open)
    p.add_argument('--min-nearby',type=int,default=V2Config.min_nearby_drivers)
    args=p.parse_args()
    if sum([bool(args.final),bool(args.board),bool(args.resume)])>1:
        p.error('Choose at most one of --final, --board, and --resume')
    if args.board and args.seed: p.error('--board cannot be combined with --seed')
    config=V2Config(price_multiplier=args.price,fee_multiplier=args.fee,
                    max_drive_minutes=args.max_drive,max_open=args.max_open,
                    min_nearby_drivers=args.min_nearby)
    client=ResilientClient()
    if args.final: final(client,config)
    else: practice(client,args,config)

if __name__=='__main__': main()
