"""Freeze confirmation of the payout variant selected by the declared screen."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[2]
report = json.loads((root / "docs/payout-results.json").read_text())
parent_path = root / "experiments/payout-protocol.json"
parent = json.loads(parent_path.read_text())
assert report["terminal"] and report["selectedForConfirmation"]
assert report["protocol"] == parent
selected = report["selectedForConfirmation"]
assert report["summary"][selected]["gatePassed"]
label = "payout-confirmation"
settings = parent["variants"][selected]
digest = hashlib.sha256()
for file in sorted((root / "src").glob("*.ts")):
    digest.update(file.name.encode())
    digest.update(file.read_bytes())
assert digest.hexdigest() == parent["revision"]
controls = json.loads((root / "experiments/relisting-confirmation-protocol.json").read_text())["baselines"]
assert [row["seed"] for row in controls] == parent["confirmationSeeds"]
assert all(row["revision"] == parent["baselines"][0]["revision"] for row in controls)
plan_path = "experiments/plans/payout-confirmation.json"
protocol_path = "experiments/payout-confirmation-protocol.json"
manifest_path = "experiments/payout-confirmation-manifest.json"
assert not any((root / path).exists() for path in [plan_path, protocol_path, manifest_path]), "Confirmation is already frozen"
now = datetime.now(timezone.utc).isoformat()
plan = [{"label": label, "seed": seed, "settings": settings} for seed in parent["confirmationSeeds"]]
protocol = {
    "declaredAt": now,
    "parentProtocol": str(parent_path.relative_to(root)),
    "parentProtocolSha256": hashlib.sha256(parent_path.read_bytes()).hexdigest(),
    "screeningReport": "docs/payout-results.json",
    "screeningReportSha256": hashlib.sha256((root / "docs/payout-results.json").read_bytes()).hexdigest(),
    "selectedVariant": selected,
    "revision": parent["revision"],
    "bundle": parent["bundle"],
    "scope": "Four predeclared old development confirmation weeks. No ranking or final. No parameter changes after screening.",
    "intervention": parent["interventions"][selected],
    "invariants": parent["invariants"],
    "variants": {label: settings},
    "plan": plan_path,
    "baselines": controls,
    "confirmationSeeds": parent["confirmationSeeds"],
    "confirmationGate": parent["confirmationGate"],
    "freshValidation": parent["freshValidation"],
    "workers": 1,
    "maximumConcurrentPlays": 4,
    "failureRule": parent["failureRule"],
}
def write(path, value):
    (root / path).write_text(json.dumps(value, indent=2) + "\n")

write(plan_path, plan)
write(protocol_path, protocol)
write(manifest_path, {
    "assignedAt": now,
    "protocol": protocol_path,
    "protocolSha256": hashlib.sha256((root / protocol_path).read_bytes()).hexdigest(),
    "worlds": [{"label": label, "seed": seed, "worldId": None} for seed in parent["confirmationSeeds"]],
})
print(json.dumps({"selectedVariant": selected, "plan": plan_path, "protocol": protocol_path, "manifest": manifest_path, "workers": 1}, indent=2))
