"""Live runner based on the official kit's stream/rejoin protocol.

Run ONE instance per team. Validate in Saturday's test final before Sunday.
"""
import json
import time
from pathlib import Path
from spread.client import Unreachable
from spread.starter import next_final, report
from strategy import Desk

def run_final(client, policy):
    world = None
    while True:
        try:
            if world is None:
                world = next_final(client)
                print(f'Final world: {world.id}', flush=True)
            history = world.events()
            snapshot = world.snapshot()
            if snapshot['now'] >= snapshot['endsAt']:
                report('Final', world.score())
                return
            desk = Desk(world, 8, snapshot['now'], policy)
            desk.rejoin(snapshot, history)
            desk.send()
            last_seq = history[-1]['seq'] if history else -1
            output = Path('results') / ('final-' + world.id)
            output.mkdir(parents=True, exist_ok=True)
            with (output/'events.jsonl').open('a', encoding='utf-8', buffering=1) as log:
                for event in world.stream(after=last_seq, idle=1.0):
                    if event is None:
                        desk.now = client.final()['now']
                    elif event['seq'] > last_seq:
                        last_seq = event['seq']
                        desk.now = max(desk.now, event['at'])
                        log.write(json.dumps(event, ensure_ascii=False)+'\n')
                        # Requests already expired during reconnect must not delay current work.
                        if event['kind'] != 'price_request' or event['request']['respondBy'] > desk.now:
                            desk.handle(event)
                    desk.send()
                    if desk.now >= snapshot['endsAt']:
                        score = world.score()
                        (output/'score.json').write_text(json.dumps(score,indent=2),encoding='utf-8')
                        report('Final', score)
                        return
        except Unreachable as error:
            print(f'Connection interrupted: {error}. Rebuilding in 5 seconds.',flush=True)
            time.sleep(5)

