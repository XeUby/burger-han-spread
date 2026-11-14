import unittest

from report import conditional_fee


class FeeRecoveryTest(unittest.TestCase):
    def test_recovers_cost_with_win_and_failure_risk(self):
        outcomes = []
        for win, failure, cost in [(.2, .02, 8000), (.8, .01, 12000)]:
            outcomes.append({'revenueCents': win * 20000 * (1 - failure), 'penaltyCents': 2 * win * 20000 * failure, 'fulfillmentCents': win * cost})
        self.assertAlmostEqual(conditional_fee(outcomes, 20000), 10000)

    def test_rejects_zero_probability(self):
        with self.assertRaises(AssertionError):
            conditional_fee([{'revenueCents': 0, 'penaltyCents': 0, 'fulfillmentCents': 0}], 20000)


if __name__ == '__main__':
    unittest.main()
