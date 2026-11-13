"""Integration layer over the official starter's dispatch lifecycle."""
from collections import Counter
from spread.starter import Desk as StarterDesk
from pricing import Policy, prices_for
from dispatching import fee_schedule

class Desk(StarterDesk):
    def __init__(self, world, level, now, policy=None):
        super().__init__(world, level, now)
        self.policy = policy or Policy()
        self.roads = {(r['from'], r['to']): r for r in world.client.map()['roads']}
        self.drivers = world.roster()
        self.failures = Counter()
        self.events_seen = Counter()

    def quote(self, request):
        self.requests[request['id']] = request
        prices = prices_for(request, self.now, self.roads, self.drivers, self.orders, self.policy)
        if self.level <= 3 and max(prices.values()) >= 100_000_000:
            return
        self.outbox.append({'type':'quote', 'requestId': request['id'], 'prices': prices})

    def fees_for(self, order, cars):
        return fee_schedule(self.now, self.requests[order['id']]['referenceFeeCents'], cars,
                            len(order['legs']), order['id'] in self.urgent, self.level, self.policy)

    def handle(self, event):
        self.events_seen[event['kind']] += 1
        super().handle(event)

    def read_results(self, actions, results):
        super().read_results(actions, results)
        for action, result in zip(actions, results):
            if not result['ok']:
                self.failures[action['type'] + ': ' + result.get('reason', '')] += 1
