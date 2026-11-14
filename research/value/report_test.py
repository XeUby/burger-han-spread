import unittest
from panel_size import required_pairs
from report import paired


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


if __name__=="__main__":
    unittest.main()
