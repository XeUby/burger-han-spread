import copy
import unittest
from v2_engine import V2Config,quote_v2,fee_schedule_v2,evaluate_scores,DECLINE
class V2Tests(unittest.TestCase):
    def setUp(self):
        self.r={'id':'r1','note':None,'referenceFeeCents':6000,
                'legs':[{'car':{'premium':False,'electric':False},
                         'pickup':{'placeId':'A','privateAddress':False,'window':{'from':500}},
                         'delivery':{'placeId':'B','privateAddress':False}}],
                'options':[{'kind':'next_day','deadline':1500,'listPriceCents':15000}]}
        self.roads={(a,b):{'minutes':0 if a==b else 180} for a in ['A','B'] for b in ['A','B']}
        self.drivers=[{'homePlaceId':'A','rating':5,'completedGigs':100}]
        self.cfg=V2Config()
    def q(self,**kwargs):
        return quote_v2(kwargs.get('request',self.r),500,self.roads,kwargs.get('drivers',self.drivers),kwargs.get('orders',{}),self.cfg)
    def test_quote_positive(self): self.assertGreater(self.q()['next_day'],15000)
    def test_no_nearby_driver(self): self.assertEqual(self.q(drivers=[]),{'next_day':DECLINE})
    def test_reject_unknown_note(self):
        r=dict(self.r,note={'text':'Ready tomorrow at 14:00'})
        self.assertEqual(self.q(request=r),{'next_day':DECLINE})
    def test_reject_private(self):
        r=copy.deepcopy(self.r);r['legs'][0]['pickup']['privateAddress']=True
        self.assertEqual(self.q(request=r),{'next_day':DECLINE})
    def test_reject_short_deadline(self):
        r=dict(self.r,options=[dict(self.r['options'][0],deadline=640)])
        self.assertEqual(self.q(request=r),{'next_day':DECLINE})
    def test_does_not_decline_at_16_orders(self):
        o={str(i):{'deliveredAt':[None]} for i in range(16)}
        self.assertNotEqual(self.q(orders=o)['next_day'],DECLINE)
    def test_fee_monotonic(self):
        for urgent in (True,False):
            for level in (1,8):
                rows=fee_schedule_v2(100,6000,1,1,urgent,level,self.cfg)
                self.assertTrue(all(b['at']>a['at'] and b['feeCents']>=a['feeCents'] for a,b in zip(rows,rows[1:])))
                self.assertEqual(len(rows),1 if level==1 else 3)
    def test_qualifier_checked_per_week(self):
        good={'marginCents':2000000,'wonOrders':100,'onTimeShare':.95,'ranked':True}
        bad={'marginCents':2000000,'wonOrders':100,'onTimeShare':.89,'ranked':False}
        self.assertFalse(evaluate_scores([good]*4+[bad])['target_100k_reached'])
        self.assertTrue(evaluate_scores([good]*5)['target_100k_reached'])
if __name__=='__main__': unittest.main()
