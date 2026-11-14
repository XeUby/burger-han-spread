"""Reserve independent paired weeks only after frozen payout confirmation passes."""

import hashlib
import json
import secrets
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[2]
report_path = root / "docs/payout-confirmation-results.json"
report = json.loads(report_path.read_text())
assert report["terminal"] and report["eligibleForIndependentEvaluation"], "Confirmation has not passed"
protocol = report["protocol"]
assert protocol == json.loads((root / "experiments/payout-confirmation-protocol.json").read_text())
assert len(report["records"]) == 4 and all(row["status"] == "complete" for row in report["records"])
assert len(protocol["variants"]) == 1
settings = next(iter(protocol["variants"].values()))
baseline = protocol["baselines"][0]
archive = json.loads((root / "experiments/frontier/source-index.json").read_text())[baseline["revision"]]
policies = {
    "baseline": {"revision": baseline["revision"], "bundle": archive["bundle"], "settings": baseline["settings"]},
    "candidate": {"revision": protocol["revision"], "bundle": protocol["bundle"], "settings": settings},
}
for policy in policies.values():
    digest = hashlib.sha256()
    for file in sorted((root / policy["bundle"] / "src").glob("*.ts")):
        digest.update(file.name.encode())
        digest.update(file.read_bytes())
    assert digest.hexdigest() == policy["revision"]
reservation_path = root / "experiments/payout-reserved-seeds.json"
manifest_path = root / "experiments/payout-validation-manifest.json"
assert not reservation_path.exists() and not manifest_path.exists(), "Evaluation is already frozen"
now = datetime.now(timezone.utc).isoformat()
seeds = [f"payout-unseen-20261114-{secrets.token_hex(8)}" for _ in range(12)]
assert len(set(seeds)) == 12
reservation = {
    "reservedAt": now,
    "purpose": "Independent paired evaluation after frozen opening-only payout policy passes both development gates. Cryptographically random seeds have not been played or inspected.",
    "seeds": seeds,
}
manifest = {
    **policies,
    "bootstrap": {"samples": 20000, "seed": 2026111403},
    "selectionFrozenAt": now,
    "labelPrefix": "payout-evaluation",
    "unseenDeclaration": "All12 cryptographically random seeds reserved after confirmation and before any play. Neither this panel nor earlier fresh panels is used to tune this frozen candidate while called unseen.",
    "reservation": reservation,
    "confirmationReport": str(report_path.relative_to(root)),
    "confirmationReportSha256": hashlib.sha256(report_path.read_bytes()).hexdigest(),
    "promotionRule": "Require all12 candidate weeks qualified, no undelivered orders, positive mean paired gain with a positive95% paired bootstrap lower endpoint, and no failed visits. Inspect all action errors and retain every attempt. No default change before all trials and audit complete.",
    "panelRationale": "Use12paired weeks rather than the prior8because cutting payouts introduces observed reliability risk. This is still insufficient to establish a very low disqualification probability.",
    "maximumJobs": 1,
    "maximumConcurrentPlays": 4,
    "pairs": [{"seed": seed, "baselineWorldId": None, "candidateWorldId": None} for seed in seeds],
    "attempts": [],
}
reservation_path.write_text(json.dumps(reservation, indent=2) + "\n")
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({"manifest": str(manifest_path.relative_to(root)), "pairs": len(seeds), "maximumJobs": 1, "revision": protocol["revision"]}, indent=2))
