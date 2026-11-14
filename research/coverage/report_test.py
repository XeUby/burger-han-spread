import unittest
from research.coverage.report import exposures

class ObservationTests(unittest.TestCase):
    def post(self, result=None):
        action={'type':'post','stops':[{'orderId':'r'}],'schedule':[{'at':100,'feeCents':1000}]}
        assignment={'kind':'opening_randomized','at':100,'action':action,'orderIds':['r'],'probability':1/3,'multiplier':1}
        return [assignment]+([{'kind':'action_result','at':100,'action':action,'result':result}] if result is not None else [])

    def test_unknown_action_is_not_an_observed_nonbooking(self):
        row=exposures(self.post(),[],300,True)[0]
        self.assertIsNone(row['booking120'])
        self.assertFalse(row['outcomeKnown'])

    def test_failed_action_remains_in_assignment_denominator(self):
        row=exposures(self.post({'ok':False}),[],300,True)[0]
        self.assertEqual(row['booking120'],0)
        self.assertTrue(row['outcomeKnown'])

    def test_week_end_censors_short_followup_but_not_observed_booking(self):
        decisions=self.post({'ok':True,'id':'g'})
        self.assertIsNone(exposures(decisions,[],150,True)[0]['booking120'])
        events=[{'kind':'gig_booked','gigId':'g','at':130}]
        self.assertEqual(exposures(decisions,events,150,True)[0]['booking120'],1)

    def test_competing_close_is_recorded_separately_from_censoring(self):
        row=exposures(self.post({'ok':True,'id':'g'}),[{'kind':'gig_expired','gigId':'g','at':130}],300,True)[0]
        self.assertEqual(row['booking120'],0)
        self.assertEqual(row['closedBy'],'expired')

    def test_one_cancelled_order_does_not_close_a_multiorder_gig(self):
        decisions=self.post({'ok':True,'id':'g'})
        decisions[0]['orderIds']=['r','other']
        events=[{'kind':'order_cancelled','orderId':'r','at':110},{'kind':'gig_booked','gigId':'g','at':140}]
        self.assertEqual(exposures(decisions,events,300,True)[0]['booking120'],1)

    def test_offer_expiration_is_not_a_refusal(self):
        action={'type':'offer','gigId':'g','driverId':'d','feeCents':1000}
        decision={'kind':'offer_randomized','at':100,'action':action}
        row=exposures([decision],[{'kind':'offer_answered','gigId':'g','driverId':'d','at':110,'answer':'expired'}],300,True)[0]
        self.assertEqual(row['answer'],'expired')
        self.assertTrue(row['outcomeKnown'])

    def test_unallocated_bundle_cost_is_not_invented_as_request_cost(self):
        decision={'kind':'acquisition_randomized','at':100,'requestId':'r','action':{'type':'quote'}}
        events=[{'kind':'ledger','line':{'orderId':'r','kind':'revenue','cents':1000}}, {'kind':'ledger','line':{'orderId':None,'kind':'driver_fee','cents':-700}}]
        row=exposures([decision],events,300,True)[0]
        self.assertEqual(row['attributedContributionEuros'],10)
        self.assertIsNone(exposures([decision],events,300,False)[0]['attributedContributionEuros'])

if __name__=='__main__':unittest.main()
