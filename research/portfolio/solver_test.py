import itertools
import random
import unittest
import networkx as nx
from solver import solve, value, check_selection


def candidate(name, claims, profits, use=0, late=0):
    return {"id": name, "observedAt": 10, "claims": claims,
            "outcomes": [{"revenueCents": max(0, p), "fulfillmentCents": max(0, -p), "refundCents": 0, "penaltyCents": 0, "futureCents": 0, "capacity": {"north": use}, "late": late} for p in profits]}


def problem(candidates, capacity=100, late=100):
    scenarios = len(candidates[0]["outcomes"])
    return {"now": 10, "weights": [1]*scenarios, "capacity": [{"north": capacity} for _ in range(scenarios)], "lateBudget": [late]*scenarios, "mandatory": [], "baseline": [], "alternatives": candidates}


class PortfolioTests(unittest.TestCase):
    def test_one_common_choice_cannot_use_future_customer_outcomes(self):
        p = problem([candidate("cheap", ["quote"], [100, 0]), candidate("dear", ["quote"], [0, 120])])
        result = solve(p)
        self.assertEqual(result["selected"], ["dear"])
        self.assertEqual(result["expectedCents"], 60)

    def test_global_capacity_changes_the_best_disjoint_pairs(self):
        p = problem([candidate("large", ["a", "b"], [100], 3), candidate("left", ["a", "c"], [60], 1), candidate("right", ["b", "d"], [60], 1)], capacity=2)
        self.assertEqual(solve(p)["selected"], ["left", "right"])

    def test_existing_anchor_has_a_cost_even_when_customer_declines(self):
        keep = candidate("keep", ["anchor"], [-40, -40])
        route = candidate("route", ["anchor", "new"], [80, -40])
        p = problem([keep, route]); p.update(mandatory=["anchor"], baseline=["keep"])
        result = solve(p)
        self.assertEqual(result["baselineExpectedCents"], -40)
        self.assertEqual(result["expectedCents"], 20)
        self.assertEqual(result["selected"], ["route"])

    def test_risk_constraint_rejects_high_mean_profit(self):
        p = problem([candidate("risky", ["a"], [10000, 10000], late=1), candidate("safe", ["a"], [20, 20])], late=0)
        self.assertEqual(solve(p)["selected"], ["safe"])

    def test_timeout_preserves_a_verified_baseline_without_optimality_claim(self):
        p = problem([candidate("keep", ["a"], [-20]), candidate("new", ["b"], [30])]); p.update(mandatory=["a"], baseline=["keep"])
        result = solve(p, seconds=0)
        self.assertEqual(result["selected"], ["keep"])
        self.assertTrue(result["usedBaselineFallback"])
        self.assertFalse(result["provenOptimal"])

    def test_rejects_missing_commitment_and_future_feature_timestamp(self):
        p = problem([candidate("a", ["a"], [10])]); p["mandatory"] = ["lost"]
        with self.assertRaises(ValueError): solve(p)
        p["mandatory"] = []; p["alternatives"][0]["observedAt"] = 11
        with self.assertRaises(ValueError): solve(p)

    def test_small_portfolios_match_independent_exhaustive_oracle(self):
        rng = random.Random(170114)
        for trial in range(30):
            candidates = [candidate(str(i), rng.sample(["a", "b", "c", "d"], rng.randint(1, 2)), [rng.randint(-10, 100) for _ in range(3)], rng.randint(0, 3), rng.randint(0, 1)) for i in range(8)]
            p = problem(candidates, capacity=4, late=1)
            feasible = []
            for mask in itertools.product([False, True], repeat=len(candidates)):
                chosen = {c["id"] for c, selected in zip(candidates, mask) if selected}
                try: check_selection(p, chosen)
                except ValueError: continue
                feasible.append(sum(value(p, c) for c in candidates if c["id"] in chosen))
            result = solve(p, seconds=1)
            self.assertTrue(result["provenOptimal"])
            self.assertAlmostEqual(result["expectedCents"], max(feasible)/3)

    def test_pair_only_portfolio_agrees_with_networkx(self):
        rng = random.Random(412)
        for trial in range(20):
            graph = nx.Graph()
            graph.add_nodes_from(range(25))
            graph.add_weighted_edges_from((a, b, rng.randint(1, 1000)) for a in range(25) for b in range(a+1, 25) if rng.random()<.15)
            candidates = [candidate(str(i), [str(a), str(b)], [data["weight"]]) for i, (a, b, data) in enumerate(graph.edges(data=True))]
            result = solve(problem(candidates), seconds=1)
            match = nx.max_weight_matching(graph, maxcardinality=False)
            self.assertEqual(result["expectedCents"], sum(graph[a][b]["weight"] for a, b in match))


if __name__ == "__main__":
    unittest.main()
