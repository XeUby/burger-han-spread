import copy
import json
import tempfile
import unittest
from pathlib import Path

from frontier_validation import calculate, load_world, order_counts, validate_manifest


def manifest_fixture():
    policy = {"revision": "f8a730aaed7e169b0e8df8fd1dee9cc5543a69ccaf93ea1780fb78d31747befb", "settings": {"adaptive": True}}
    return {"selectionFrozenAt": "2026-11-14T00:00:00Z", "baseline": policy, "candidate": {"revision": "a" * 64, "settings": {"adaptive": True, "auction": True}}, "bootstrap": {"samples": 1000, "seed": 123}, "pairs": [{"seed": f"reserved-{i}", "baselineWorldId": f"wb{i}", "candidateWorldId": f"wc{i}"} for i in range(6)]}


def row(world, profit):
    return {"worldId": world, "marginCents": profit, "revenueCents": 100000, "wonOrders": 100, "onTimeOrders": 96, "undeliveredOrders": 0, "onTimeShare": .96, "ranked": True}


class FrontierValidationTests(unittest.TestCase):
    def test_exact_private_leg_deadlines_and_cancelled_exclusion(self):
        public = {"privateAddress": False, "window": {"to": 700}}
        private = {"privateAddress": True, "window": {"to": 700}}
        orders = [{"id": "one", "status": "delivered", "deadline": 1200, "deliveredAt": [731, 1000], "legs": [{"delivery": private}, {"delivery": public}]}, {"id": "two", "status": "delivered", "deadline": 1200, "deliveredAt": [730], "legs": [{"delivery": private}]}, {"id": "cancelled", "status": "cancelled", "deadline": 1200, "deliveredAt": [None], "legs": [{"delivery": public}]}]
        counts = order_counts(orders)
        self.assertEqual(counts["wonOrders"], 2)
        self.assertEqual(counts["onTimeOrders"], 1)
        self.assertEqual(counts["lateOrderIds"], ["one"])
        orders[0]["deliveredAt"][1] = None
        self.assertEqual(order_counts(orders)["undeliveredOrderIds"], ["one"])

    def test_paired_bootstrap_sign_test_and_unqualified_profit_are_retained(self):
        manifest = manifest_fixture()
        pairs = [{"seed": p["seed"], "baseline": row(p["baselineWorldId"], 10000), "candidate": row(p["candidateWorldId"], 11000)} for p in manifest["pairs"]]
        report = calculate(pairs, manifest)
        self.assertEqual(report["paired"]["meanDifferenceBootstrap95Cents"], [1000, 1000])
        self.assertEqual(report["paired"]["twoSidedExactSignTestP"], 2 / 64)
        pairs[-1]["candidate"].update(marginCents=-1000, ranked=False, onTimeShare=.8, onTimeOrders=80)
        report = calculate(pairs, manifest)
        self.assertEqual(report["candidate"]["qualifiedWeeks"], 5)
        self.assertEqual(report["candidate"]["minMarginCents"], -1000)
        self.assertEqual(report["paired"], calculate(pairs, manifest)["paired"])

    def test_manifest_requires_freeze_exact_policies_and_unique_worlds(self):
        manifest = manifest_fixture()
        validate_manifest(manifest)
        for change in [lambda m: m.pop("selectionFrozenAt"), lambda m: m["candidate"].pop("revision"), lambda m: m["pairs"][1].update(candidateWorldId="wc0")]:
            altered = copy.deepcopy(manifest)
            change(altered)
            with self.assertRaises(ValueError):
                validate_manifest(altered)

    def test_explicit_world_rejects_unfinished_or_changed_source_before_score(self):
        manifest = manifest_fixture()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "runs").mkdir()
            meta = {"worldId": "wb0", "seed": "reserved-0", **manifest["baseline"]}
            (root / "runs/wb0.meta.json").write_text(json.dumps(meta))
            (root / "runs/wb0.snapshot.json").write_text(json.dumps({"now": 600, "endsAt": 10000}))
            with self.assertRaisesRegex(ValueError, "terminal"):
                load_world(root, "wb0", "reserved-0", manifest["baseline"])
            meta["revision"] = "c" * 64
            (root / "runs/wb0.meta.json").write_text(json.dumps(meta))
            with self.assertRaisesRegex(ValueError, "mismatch"):
                load_world(root, "wb0", "reserved-0", manifest["baseline"])


if __name__ == "__main__":
    unittest.main()
