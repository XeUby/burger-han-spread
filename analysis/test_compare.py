import copy
import unittest

from compare import BASELINE_REVISION, BASELINE_SETTINGS, binomial_lower, compare, markdown


def fixture():
    manifest = {"seeds": [f"seed-{i}" for i in range(8)]}
    rows = []
    for i, seed in enumerate(manifest["seeds"]):
        baseline = {"seed": seed, "worldId": f"b{i}", "revision": BASELINE_REVISION, "settings": BASELINE_SETTINGS, "marginCents": 10000 + i * 100, "revenueCents": 50000, "wonOrders": 100, "onTimeShare": 0.96, "undeliveredShare": 0, "ranked": True}
        candidate = {**baseline, "worldId": f"c{i}", "revision": "candidate-hash", "settings": {"adaptive": True}, "label": "validation-candidate", "marginCents": baseline["marginCents"] + 1000}
        rows.extend([baseline, candidate])
    return rows, manifest


class ComparisonTests(unittest.TestCase):
    def test_constant_improvement_bootstrap_and_aggregate_counts(self):
        rows, manifest = fixture()
        report = compare(rows, manifest)
        self.assertEqual(report["paired"]["meanDifferenceBootstrap95Cents"], [1000, 1000])
        self.assertEqual(report["paired"]["wins"], 8)
        self.assertEqual(report["candidate"]["wonOrders"], 800)
        self.assertEqual(report["candidate"]["onTimeOrders"], 768)
        self.assertEqual(report["paired"]["twoSidedExactSignTestP"], 2 / 256)
        self.assertIn("8/8", markdown(report))

    def test_missing_duplicate_and_changed_candidates_abort(self):
        rows, manifest = fixture()
        with self.assertRaisesRegex(ValueError, "expected one candidate, found 0"):
            compare(rows[:-1], manifest)
        with self.assertRaisesRegex(ValueError, "expected one baseline, found 2"):
            compare(rows + [rows[0]], manifest)
        changed = copy.deepcopy(rows)
        changed[-1]["settings"]["adaptive"] = False
        with self.assertRaisesRegex(ValueError, "changed source revision or settings"):
            compare(changed, manifest)

    def test_unqualified_week_is_reported_and_retained_in_margin(self):
        rows, manifest = fixture()
        rows[-1].update(onTimeShare=0.8, ranked=False, marginCents=-1000)
        report = compare(rows, manifest)
        self.assertEqual(report["candidate"]["qualifiedWeeks"], 7)
        self.assertEqual(report["candidate"]["minMarginCents"], -1000)
        self.assertEqual(report["candidate"]["minOnTimeShare"], 0.8)

    def test_exact_lower_bound_and_deterministic_bootstrap(self):
        self.assertAlmostEqual(binomial_lower(8, 8), 0.05 ** (1 / 8))
        self.assertEqual(binomial_lower(0, 8), 0)
        rows, manifest = fixture()
        rows[-1]["marginCents"] = 8000
        self.assertEqual(compare(rows, manifest)["paired"], compare(rows, manifest)["paired"])

    def test_a_fresh_round_excludes_previous_candidate_labels(self):
        rows, manifest = fixture()
        previous = copy.deepcopy(rows[1])
        previous.update(seed="previous-round", worldId="previous-world")
        for row in rows:
            if row.get("label") == "validation-candidate":
                row["label"] = "validation-final"
        manifest["candidateLabel"] = "validation-final"
        report = compare(rows + [previous], manifest)
        self.assertEqual(report["method"]["candidateLabel"], "validation-final")
        self.assertEqual(report["candidate"]["weeks"], 8)


if __name__ == "__main__":
    unittest.main()
