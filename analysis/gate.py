#!/usr/bin/env python3
"""Team gate: compare one candidate with the shared champion on a fixed panel of practice weeks.

  python analysis/gate.py status
  python analysis/gate.py plan --label fee-095 --panel screen --set fee=0.95
  node experiments/study.ts --plan experiments/plans/fee-095-screen.json --jobs 2
  python analysis/gate.py check --label fee-095 --panel screen --idea "Lower opening fee" --owner doni --record
  python analysis/gate.py promote --label fee-095-baked

Practice worlds are deterministic, so the champion's committed weeks are reused and only the candidate runs.
"""

import argparse
import hashlib
import json
import random
import re
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

from compare import BOOTSTRAP_SAMPLES, BOOTSTRAP_SEED, percentile, summarize, validate_row

ROOT = Path(__file__).resolve().parent.parent
CHAMPION_LABEL = "champion"
LABEL = re.compile(r"^[a-z0-9][a-z0-9-]{1,40}$")
WEEK_KEYS = ["worldId", "marginCents", "revenueCents", "wonOrders", "onTimeShare", "undeliveredShare", "ranked"]


def panel_seeds(panels, name):
    """Seeds of one panel; "all" is screen followed by confirm."""
    names = ["screen", "confirm"] if name == "all" else [name]
    seeds = []
    for part in names:
        entry = panels["panels"].get(part)
        if not entry:
            raise ValueError(f"Unknown panel '{part}'. Known: all, {', '.join(panels['panels'])}")
        seeds += entry["seeds"]
    if len(set(seeds)) != len(seeds):
        raise ValueError(f"Panel '{name}' repeats a seed")
    return seeds


def champion_weeks(champion, rows, seeds):
    """Champion week per seed: the committed file first, then local champion runs of the same source and settings."""
    weeks, missing = {}, []
    for seed in seeds:
        if seed in champion["weeks"]:
            weeks[seed] = validate_row({**champion["weeks"][seed], "seed": seed, "revision": champion["revision"], "settings": champion["settings"]})
            continue
        local = [row for row in rows if row.get("seed") == seed and row.get("label") == CHAMPION_LABEL
                 and row.get("revision") == champion["revision"] and row.get("settings") == champion["settings"]]
        if local:
            weeks[seed] = validate_row(local[-1])
        else:
            missing.append(seed)
    if missing:
        raise ValueError(f"No champion week for {', '.join(missing)}. On the champion commit run: gate.py plan --champion --panel PANEL, then the study, then gate.py baseline --panel PANEL")
    return weeks


def candidate_weeks(rows, label, seeds):
    """Latest finished week per seed under one label; the label must stand for one source revision and one setting vector."""
    weeks, missing = {}, []
    for seed in seeds:
        matches = [row for row in rows if row.get("label") == label and row.get("seed") == seed]
        if matches:
            weeks[seed] = validate_row(matches[-1])
        else:
            missing.append(seed)
    if missing:
        raise ValueError(f"No finished '{label}' week for {', '.join(missing)}")
    versions = {(week["revision"], json.dumps(week["settings"], sort_keys=True)) for week in weeks.values()}
    if len(versions) != 1:
        raise ValueError(f"'{label}' mixes source revisions or settings. Rerun the whole panel under a new label")
    return weeks


def evaluate(champion, panels, rows, label, panel):
    seeds = panel_seeds(panels, panel)
    base = champion_weeks(champion, rows, seeds)
    candidate = candidate_weeks(rows, label, seeds)
    first = candidate[seeds[0]]
    if first["revision"] == champion["revision"] and first["settings"] == champion["settings"]:
        raise ValueError(f"'{label}' is the champion itself: same source and settings")
    pairs = [{"seed": seed, "champion": base[seed], "candidate": candidate[seed],
              "differenceCents": candidate[seed]["marginCents"] - base[seed]["marginCents"]} for seed in seeds]
    differences = [pair["differenceCents"] for pair in pairs]
    rng = random.Random(BOOTSTRAP_SEED)
    means = sorted(statistics.mean(rng.choices(differences, k=len(differences))) for _ in range(BOOTSTRAP_SAMPLES))
    wins = sum(value > 0 for value in differences)
    losses = sum(value < 0 for value in differences)
    after = summarize([pair["candidate"] for pair in pairs])
    rule = panels["rule"]
    allowed_losses = int(len(seeds) * rule["maxLosingShare"])
    reasons = []
    if after["qualifiedWeeks"] != len(seeds):
        reasons.append(f"{len(seeds) - after['qualifiedWeeks']} week(s) not ranked: under 90% on time or no order won")
    if after["minOnTimeShare"] < rule["minOnTimeShare"]:
        reasons.append(f"lowest on-time share {after['minOnTimeShare']:.2%} is under the {rule['minOnTimeShare']:.0%} guard")
    if statistics.mean(differences) < rule["minMeanGainCents"]:
        reasons.append(f"mean gain {money(statistics.mean(differences), signed=True)} a week is under {money(rule['minMeanGainCents'], signed=True)}")
    if losses > allowed_losses:
        reasons.append(f"margin fell on {losses} of {len(seeds)} weeks; at most {allowed_losses} allowed")
    return {
        "label": label, "panel": panel, "verdict": "FAIL" if reasons else "PASS", "reasons": reasons, "rule": rule,
        "championRevision": champion["revision"], "candidateRevision": first["revision"],
        "candidateSettings": first["settings"],
        "settingsChanged": {key: value for key, value in first["settings"].items() if champion["settings"].get(key) != value},
        "sourceChanged": first["revision"] != champion["revision"],
        "champion": summarize([pair["champion"] for pair in pairs]), "candidate": after,
        "paired": {
            "meanDifferenceCents": statistics.mean(differences), "minDifferenceCents": min(differences),
            "maxDifferenceCents": max(differences), "wins": wins, "losses": losses,
            "meanDifferenceBootstrap95Cents": [percentile(means, 0.025), percentile(means, 0.975)],
        },
        "weeks": pairs,
    }


def money(cents, signed=False):
    sign = "−" if cents < 0 else "+" if signed else ""
    return f"{sign}€{abs(cents) / 100:,.2f}"


def markdown(report, idea="", owner="", when=""):
    b, c, p = report["champion"], report["candidate"], report["paired"]
    low, high = p["meanDifferenceBootstrap95Cents"]
    changed = []
    if report["sourceChanged"]:
        changed.append(f"source `{report['candidateRevision'][:12]}`")
    if report["settingsChanged"]:
        changed.append("settings " + ", ".join(f"`{key}={json.dumps(value)}`" for key, value in report["settingsChanged"].items()))
    lines = [f"# {report['label']} on panel {report['panel']}: {report['verdict']}", ""]
    if idea:
        lines += [f"**Idea:** {idea}", ""]
    lines += [f"**Owner:** {owner or 'not given'} · **Checked:** {when or 'not recorded'} · **Changed against champion `{report['championRevision'][:12]}`:** {'; '.join(changed)}", "",
              f"Mean margin {money(c['meanMarginCents'])} a week against {money(b['meanMarginCents'])} for the champion on the same {c['weeks']} weeks at level 8: {money(p['meanDifferenceCents'], signed=True)} a week. "
              f"Margin rose on {p['wins']} weeks and fell on {p['losses']}. Lowest on-time share {c['minOnTimeShare']:.2%} against {b['minOnTimeShare']:.2%}. Ranked weeks {c['qualifiedWeeks']}/{c['weeks']}.", "",
              "| Seed | Champion margin | Candidate margin | Difference | On time, champion / candidate | Orders, champion / candidate |",
              "| --- | ---: | ---: | ---: | ---: | ---: |"]
    for pair in report["weeks"]:
        old, new = pair["champion"], pair["candidate"]
        lines.append(f"| {pair['seed']} | {money(old['marginCents'])} | {money(new['marginCents'])} | {money(pair['differenceCents'], signed=True)} | {old['onTimeShare']:.2%} / {new['onTimeShare']:.2%} | {old['wonOrders']} / {new['wonOrders']} |")
    lines += ["", f"Paired 95% bootstrap interval of the mean difference: [{money(low, signed=True)}, {money(high, signed=True)}], whole weeks resampled. With this few weeks it is a description, not a guarantee.", ""]
    if report["reasons"]:
        lines += ["**Why it fails:** " + "; ".join(report["reasons"]) + ".", ""]
    return "\n".join(lines)


def source_revision(root=ROOT):
    """The revision that src/run.ts records: SHA-256 over the name and bytes of every src/*.ts file."""
    digest = hashlib.sha256()
    for path in sorted((root / "src").glob("*.ts"), key=lambda item: item.name):
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def code_defaults(root=ROOT):
    """The default settings in src/policy.ts, which `npm run final` plays."""
    text = (root / "src/policy.ts").read_text(encoding="utf-8")
    found = re.search(r"export const defaults: Settings = \{(.*?)\n\}", text, re.S)
    if not found:
        raise ValueError("Cannot find `export const defaults: Settings = {...}` in src/policy.ts")
    try:
        return json.loads("{" + re.sub(r"(\w+):", r'"\1":', found.group(1)).rstrip().rstrip(",") + "}")
    except json.JSONDecodeError as error:
        raise ValueError(f"Cannot read the defaults in src/policy.ts: {error}") from error


def status(champion, root=ROOT):
    """Problems that make the checked-out source differ from the champion. Empty when `npm run final` plays the champion."""
    problems = []
    if source_revision(root) != champion["revision"]:
        problems.append("src/*.ts differs from the champion source")
    if code_defaults(root) != champion["settings"]:
        problems.append("the defaults in src/policy.ts differ from the champion settings")
    return problems


def promote(champion, panels, rows, label, root=ROOT):
    """New champion file from a candidate that passes every week of screen and confirm and is what the checkout plays by default."""
    report = evaluate(champion, panels, rows, label, "all")
    if report["verdict"] != "PASS":
        raise ValueError("Only a candidate that passes panel 'all' becomes champion: " + "; ".join(report["reasons"]))
    if source_revision(root) != report["candidateRevision"]:
        raise ValueError("Check out the candidate's exact source before promoting: src/*.ts differs from the weeks under this label")
    if code_defaults(root) != report["candidateSettings"]:
        raise ValueError("Put the candidate's settings into `defaults` in src/policy.ts, rerun panel 'all' with empty settings under a new label, and promote that label")
    weeks = {pair["seed"]: {key: pair["candidate"][key] for key in WEEK_KEYS} for pair in report["weeks"]}
    for name in panels["panels"]:
        if name in ("screen", "confirm"):
            continue
        for seed in panels["panels"][name]["seeds"]:
            extra = [row for row in rows if row.get("label") == label and row.get("seed") == seed
                     and row.get("revision") == report["candidateRevision"] and row.get("settings") == report["candidateSettings"]]
            if extra:
                weeks[seed] = {key: validate_row(extra[-1])[key] for key in WEEK_KEYS}
    return {
        "label": CHAMPION_LABEL, "promotedFrom": label,
        "revision": report["candidateRevision"], "settings": report["candidateSettings"],
        "previous": {"revision": champion["revision"], "meanMarginCentsOnAll": report["champion"]["meanMarginCents"]},
        "meanMarginCentsOnAll": report["candidate"]["meanMarginCents"],
        "weeks": weeks,
    }


def baseline(champion, panels, rows, panel):
    """Champion file extended with locally played champion weeks of one panel, so that teammates need not replay them."""
    weeks = champion_weeks(champion, rows, panel_seeds(panels, panel))
    return {**champion, "weeks": {**champion["weeks"], **{seed: {key: week[key] for key in WEEK_KEYS} for seed, week in weeks.items()}}}


def parse_settings(pairs):
    settings = {}
    for pair in pairs:
        key, separator, value = pair.partition("=")
        if not separator or not key:
            raise ValueError(f"Write settings as key=value, not '{pair}'")
        try:
            settings[key] = json.loads(value)
        except json.JSONDecodeError as error:
            raise ValueError(f"'{value}' is not a number or true/false in '{pair}'") from error
        if not isinstance(settings[key], (bool, int, float)):
            raise ValueError(f"'{pair}' must be a number or true/false")
    return settings


def read_rows(path):
    if not path.exists():
        return []
    rows = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as error:
            raise ValueError(f"Invalid results JSON on line {number}: {error}") from error
        if isinstance(row, dict):
            rows.append(row)
    return rows


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--results", type=Path, default=ROOT / "runs/results.jsonl")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("status", help="does this checkout play the champion?")
    plan = commands.add_parser("plan", help="write a study plan for one candidate on one panel")
    plan.add_argument("--label")
    plan.add_argument("--panel", required=True)
    plan.add_argument("--set", action="append", default=[], metavar="KEY=VALUE", help="setting override; repeat for several")
    plan.add_argument("--champion", action="store_true", help="plan the champion's missing weeks instead; run it on the champion commit")
    check = commands.add_parser("check", help="compare a finished candidate with the champion")
    check.add_argument("--label", required=True)
    check.add_argument("--panel", required=True)
    check.add_argument("--idea", default="")
    check.add_argument("--owner", default="")
    check.add_argument("--record", action="store_true", help="write docs/journal/LABEL-PANEL.md and .json")
    promotion = commands.add_parser("promote", help="make a passing candidate the champion")
    promotion.add_argument("--label", required=True)
    base = commands.add_parser("baseline", help="add locally played champion weeks of a panel to the champion file")
    base.add_argument("--panel", required=True)
    args = parser.parse_args()
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")
    try:
        champion = json.loads((ROOT / "experiments/champion.json").read_text(encoding="utf-8"))
        panels = json.loads((ROOT / "experiments/panels.json").read_text(encoding="utf-8"))
        if args.command == "status":
            problems = status(champion)
            print(f"Champion {champion['revision'][:12]}, mean {money(champion['meanMarginCentsOnAll'])} a week on panel all.")
            print("This checkout plays the champion by default." if not problems else "This checkout is NOT the champion: " + "; ".join(problems) + ".")
            return
        if args.command == "plan":
            label = CHAMPION_LABEL if args.champion else args.label
            if not args.champion and (not label or not LABEL.match(label) or label == CHAMPION_LABEL):
                raise ValueError("--label must be 2–41 characters of a–z, 0–9 and hyphen, and not 'champion'")
            seeds = panel_seeds(panels, args.panel)
            if args.champion:
                if args.set:
                    raise ValueError("The champion runs with its own defaults; drop --set")
                seeds = [seed for seed in seeds if seed not in champion["weeks"]]
                if not seeds:
                    raise ValueError(f"The champion already has every week of panel '{args.panel}'")
            trials = [{"label": label, "seed": seed, "settings": parse_settings(args.set)} for seed in seeds]
            target = ROOT / f"experiments/plans/{label}-{args.panel}.json"
            write_json(target, trials)
            print(f"{len(trials)} weeks planned. Run:\n  node experiments/study.ts --plan {target.relative_to(ROOT).as_posix()} --jobs 2")
            return
        rows = read_rows(args.results)
        if args.command == "check":
            report = evaluate(champion, panels, rows, args.label, args.panel)
            when = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            text = markdown(report, args.idea, args.owner, when)
            print(text)
            if args.record:
                write_json(ROOT / f"docs/journal/{args.label}-{args.panel}.json", {**report, "idea": args.idea, "owner": args.owner, "checkedAt": when})
                (ROOT / f"docs/journal/{args.label}-{args.panel}.md").write_text(text, encoding="utf-8", newline="\n")
                print(f"Recorded in docs/journal/{args.label}-{args.panel}.md. Commit it with your pull request, pass or fail.")
            parser.exit(0 if report["verdict"] == "PASS" else 1)
        if args.command == "promote":
            write_json(ROOT / "experiments/champion.json", promote(champion, panels, rows, args.label))
            print(f"'{args.label}' is the champion. Commit experiments/champion.json together with its source.")
        if args.command == "baseline":
            write_json(ROOT / "experiments/champion.json", baseline(champion, panels, rows, args.panel))
            print(f"Champion weeks of panel '{args.panel}' added. Commit experiments/champion.json.")
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(2, f"Gate failed: {error}\n")


if __name__ == "__main__":
    main()
