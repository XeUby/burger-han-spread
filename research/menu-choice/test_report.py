import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('menu_report', Path(__file__).with_name('report.py'))
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)

class ChoicesTest(unittest.TestCase):
    def test_missing_ack_is_unknown_and_loss_is_no_purchase(self):
        action = {'type': 'quote', 'requestId': 'r', 'prices': {'same_day': 100, 'next_day': 90}}
        assignment = {'kind': 'menu_randomized', 'requestId': 'r', 'action': action, 'probability': .5}
        loss = {'kind': 'order_lost', 'requestId': 'r'}
        self.assertIsNone(report.choices([loss], [assignment])[0]['outcome'])
        ack = {'kind': 'action_result', 'action': action, 'result': {'ok': True}}
        self.assertEqual(report.choices([loss], [assignment, ack])[0]['outcome'], 'no_purchase')
        ack['result']['ok'] = False
        self.assertIsNone(report.choices([loss], [assignment, ack])[0]['outcome'])

    def test_cancellation_does_not_erase_the_chosen_option(self):
        action = {'type': 'quote', 'requestId': 'r', 'prices': {'same_day': 100, 'next_day': 90}}
        decisions = [{'kind': 'menu_randomized', 'requestId': 'r', 'action': action, 'probability': .5}, {'kind': 'action_result', 'action': action, 'result': {'ok': True}}]
        events = [{'kind': 'order_won', 'order': {'id': 'r', 'option': 'next_day'}}, {'kind': 'order_cancelled', 'orderId': 'r'}]
        row = report.choices(events, decisions)[0]
        self.assertEqual(row['outcome'], 'later')
        self.assertTrue(row['cancelled'])

if __name__ == '__main__': unittest.main()
