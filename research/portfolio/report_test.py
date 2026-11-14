"""Check that audit counts preserve failed actions and solver fallbacks."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from research.portfolio.report import solver_audit


class AuditTest(unittest.TestCase):
    def test_failed_actions_do_not_count_as_executed_mechanisms(self):
        rows = [
            {"kind": "portfolio_action", "plan": {"kind": "quote", "changedQuote": True}, "action": {"type": "quote"}, "result": {"ok": False}},
            {"kind": "portfolio_action", "plan": {"kind": "fulfill", "multiplier": 1.08}, "action": {"type": "post", "stops": [{"orderId": "a"}, {"orderId": "a"}, {"orderId": "b"}, {"orderId": "b"}]}, "result": {"ok": True}},
        ]
        audit = solver_audit(rows)
        self.assertEqual(audit["actions"], {"quote": 1, "post": 1})
        self.assertEqual(audit["changedQuotes"], 0)
        self.assertEqual(audit["bundledPosts"], 1)
        self.assertEqual(audit["higherPaidPosts"], 1)

    def test_fallbacks_and_omissions_remain_visible(self):
        row = {"kind": "portfolio_solve", "input": {"alternatives": [{"id": "keep"}]}, "result": {"status": "UNKNOWN", "usedBaselineFallback": True}, "omitted": 7}
        audit = solver_audit([row])
        self.assertEqual(audit["statuses"], {"UNKNOWN": 1})
        self.assertEqual(audit["fallbacks"], 1)
        self.assertEqual(audit["omittedCandidates"], 7)
        self.assertEqual(audit["meaningfulActions"], 0)


if __name__ == "__main__":
    unittest.main()
