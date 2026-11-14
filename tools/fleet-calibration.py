"""Calibration of the drivers' on-time model against the weeks it actually played.

    python tools/fleet-calibration.py runs/fleet-default2.jsonl

Each line of the log is either a post (what the model said at a fee) or an outcome (what happened).
"""
import collections
import json
import statistics
import sys


def load(path):
    posts, outcomes = {}, {}
    for line in open(path, encoding="utf-8"):
        row = json.loads(line)
        if row["kind"] == "post":
            posts[row["orderId"]] = row
        else:
            outcomes[row["orderId"]] = row["onTime"]
    return posts, outcomes


def bucket(p):
    for edge in (0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.98):
        if p < edge:
            return f"<{edge:.2f}"
    return ">=0.98"


def main(path):
    posts, outcomes = load(path)
    joined = [(row, outcomes[oid]) for oid, row in posts.items() if oid in outcomes]
    print(f"{path}: {len(posts)} posted, {len(joined)} with an outcome")
    fails = [oid for oid in posts if oid not in outcomes]
    print(f"  {len(fails)} posted cars never delivered (dropped or cancelled)")
    if not joined:
        return
    predicted = statistics.mean(row["predicted"] for row, _ in joined)
    actual = statistics.mean(outcome for _, outcome in joined)
    print(f"  model says {predicted:.1%} on time; the week did {actual:.1%}  (bias {predicted - actual:+.1%})")

    by_bucket = collections.defaultdict(lambda: [0, 0, 0.0])
    for row, outcome in joined:
        entry = by_bucket[bucket(row["predicted"])]
        entry[0] += 1
        entry[1] += outcome
        entry[2] += row["predicted"]
    print("\n  predicted bucket   n   said   did")
    for name in sorted(by_bucket, key=lambda key: float(key.strip("<>=") if key != ">=0.98" else 1)):
        n, wins, said = by_bucket[name]
        print(f"  {name:>12s} {n:5d}  {said / n:5.1%}  {wins / n:5.1%}")

    print("\n  fee multiple   n   said   did   mean slack (h)")
    by_fee = collections.defaultdict(lambda: [0, 0, 0.0, 0.0])
    for row, outcome in joined:
        key = round(row["multiple"] * 4) / 4
        entry = by_fee[key]
        entry[0] += 1
        entry[1] += outcome
        entry[2] += row["predicted"]
        entry[3] += 2.718281828 ** row["car"]["slack"] - 1
    for key in sorted(by_fee):
        n, wins, said, slack = by_fee[key]
        print(f"  {key:12.2f} {n:5d}  {said / n:5.1%}  {wins / n:5.1%}  {slack / n:8.1f}")

    print("\n  slack bucket (h)   n   said   did")
    by_slack = collections.defaultdict(lambda: [0, 0, 0.0])
    for row, outcome in joined:
        hours = 2.718281828 ** row["car"]["slack"] - 1
        key = "<4" if hours < 4 else "4-12" if hours < 12 else "12-24" if hours < 24 else "24-48" if hours < 48 else ">=48"
        entry = by_slack[key]
        entry[0] += 1
        entry[1] += outcome
        entry[2] += row["predicted"]
    for key in ["<4", "4-12", "12-24", "24-48", ">=48"]:
        if key not in by_slack:
            continue
        n, wins, said = by_slack[key]
        print(f"  {key:>12s} {n:6d}  {said / n:5.1%}  {wins / n:5.1%}")

    near = [row for row, _ in joined if row["predicted"] < 0.7]
    print(f"\n  cars the model doubts (p<0.7): {len(near)}; of those delivered, {sum(outcomes[row['orderId']] for row in near)} on time")


if __name__ == "__main__":
    for path in sys.argv[1:]:
        main(path)
