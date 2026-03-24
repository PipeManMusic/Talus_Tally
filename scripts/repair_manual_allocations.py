#!/usr/bin/env python3
"""
Repair malformed `manual_allocations` values in project JSON files.

What it fixes:
- literal string "[object Object]" -> {}
- JSON-string encoded maps -> parsed object map
- single-quoted map strings -> parsed object map
- non-finite / non-numeric hours -> removed
- invalid day/shape entries -> removed

Usage:
  python scripts/repair_manual_allocations.py --file project_talus.json --dry-run
  python scripts/repair_manual_allocations.py --file project_talus.json --write
"""

from __future__ import annotations

import argparse
import json
import math
import re
from copy import deepcopy
from pathlib import Path
from typing import Any


def _looks_like_ymd(value: str) -> bool:
    return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", value))


def _parse_manual_allocations_raw(raw: Any) -> dict[str, dict[str, float]]:
    source = raw

    if isinstance(source, str):
        trimmed = source.strip()
        if not trimmed:
            return {}

        try:
            source = json.loads(trimmed)
        except Exception:
            try:
                source = json.loads(trimmed.replace("'", '"'))
            except Exception:
                return {}

    if not isinstance(source, dict):
        return {}

    parsed: dict[str, dict[str, float]] = {}
    for day_key, day_alloc in source.items():
        day = str(day_key).strip()
        if not _looks_like_ymd(day):
            continue
        if not isinstance(day_alloc, dict):
            continue

        day_map: dict[str, float] = {}
        for person_key, hours_raw in day_alloc.items():
            person_id = str(person_key).strip()
            if not person_id:
                continue
            try:
                hours = float(hours_raw)
            except Exception:
                continue
            if not math.isfinite(hours):
                continue
            if hours <= 0:
                continue
            day_map[person_id] = hours

        if day_map:
            parsed[day] = day_map

    return parsed


def _iter_nodes(doc: dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(doc.get("graph"), dict) and isinstance(doc["graph"].get("nodes"), list):
        return [n for n in doc["graph"]["nodes"] if isinstance(n, dict)]
    if isinstance(doc.get("nodes"), list):
        return [n for n in doc["nodes"] if isinstance(n, dict)]
    return []


def repair_file(path: Path, write: bool) -> tuple[int, int]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    nodes = _iter_nodes(data)
    fixed_nodes = 0
    examined_nodes = 0

    for node in nodes:
        props = node.get("properties")
        if not isinstance(props, dict):
            continue
        if "manual_allocations" not in props:
            continue

        examined_nodes += 1
        current = props.get("manual_allocations")
        normalized = _parse_manual_allocations_raw(current)

        if current != normalized:
            props["manual_allocations"] = normalized
            fixed_nodes += 1

    if write and fixed_nodes > 0:
        with path.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")

    return examined_nodes, fixed_nodes


def main() -> int:
    parser = argparse.ArgumentParser(description="Repair malformed manual_allocations in project JSON files")
    parser.add_argument("--file", required=True, help="Path to project JSON file")
    parser.add_argument("--dry-run", action="store_true", help="Report changes without writing")
    parser.add_argument("--write", action="store_true", help="Write repaired content back to file")
    args = parser.parse_args()

    if args.dry_run and args.write:
        raise SystemExit("Choose either --dry-run or --write, not both")

    mode_write = args.write and not args.dry_run
    path = Path(args.file).expanduser().resolve()
    if not path.exists():
        raise SystemExit(f"File not found: {path}")

    examined, fixed = repair_file(path, write=mode_write)

    mode_label = "WRITE" if mode_write else "DRY-RUN"
    print(f"[{mode_label}] file={path}")
    print(f"[{mode_label}] manual_allocations examined={examined} repaired={fixed}")
    if not mode_write and fixed > 0:
        print("Run again with --write to apply repairs.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
