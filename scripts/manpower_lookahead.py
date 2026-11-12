#!/usr/bin/env python3
"""
Four-week manpower lookahead report.

Reads a Talus Tally project file (JSON) and the blueprint template it was
built from (YAML), then summarizes — week by week, person by person —
what each assignee is expected to be working on, how many hours they are
allocated, and whether they are over their available capacity.

Intended for handing to a manager for short-range manpower planning.

Examples
--------

# Default: 4 weeks starting from this past Monday, Markdown to stdout
python scripts/manpower_lookahead.py \\
    --project data/examples/ProtonTherapy.json \\
    --template data/examples/DetailingProject.yaml

# Pin a starting Monday and write to a file
python scripts/manpower_lookahead.py \\
    --project data/examples/5622314-MBCCMOB.json \\
    --template data/examples/DetailingProject.yaml \\
    --start 2026-05-11 \\
    --weeks 4 \\
    --out reports/MBCCMOB_lookahead.md

# CSV instead of Markdown
python scripts/manpower_lookahead.py \\
    --project data/examples/ProtonTherapy.json \\
    --template data/examples/DetailingProject.yaml \\
    --format csv --out lookahead.csv
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Make `backend` importable when run from the repo root or scripts/.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.core.resource_engine import (  # noqa: E402
    calculate_manpower_load,
    slice_manpower_load_into_weeks,
)
from backend.infra.schema_loader import SchemaLoader  # noqa: E402


OVERLOAD_THRESHOLD = 1.0  # ratio of allocated/capacity at which we flag


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


def _load_project(path: Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8-sig") as fh:
        return json.load(fh)


def _person_type_ids(blueprint) -> set:
    """Node type UUIDs marked as people via the is_person feature."""
    ids: set = set()
    for nt in blueprint.node_types:
        if nt.has_feature("is_person"):
            ids.add(nt.uuid)
            if nt.id:
                ids.add(nt.id)
    return ids


# ---------------------------------------------------------------------------
# Window math
# ---------------------------------------------------------------------------


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _build_weeks(start_monday: date, weeks: int) -> List[Tuple[date, date]]:
    out: List[Tuple[date, date]] = []
    for w in range(weeks):
        ws = start_monday + timedelta(days=7 * w)
        we = ws + timedelta(days=6)
        out.append((ws, we))
    return out


def _iso_days_between(start: date, end: date) -> List[str]:
    days = (end - start).days + 1
    return [(start + timedelta(days=i)).isoformat() for i in range(days)]


# ---------------------------------------------------------------------------
# Report assembly
# ---------------------------------------------------------------------------


def build_lookahead(
    project_path: Path,
    template_path: Path,
    start_monday: date,
    weeks: int,
) -> Dict[str, Any]:
    """Run the manpower engine and slice it into a per-week, per-person view."""
    loader = SchemaLoader()
    blueprint = loader.load(str(template_path))

    project = _load_project(project_path)
    nodes = project.get("graph", {}).get("nodes", []) or []

    load_result = calculate_manpower_load(
        nodes,
        person_type_ids=_person_type_ids(blueprint),
        blueprint=blueprint,
    )

    sliced = slice_manpower_load_into_weeks(
        load_result, start=start_monday, weeks=weeks, overload_threshold=OVERLOAD_THRESHOLD
    )

    return {
        "project_path": str(project_path),
        "template_path": str(template_path),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "window": sliced["window"],
        "people": sliced["people"],
        "unassigned_tasks": sliced["unassigned_tasks"],
        "unallocated_tasks": sliced["unallocated_tasks"],
    }


# ---------------------------------------------------------------------------
# Renderers
# ---------------------------------------------------------------------------


_STATUS_LABEL = {
    "over": "OVERLOADED",
    "no_capacity": "OVERLOADED (no capacity)",
    "full": "Full",
    "ok": "OK",
    "idle": "Idle",
}


def render_markdown(report: Dict[str, Any]) -> str:
    out = io.StringIO()
    p = lambda *a: print(*a, file=out)

    win = report["window"]
    project_name = Path(report["project_path"]).stem
    p(f"# Four-Week Manpower Lookahead — {project_name}")
    p()
    p(f"- **Window:** {win['start']} → {win['end']}")
    p(f"- **Project file:** `{report['project_path']}`")
    p(f"- **Template:** `{report['template_path']}`")
    p(f"- **Generated:** {report['generated_at']}")
    p()

    # --- Summary table ---
    p("## Summary")
    p()
    header = ["Person"] + [
        f"Wk {i+1}\n({w['start']})" for i, w in enumerate(win["weeks"])
    ] + ["Total Alloc", "Total Capacity", "Over By"]
    # Markdown: replace newlines in headers with <br>
    p("| " + " | ".join(h.replace("\n", "<br>") for h in header) + " |")
    p("|" + "|".join(["---"] * len(header)) + "|")
    for person in report["people"]:
        if not person["has_load_in_window"] and person["totals"]["capacity_hours"] == 0:
            continue
        cells = [person["name"]]
        for w in person["weeks"]:
            alloc = w["allocated_hours"]
            cap = w["capacity_hours"]
            tag = ""
            if w["status"] == "over" or w["status"] == "no_capacity":
                tag = " ⚠"
            cells.append(f"{alloc:g} / {cap:g}{tag}")
        t = person["totals"]
        cells.append(f"{t['allocated_hours']:g}")
        cells.append(f"{t['capacity_hours']:g}")
        over = t["over_by"]
        cells.append(f"{over:+g}" if over else "0")
        p("| " + " | ".join(cells) + " |")
    p()
    p("_Cell values are `allocated hours / available capacity`. ⚠ marks weeks where allocation exceeds capacity._")
    p()

    # --- Per-person detail ---
    p("## Per-Person Detail")
    p()
    for person in report["people"]:
        if not person["has_load_in_window"] and person["totals"]["capacity_hours"] == 0:
            continue
        p(f"### {person['name']}")
        p()
        any_overload = any(
            w["status"] in ("over", "no_capacity") for w in person["weeks"]
        )
        if any_overload:
            p("> ⚠ **Overloaded in one or more weeks.**")
            p()
        for i, w in enumerate(person["weeks"], start=1):
            label = _STATUS_LABEL.get(w["status"], w["status"])
            util = (
                f"{int(round(w['utilization'] * 100))}%"
                if w["utilization"] is not None
                else "n/a"
            )
            p(
                f"**Week {i} — {w['week_start']} → {w['week_end']}** "
                f"| {w['allocated_hours']:g}h allocated / "
                f"{w['capacity_hours']:g}h capacity "
                f"({util}) — {label}"
            )
            if w["over_by"] > 0.05:
                ot = w["overtime_capacity_hours"]
                ot_note = (
                    f" (overtime capacity {ot:g}h)" if ot else ""
                )
                p(f"  - Over by **{w['over_by']:g}h**{ot_note}")
            if not w["tasks"]:
                p("  - _No work scheduled._")
            else:
                for t in w["tasks"]:
                    p(
                        f"  - {t['name']} — {t['hours']:g}h "
                        f"across {t['day_count']} day(s)"
                    )
            p()

    # --- Issues ---
    issues_present = bool(report["unassigned_tasks"] or report["unallocated_tasks"])
    if issues_present:
        p("## Schedule Issues in Window")
        p()
    if report["unallocated_tasks"]:
        p("### Tasks whose hours don't fit their date window")
        p()
        p("| Task | Window | Estimated | Unallocated | Assigned |")
        p("|---|---|---|---|---|")
        for t in report["unallocated_tasks"]:
            p(
                f"| {t.get('name','')} "
                f"| {t.get('start_date','')} → {t.get('end_date','')} "
                f"| {t.get('estimated_hours',0):g}h "
                f"| {t.get('unallocated_hours',0):g}h "
                f"| {', '.join(t.get('assigned_to', []) or [])} |"
            )
        p()
    if report["unassigned_tasks"]:
        p("### Tasks with no assignee")
        p()
        p("| Task | Window | Estimated |")
        p("|---|---|---|")
        for t in report["unassigned_tasks"]:
            p(
                f"| {t.get('name','')} "
                f"| {t.get('start_date','')} → {t.get('end_date','')} "
                f"| {t.get('estimated_hours',0):g}h |"
            )
        p()

    if not any(
        person["has_load_in_window"] for person in report["people"]
    ) and not issues_present:
        p("> No manpower allocations or scheduled work fall in this window.")
        p()

    return out.getvalue()


def render_csv(report: Dict[str, Any]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "person",
            "week_start",
            "week_end",
            "allocated_hours",
            "capacity_hours",
            "overtime_capacity_hours",
            "over_by",
            "utilization",
            "status",
            "tasks",
        ]
    )
    for person in report["people"]:
        for wk in person["weeks"]:
            tasks = "; ".join(
                f"{t['name']} ({t['hours']:g}h)" for t in wk["tasks"]
            )
            w.writerow(
                [
                    person["name"],
                    wk["week_start"],
                    wk["week_end"],
                    wk["allocated_hours"],
                    wk["capacity_hours"],
                    wk["overtime_capacity_hours"],
                    wk["over_by"],
                    wk["utilization"] if wk["utilization"] is not None else "",
                    wk["status"],
                    tasks,
                ]
            )
    return buf.getvalue()


def render_json(report: Dict[str, Any]) -> str:
    return json.dumps(report, indent=2, default=str)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_iso_date(value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as e:
        raise argparse.ArgumentTypeError(str(e))


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--project", required=True, type=Path, help="Path to project JSON file."
    )
    ap.add_argument(
        "--template", required=True, type=Path, help="Path to template YAML file."
    )
    ap.add_argument(
        "--start",
        type=_parse_iso_date,
        default=None,
        help="Start date (YYYY-MM-DD). Snapped to the Monday of that week. "
        "Defaults to the Monday of the current week.",
    )
    ap.add_argument(
        "--weeks", type=int, default=4, help="Number of weeks (default 4)."
    )
    ap.add_argument(
        "--format",
        choices=("markdown", "csv", "json"),
        default="markdown",
        help="Output format.",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Write report to this file instead of stdout.",
    )
    args = ap.parse_args(argv)

    if not args.project.exists():
        ap.error(f"Project file not found: {args.project}")
    if not args.template.exists():
        ap.error(f"Template file not found: {args.template}")

    start = args.start or date.today()
    start_monday = _monday_of(start)

    report = build_lookahead(
        project_path=args.project,
        template_path=args.template,
        start_monday=start_monday,
        weeks=args.weeks,
    )

    if args.format == "markdown":
        text = render_markdown(report)
    elif args.format == "csv":
        text = render_csv(report)
    else:
        text = render_json(report)

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text, encoding="utf-8")
        print(f"Wrote {args.format} report to {args.out}")
    else:
        sys.stdout.write(text)

    return 0


if __name__ == "__main__":
    sys.exit(main())
