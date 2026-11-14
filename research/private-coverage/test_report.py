import unittest
from report import exposures


class AttributionTest(unittest.TestCase):
    def fixture(self):
        action = {'type': 'quote', 'requestId': 'r', 'prices': {'same_day': 10000}}
        decisions = [{'kind': 'private_randomized', 'requestId': 'r', 'action': action}, {'kind': 'action_result', 'action': action, 'result': {'ok': True}}]
        snapshot = {'gigs': [{'id': 'g', 'stops': [{'orderId': 'r'}]}]}
        return decisions, snapshot

    def test_loss_is_zero_but_unknown_acknowledgment_is_not(self):
        decisions, snapshot = self.fixture()
        events = [{'kind': 'order_lost', 'requestId': 'r'}]
        rows, _ = exposures('w', events, decisions, snapshot)
        self.assertEqual(rows[0]['contributionCents'], 0)
        rows, _ = exposures('w', events, decisions[:1], snapshot)
        self.assertIsNone(rows[0]['contributionCents'])

    def test_shared_fee_is_not_arbitrarily_assigned(self):
        decisions, snapshot = self.fixture()
        decisions.append({'kind': 'post', 'gigId': 'g', 'post': {'stops': [{'orderId': 'r'}, {'orderId': 'other'}]}})
        events = [{'kind': 'order_won', 'order': {'id': 'r'}}, {'kind': 'ledger', 'line': {'kind': 'driver_fee', 'cents': -5000, 'gigId': 'g', 'orderId': 'r'}}]
        rows, unknown = exposures('w', events, decisions, snapshot)
        self.assertTrue(rows[0]['sharedCostUnknown'])
        self.assertIsNone(rows[0]['contributionCents'])
        self.assertEqual(len(unknown), 1)


if __name__ == '__main__': unittest.main()
