import copy
import unittest
from pricing import Policy, prices_for
from dispatching import fee_schedule

class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.request = {'id':'R1','note':None,'referenceFeeCents':5000,
            'legs':[{'car':{'premium':False},
                     'pickup':{'placeId':'a','privateAddress':False,'window':{'from':480,'to':1200}},
                     'delivery':{'placeId':'b','privateAddress':False}}],
            'options':[{'kind':'same_day','deadline':1200,'listPriceCents':10000}]}
        self.roads = {('a','a'):{'minutes':0},('a','b'):{'minutes':120}}
        self.drivers = [{'homePlaceId':'a','rating':5,'completedGigs':100} for _ in range(5)]

    def quote(self, req=None, drivers=None, now=480, orders=None):
        return prices_for(req or self.request,now,self.roads,
                          self.drivers if drivers is None else drivers,orders or {},Policy())

    def test_rejects_no_drivers(self):
        self.assertEqual(self.quote(drivers=[]), {'same_day':100_000_000})

    def test_reserves_time_for_driver(self):
        self.assertEqual(self.quote(now=1100), {'same_day':100_000_000})

    def test_premium_requires_experience(self):
        req=copy.deepcopy(self.request); req['legs'][0]['car']['premium']=True
        drivers=[{**d,'rating':4.7} for d in self.drivers]
        self.assertEqual(self.quote(req,drivers), {'same_day':100_000_000})

    def test_notes_not_silently_ignored(self):
        req=copy.deepcopy(self.request); req['note']={'text':'Not ready until tomorrow'}
        self.assertEqual(self.quote(req), {'same_day':100_000_000})

    def test_risky_notes_declined(self):
        for text in ['Klar först på onsdag kl 12.', 'Car has no plates, bring trade plates!',
                     'Manuaalivaihteisto.', 'auto vielä kesärenkailla', 'Still on smumer tyres',
                     'Must be at destination by tomorrow 17:00.', 'Vastaanotto klo 16 asti.',
                     'Maksun jälkeen', 'Ready half three', 'Nouto to. aamulla']:
            req=copy.deepcopy(self.request); req['note']={'text':text}
            self.assertEqual(self.quote(req), {'same_day':100_000_000}, text)

    def test_safe_notes_quoted(self):
        for text in ['Soita asiakkaalle, kiitos!','Paperit kuljettajalle tiskiltä. Rengassarja mukaan.',
                     'avain avainboksissa, koodi 2810. soita asap jos tulee ongelmia.',
                     'Perillä kysy myyjää, tilausnumero 942396.']:
            req=copy.deepcopy(self.request); req['note']={'text':text}
            self.assertLess(self.quote(req)['same_day'], 100_000_000, text)

    def test_many_open_orders_still_quoted(self):
        open_orders={f'O{i}':{'deliveredAt':[None]} for i in range(100)}
        self.assertLess(self.quote(orders=open_orders)['same_day'], 100_000_000)

    def test_quotes_cover_planned_cost(self):
        price=self.quote()['same_day']
        self.assertGreater(price,5000*Policy().fee_multiplier)
        self.assertIsInstance(price,int)

    def test_schedules_valid_in_all_levels(self):
        for level in range(1,9):
            for urgent in (False,True):
                schedule=fee_schedule(480,5001,1,2,urgent,level,Policy())
                self.assertTrue(all(isinstance(s['feeCents'],int) and s['feeCents']>0 for s in schedule))
                self.assertEqual(sorted(s['at'] for s in schedule),[s['at'] for s in schedule])
                self.assertEqual(sorted(s['feeCents'] for s in schedule),[s['feeCents'] for s in schedule])
                if level==1: self.assertEqual(len(schedule),1)

if __name__=='__main__': unittest.main()
