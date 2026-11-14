"""Apply the frozen promotion rule to the complete payout evaluation."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[2]
manifest_path = root / "experiments/payout-validation-manifest.json"
manifest = json.loads(manifest_path.read_text())
report_path = root / "docs/payout-validation.json"
report = json.loads(report_path.read_text())
audit_path = root / "docs/payout-validation-audit.json"
audit = json.loads(audit_path.read_text())
assert report["provenance"]["manifestSha256"] == hashlib.sha256(manifest_path.read_bytes()).hexdigest()
assert hashlib.sha256((root / manifest["confirmationReport"]).read_bytes()).hexdigest() == manifest["confirmationReportSha256"]
assert len(manifest["pairs"]) == len(report["weeks"]) == 12
assert len(manifest["attempts"]) == len(audit["records"]) == 24
assert audit["terminal"] and audit["attempts"] == manifest["attempts"]
assert all(attempt.get("completedAt") and not attempt.get("error") for attempt in manifest["attempts"])
assert not manifest.get("runnerErrors")
for side in ["baseline", "candidate"]:
    assert report["method"][side] == manifest[side]
for row in audit["records"]:
    assert len(row["actionErrorContexts"]) == len(row["actionErrors"])
    for context in row["actionErrorContexts"]:
        error = context["error"]
        assert error["action"]["type"] == "reprice"
        assert error["reason"] == f"Gig {error['action']['gigId']} is not open"
        assert [event["kind"] for event in context["sameMinuteGigEvents"] if event["kind"] in ["gig_dropped", "gig_booked"]] == ["gig_dropped", "gig_booked"]

candidate, paired = report["candidate"], report["paired"]
conditions = {
    "all12CandidateWeeksQualified": candidate["qualifiedWeeks"] == 12,
    "noUndeliveredCandidateOrders": candidate["undeliveredOrders"] == 0,
    "noFailedCandidateVisits": audit["summary"]["candidate"]["failedVisits"] == 0,
    "positiveMeanPairedGain": paired["meanDifferenceCents"] > 0,
    "positive95PercentBootstrapLowerEndpoint": paired["meanDifferenceBootstrap95Cents"][0] > 0,
}
decision = {
    "decidedAt": datetime.now(timezone.utc).isoformat(),
    "selected": all(conditions.values()),
    "rule": manifest["promotionRule"], "conditions": conditions,
    "candidateRevision": manifest["candidate"]["revision"],
    "baselineRevision": manifest["baseline"]["revision"],
    "settings": manifest["candidate"]["settings"],
    "validation": str(report_path.relative_to(root)),
    "validationSha256": hashlib.sha256(report_path.read_bytes()).hexdigest(),
    "audit": str(audit_path.relative_to(root)),
    "auditSha256": hashlib.sha256(audit_path.read_bytes()).hexdigest(),
    "paired": paired, "candidate": candidate,
    "operationalSummary": audit["summary"],
    "operationalReview": "Every action error was inspected: stale reprices after same-minute drops and rebookings. Every attempt is retained.",
    "deliveryTradeoff": {
        "baselineAggregateOnTimeShare": report["baseline"]["aggregateOnTimeShare"],
        "candidateAggregateOnTimeShare": candidate["aggregateOnTimeShare"],
        "pairsWithLowerCandidateOnTimeShare": sum(week["candidate"]["onTimeShare"] < week["baseline"]["onTimeShare"] for week in report["weeks"]),
        "minimumCandidateOnTimeShare": candidate["minOnTimeShare"],
        "qualificationOneSided95Lower": candidate["qualificationOneSided95Lower"],
        "interpretation": "All candidate weeks qualified, but delivery reliability declined. Twelve weeks do not establish rare-failure safety; the qualification bound assumes independent identically distributed weeks.",
    },
    "scope": "Ordinary practice only. This is an independently validated improvement, not proof of global optimality or a forecast of leaderboard rank.",
}
(root / "experiments/payout-decision.json").write_text(json.dumps(decision, indent=2) + "\n")
print(json.dumps({"selected": decision["selected"], "conditions": conditions}, indent=2))
