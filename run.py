"""Reproducible experiments and live final entry point. No LLM on the critical path."""
import argparse
import json
import time
from pathlib import Path
from config import load_env

def practice(client, args, policy):
    from spread.client import Unreachable
    from spread.starter import Desk as StarterDesk, WAKE_ON, DAY, report
    from strategy import Desk
    world = client.world(args.resume) if args.resume else client.create(level=args.level, seed=args.seed, board=args.board)
    output = Path('results') / world.id
    output.mkdir(parents=True, exist_ok=True)
    meta = {'world_id': world.id, 'seed': args.seed, 'level': args.level,
            'baseline': args.baseline, 'policy': policy.to_dict()}
    (output / 'run.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
    print(f'World {world.id}; artifacts: {output}', flush=True)
    snap = world.snapshot()
    desk = StarterDesk(world,args.level,snap['now']) if args.baseline else Desk(world,args.level,snap['now'],policy)
    last_seq = -1
    if args.resume:
        history = world.events()
        snap = world.snapshot()
        desk.now = snap['now']
        desk.rejoin(snap, history)
        last_seq = history[-1]['seq'] if history else -1
    started = time.monotonic()
    with (output / 'events.jsonl').open('a' if args.resume else 'w',encoding='utf-8') as log:
        while desk.now < snap['endsAt']:
            day = desk.now // DAY
            actions, desk.outbox = desk.outbox, []
            try:
                step = world.advance(until=WAKE_ON, max=min(snap['endsAt'], (day+1)*DAY), actions=actions)
            except Unreachable:
                # Never blindly retry a mutation with an unknown result. Rebuild from server truth.
                print('Connection interrupted; rebuilding from snapshot.',flush=True)
                for attempt in range(12):
                    time.sleep(5)
                    try:
                        history = world.events()
                        snap = world.snapshot()
                        desk = StarterDesk(world,args.level,snap['now']) if args.baseline else Desk(world,args.level,snap['now'],policy)
                        desk.rejoin(snap,history)
                        for event in history:
                            if event['seq'] > last_seq:
                                log.write(json.dumps(event,ensure_ascii=False)+'\n')
                        last_seq = history[-1]['seq'] if history else -1
                        break
                    except Unreachable:
                        if attempt == 11: raise
                continue
            desk.read_results(actions, step.get('results', []))
            desk.now = step['now']
            for event in step['events']:
                if event['seq'] <= last_seq:
                    continue
                last_seq = event['seq']
                log.write(json.dumps(event, ensure_ascii=False)+'\n')
                desk.handle(event)
            if desk.now // DAY > day:
                report(f'Day {day+1}',world.score())
    score = world.score()
    meta.update(score=score, elapsed_seconds=round(time.monotonic()-started,2),
                refused_actions=dict(getattr(desk,'failures',{})))
    (output / 'run.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
    print(json.dumps(meta,indent=2),flush=True)
    try:
        if not args.board:
            (output/'reveal.json').write_text(json.dumps(world.reveal(),ensure_ascii=False),encoding='utf-8')
        (output/'snapshot.json').write_text(json.dumps(world.snapshot(),ensure_ascii=False),encoding='utf-8')
    except Unreachable:
        print('Score saved. Optional artifact export interrupted; fetch it again later.',flush=True)
    return meta

def main():
    load_env()
    from transport import ResilientClient as Client
    from pricing import Policy
    defaults = Policy()
    p = argparse.ArgumentParser()
    p.add_argument('--seed',default=None)
    p.add_argument('--level',type=int,choices=range(1,9),default=8)
    p.add_argument('--baseline',action='store_true')
    p.add_argument('--resume',help='Resume only your recorded practice world ID after interruption')
    p.add_argument('--board',action='store_true')
    p.add_argument('--final',action='store_true')
    p.add_argument('--price',type=float,default=defaults.price_multiplier)
    p.add_argument('--fee',type=float,default=defaults.fee_multiplier)
    p.add_argument('--max-drive',type=int,default=defaults.max_drive_minutes)
    p.add_argument('--min-drivers',type=int,default=defaults.min_local_drivers)
    p.add_argument('--max-open',type=int,default=defaults.max_open_orders)
    p.add_argument('--margin-floor',type=int,default=defaults.margin_floor_cents)
    args = p.parse_args()
    if args.board and args.seed:
        p.error('--board cannot be combined with --seed')
    policy = defaults
    policy.price_multiplier = args.price
    policy.fee_multiplier = args.fee
    policy.max_drive_minutes = args.max_drive
    policy.min_local_drivers = args.min_drivers
    policy.max_open_orders = args.max_open
    policy.margin_floor_cents = args.margin_floor
    if args.final:
        from final_runner import run_final
        run_final(Client(),policy)
    else:
        practice(Client(),args,policy)

if __name__ == '__main__':
    main()
