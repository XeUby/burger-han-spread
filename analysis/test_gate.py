import copy
import json
import tempfile
import unittest
from pathlib import Path

from gate import ROOT, baseline, candidate_weeks, code_defaults, evaluate, markdown, panel_seeds, parse_settings, promote, source_revision, status

SETTINGS = {"fee": 1.05, "adaptive": True}
PANELS = {
    "rule": {"minOnTimeShare": 0.94, "minMeanGainCents": 5000, "maxLosingShare": 0.25},
    "panels": {
        "screen": {"seeds": ["s1", "s2", "s3", "s4"]},
        "confirm": {"seeds": ["c1", "c2", "c3", "c4"]},
        "fresh": {"seeds": ["f1", "f2"]},
    },
}


def week(world, margin, on_time=0.98):
    return {"worldId": world, "marginCents": margin, "revenueCents": 3000000, "wonOrders": 300, "onTimeShare": on_time, "undeliveredShare": 0, "ranked": on_time >= 0.9}


def champion():
    seeds = panel_seeds(PANELS, "all")
    return {"label": "champion", "revision": "champion-source", "settings": SETTINGS, "meanMarginCentsOnAll": 800000,
            "weeks": {seed: week(f"w-{seed}", 800000) for seed in seeds}}


def run(label, seed, margin, on_time=0.98, revision="candidate-source", settings=None):
    return {**week(f"{label}-{seed}-{margin}", margin, on_time), "label": label, "seed": seed, "revision": revision, "settings": settings or {**SETTINGS, "fee": 0.95}}


def panel_runs(label, panel, gains, **extra):
    return [run(label, seed, 800000 + gain, **extra) for seed, gain in zip(panel_seeds(PANELS, panel), gains)]


class GateTests(unittest.TestCase):
    def test_clear_gain_passes_and_reports_only_changed_settings(self):
        report = evaluate(champion(), PANELS, panel_runs("fee-095", "screen", [20000, 30000, 10000, 40000]), "fee-095", "screen")
        self.assertEqual(report["verdict"], "PASS")
        self.assertEqual(report["paired"]["meanDifferenceCents"], 25000)
        self.assertEqual(report["settingsChanged"], {"fee": 0.95})
        text = markdown(report, "Lower opening fee", "doni")
        self.assertIn("PASS", text)
        self.assertIn("+€250.00 a week", text)
        self.assertIn("`fee=0.95`", text)

    def test_each_rule_can_fail_the_candidate(self):
        small = evaluate(champion(), PANELS, panel_runs("a1", "screen", [1000, 1000, 1000, 1000]), "a1", "screen")
        self.assertEqual(small["verdict"], "FAIL")
        self.assertIn("mean gain", small["reasons"][0])
        rows = panel_runs("a2", "screen", [90000, 90000, 90000, 90000])
        rows[2].update(onTimeShare=0.93)
        self.assertIn("93.00% is under the 94% guard", evaluate(champion(), PANELS, rows, "a2", "screen")["reasons"][0])
        rows[2].update(onTimeShare=0.89, ranked=False)
        self.assertIn("not ranked", evaluate(champion(), PANELS, rows, "a2", "screen")["reasons"][0])
        uneven = evaluate(champion(), PANELS, panel_runs("a3", "screen", [200000, -1000, -1000, 200000]), "a3", "screen")
        self.assertEqual(uneven["reasons"], ["margin fell on 2 of 4 weeks; at most 1 allowed"])

    def test_missing_mixed_and_identical_candidates_abort(self):
        rows = panel_runs("b1", "screen", [20000, 20000, 20000, 20000])
        with self.assertRaisesRegex(ValueError, "No finished 'b1' week for s4"):
            evaluate(champion(), PANELS, rows[:-1], "b1", "screen")
        mixed = copy.deepcopy(rows)
        mixed[-1]["revision"] = "edited-while-running"
        with self.assertRaisesRegex(ValueError, "mixes source revisions or settings"):
            evaluate(champion(), PANELS, mixed, "b1", "screen")
        same = panel_runs("b2", "screen", [0, 0, 0, 0], revision="champion-source", settings=SETTINGS)
        with self.assertRaisesRegex(ValueError, "is the champion itself"):
            evaluate(champion(), PANELS, same, "b2", "screen")

    def test_a_rerun_replaces_the_earlier_week_of_the_same_label(self):
        rows = panel_runs("c1", "screen", [20000, 20000, 20000, 20000])
        weeks = candidate_weeks(rows + [run("c1", "s1", 900000)], "c1", panel_seeds(PANELS, "screen"))
        self.assertEqual(weeks["s1"]["marginCents"], 900000)

    def test_fresh_panel_needs_champion_weeks_of_the_champion_source(self):
        rows = panel_runs("d1", "fresh", [20000, 20000])
        with self.assertRaisesRegex(ValueError, "No champion week for f1, f2"):
            evaluate(champion(), PANELS, rows, "d1", "fresh")
        stale = [run("champion", seed, 700000, revision="older-source", settings=SETTINGS) for seed in ["f1", "f2"]]
        with self.assertRaisesRegex(ValueError, "No champion week for f1, f2"):
            evaluate(champion(), PANELS, rows + stale, "d1", "fresh")
        played = [run("champion", seed, 700000, revision="champion-source", settings=SETTINGS) for seed in ["f1", "f2"]]
        self.assertEqual(evaluate(champion(), PANELS, rows + played, "d1", "fresh")["paired"]["meanDifferenceCents"], 120000)
        extended = baseline(champion(), PANELS, played, "fresh")
        self.assertEqual(extended["weeks"]["f2"]["marginCents"], 700000)
        self.assertEqual(len(extended["weeks"]), 10)

    def test_promotion_needs_a_pass_on_all_weeks_and_the_matching_checkout(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "src").mkdir()
            (root / "src/policy.ts").write_text("export const defaults: Settings = {\n  fee: 0.95, adaptive: true,\n}\n", encoding="utf-8")
            revision = source_revision(root)
            rows = panel_runs("e1", "all", [20000] * 8, revision=revision)
            with self.assertRaisesRegex(ValueError, "No finished 'e1' week"):
                promote(champion(), PANELS, rows[:4], "e1", root)
            weak = panel_runs("e2", "all", [1000] * 8, revision=revision)
            with self.assertRaisesRegex(ValueError, "Only a candidate that passes"):
                promote(champion(), PANELS, weak, "e2", root)
            other = panel_runs("e3", "all", [20000] * 8, revision="another-source")
            with self.assertRaisesRegex(ValueError, "Check out the candidate's exact source"):
                promote(champion(), PANELS, other, "e3", root)
            override = panel_runs("e4", "all", [20000] * 8, revision=revision, settings={**SETTINGS, "fee": 0.9})
            with self.assertRaisesRegex(ValueError, "Put the candidate's settings into `defaults`"):
                promote(champion(), PANELS, override, "e4", root)
            new = promote(champion(), PANELS, rows + [run("e1", "f1", 910000, revision=revision)], "e1", root)
            self.assertEqual(new["revision"], revision)
            self.assertEqual(new["settings"], {"fee": 0.95, "adaptive": True})
            self.assertEqual(new["meanMarginCentsOnAll"], 820000)
            self.assertEqual(new["previous"]["revision"], "champion-source")
            self.assertEqual(sorted(new["weeks"]), sorted(panel_seeds(PANELS, "all") + ["f1"]))
            self.assertEqual(status(new, root), [])
            self.assertEqual(len(status(champion(), root)), 2)

    def test_settings_are_typed_and_checked(self):
        self.assertEqual(parse_settings(["fee=0.95", "earlyOffers=true"]), {"fee": 0.95, "earlyOffers": True})
        for bad in ["fee", "fee=cheap", 'fee="1"']:
            with self.assertRaises(ValueError):
                parse_settings([bad])

    def test_committed_files_describe_the_checked_out_dispatcher(self):
        committed = json.loads((ROOT / "experiments/champion.json").read_text(encoding="utf-8"))
        panels = json.loads((ROOT / "experiments/panels.json").read_text(encoding="utf-8"))
        self.assertEqual(code_defaults()["demandSlope"], 14)
        self.assertTrue(set(panel_seeds(panels, "all")) <= set(committed["weeks"]))
        self.assertEqual(len(panel_seeds(panels, "all")), 8)


if __name__ == "__main__":
    unittest.main()
