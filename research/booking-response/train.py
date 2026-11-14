"""Compare fixed models on complete seed groups; export a conservative prior."""

import hashlib
import json
from collections import Counter
from pathlib import Path
import numpy as np
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import brier_score_loss, log_loss
import sklearn

ROOT = Path(__file__).resolve().parents[2]


def fit():
    data = json.loads((ROOT / "runs/booking-response-data.json").read_text())
    seeds = sorted({r["seed"] for r in data["rows"]}, key=lambda s: hashlib.sha256(("booking-split-v1:"+s).encode()).hexdigest())
    train_seeds = set(seeds[:int(len(seeds)*.75)])
    report = {"role": "development model comparison; no policy promotion", "sklearnVersion": sklearn.__version__, "numpyVersion": np.__version__, "dataSha256": hashlib.sha256((ROOT / "runs/booking-response-data.json").read_bytes()).hexdigest(), "split": {"train": sorted(train_seeds), "test": sorted(set(seeds)-train_seeds)}, "features": data["features"], "sourceWeeks": data["weeks"], "limitations": data["limitations"], "targets": {}}
    for target in ["booking120", "dropped", "late"]:
        rows = [r for r in data["rows"] if r[target] is not None]
        x, y = np.array([r["x"] for r in rows]), np.array([r[target] for r in rows])
        train = np.array([r["seed"] in train_seeds for r in rows])
        counts = Counter(r["seed"] for r in rows)
        weights = np.array([1/counts[r["seed"]] for r in rows])
        weights /= weights[train].mean()
        models = {"pooled": DummyClassifier(strategy="prior"), "logistic": make_pipeline(StandardScaler(), LogisticRegression(C=.2, max_iter=1000)), "boosted": HistGradientBoostingClassifier(max_iter=60, max_leaf_nodes=7, l2_regularization=10, min_samples_leaf=80, early_stopping=False, random_state=1701)}
        scores = {}
        for name, model in models.items():
            args = {"logisticregression__sample_weight" if name == "logistic" else "sample_weight": weights[train]}
            model.fit(x[train], y[train], **args)
            p = np.clip(model.predict_proba(x[~train])[:, 1], 1e-6, 1-1e-6)
            per_week = []
            held = [r for r in rows if r["seed"] not in train_seeds]
            for seed in sorted(set(seeds)-train_seeds):
                mask = np.array([r["seed"] == seed for r in held])
                if mask.any():
                    per_week.append({"seed": seed, "brier": float(brier_score_loss(y[~train][mask], p[mask])), "logLoss": float(log_loss(y[~train][mask], p[mask], labels=[0, 1])), "observed": float(y[~train][mask].mean()), "predicted": float(p[mask].mean()), "orders": int(mask.sum())})
            scores[name] = {"meanWeekBrier": float(np.mean([w["brier"] for w in per_week])), "meanWeekLogLoss": float(np.mean([w["logLoss"] for w in per_week])), "weeks": per_week}
        report["targets"][target] = {"labeled": len(rows), "censored": len(data["rows"])-len(rows), "scores": scores}
    training = [r for r in data["rows"] if r["seed"] in train_seeds and r["booking120"] is not None and r["x"][0] >= 7]
    week_rates = [np.mean([r["booking120"] for r in training if r["seed"] == seed]) for seed in sorted({r["seed"] for r in training})]
    prior = {"version": 1, "fastBookingProbability": float(np.mean(week_rates)), "priorOrders": 12, "horizonMinutes": 120, "trainingSeeds": sorted(train_seeds), "features": "level>=7; public first award to first booking within120minutes", "limits": "A descriptive prior, not a causal fee-response curve. The online policy updates only fully observed120minute cohorts and retains cancellations as censored."}
    (ROOT / "experiments/booking-response-prior.json").write_text(json.dumps(prior, indent=2)+"\n")
    report["neuralNetworkDecision"] = "Deferred: fewer than100 independent weeks, several policy mixtures, and weak action coverage. Test simple and boosted models before adding model capacity."
    (ROOT / "docs/booking-response-models.json").write_text(json.dumps(report, indent=2)+"\n")
    print(json.dumps({"weeks": len(seeds), "train": len(train_seeds), "test": len(seeds)-len(train_seeds), "prior": prior["fastBookingProbability"], "scores": {t: {m: s["meanWeekBrier"] for m,s in v["scores"].items()} for t,v in report["targets"].items()}}))


if __name__ == "__main__":
    fit()
