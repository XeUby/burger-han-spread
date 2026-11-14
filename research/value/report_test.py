import unittest
from panel_size import required_pairs
from report import paired, probes


class StatisticsTests(unittest.TestCase):
    def test_week_units_and_cents(self):
        result=paired([100,300,-200,600])
        self.assertEqual(result["pairs"],4)
        self.assertEqual(result["meanEuros"],2)
        self.assertEqual(result["wins"],3)
        self.assertEqual(result["losses"],1)
        self.assertLess(result["t95Euros"][0],2)
        self.assertGreater(result["t95Euros"][1],2)

    def test_reliability_dominates_the_24_pair_floor(self):
        result=required_pairs(100,4,.0125)
        self.assertEqual(result["zeroFailureReliabilityPairs"],86)
        self.assertEqual(result["requiredPairs"],86)
        self.assertEqual(required_pairs(100,4,.0125,qualification=.99)["zeroFailureReliabilityPairs"],437)

    def test_variance_uncertainty_can_increase_the_panel(self):
        result=required_pairs(5000,4,.0125)
        self.assertGreater(result["requiredPairs"],86)
        self.assertGreater(result["oneSided95UpperSdEuros"],5000)

    def test_closed_unbooked_probe_is_censored_before_its_horizon(self):
        decisions=[{"kind":"payment_randomized","at":0,"orderId":"r1"},{"kind":"action_result","at":0,"action":{"type":"post","stops":[{"orderId":"r1"}]},"result":{"ok":True,"id":"g1"}}]
        for kind,extra in [("order_cancelled",{"orderId":"r1"}),("gig_expired",{"gigId":"g1"})]:
            with self.subTest(kind=kind):
                row=probes("world",decisions,[{"kind":kind,"at":60,**extra}],{"endsAt":1000})[0]
                self.assertIsNone(row["booking120"])
                self.assertEqual(row["observedMinutes"],60)

    def test_observed_booking_and_failed_post_are_distinct(self):
        probe={"kind":"payment_randomized","at":0,"orderId":"r1"}
        posted={"kind":"action_result","at":0,"action":{"type":"post","stops":[{"orderId":"r1"}]},"result":{"ok":True,"id":"g1"}}
        for minute,expected in [(60,1),(121,0)]:
            row=probes("world",[probe,posted],[{"kind":"gig_booked","at":minute,"gigId":"g1"}],{"endsAt":1000})[0]
            self.assertEqual(row["booking120"],expected)
        failed={**posted,"result":{"ok":False,"reason":"refused"}}
        self.assertIsNone(probes("world",[probe,failed],[],{"endsAt":1000})[0]["booking120"])


if __name__=="__main__":
    unittest.main()
