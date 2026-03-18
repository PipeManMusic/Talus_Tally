from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple


WEEKDAY_FIELD_BY_INDEX = {
    0: "capacity_monday",
    1: "capacity_tuesday",
    2: "capacity_wednesday",
    3: "capacity_thursday",
    4: "capacity_friday",
    5: "capacity_saturday",
    6: "capacity_sunday",
}


def _node_id(node: Any) -> str:
    if isinstance(node, dict):
        return str(node.get("id", ""))
    return str(getattr(node, "id", ""))


def _node_type(node: Any) -> str:
    if isinstance(node, dict):
        return str(node.get("type") or node.get("blueprint_type_id") or "")
    return str(getattr(node, "type", getattr(node, "blueprint_type_id", "")) or "")


def _node_name(node: Any) -> str:
    if isinstance(node, dict):
        props = node.get("properties") or {}
        return str(props.get("name") or node.get("name") or _node_id(node))
    props = getattr(node, "properties", {}) or {}
    return str(props.get("name") or getattr(node, "name", "") or _node_id(node))


def _node_properties(node: Any) -> Dict[str, Any]:
    if isinstance(node, dict):
        props = node.get("properties")
        return props if isinstance(props, dict) else {}
    props = getattr(node, "properties", None)
    return props if isinstance(props, dict) else {}


def _parse_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()

    raw = str(value).strip()
    if not raw:
        return None

    if "T" in raw:
        raw = raw.split("T", 1)[0]

    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        return None


def _date_columns(start: date, end: date) -> List[str]:
    if start > end:
        start, end = end, start
    days = (end - start).days + 1
    return [(start + timedelta(days=i)).isoformat() for i in range(days)]


def _parse_assigned_to_values(value: Any) -> List[str]:
    if value is None:
        return []

    if isinstance(value, (list, tuple, set)):
        return [str(item).strip() for item in value if str(item).strip()]

    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return []

        if raw.startswith("[") and raw.endswith("]"):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            except (TypeError, ValueError):
                pass

        if "," in raw:
            return [item.strip() for item in raw.split(",") if item.strip()]

        return [raw]

    coerced = str(value).strip()
    return [coerced] if coerced else []


def _to_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _build_weekday_capacity_profile(props: Dict[str, Any]) -> Dict[int, float]:
    daily_capacity_value = props.get("daily_capacity")
    if daily_capacity_value is not None:
        daily_capacity = _to_float(daily_capacity_value or 8, 8.0)
        return {weekday: daily_capacity for weekday in WEEKDAY_FIELD_BY_INDEX}

    provided: Dict[int, float] = {}
    for weekday, field_name in WEEKDAY_FIELD_BY_INDEX.items():
        raw_value = props.get(field_name)
        if raw_value is None:
            continue
        try:
            provided[weekday] = float(raw_value)
        except (TypeError, ValueError):
            continue

    if not provided:
        return {weekday: 8.0 for weekday in WEEKDAY_FIELD_BY_INDEX}

    fallback_capacity = sum(provided.values()) / len(provided)
    return {weekday: provided.get(weekday, fallback_capacity) for weekday in WEEKDAY_FIELD_BY_INDEX}


def _build_weekday_overtime_profile(props: Dict[str, Any]) -> Dict[int, float]:
    provided: Dict[int, float] = {}
    for weekday, field_name in WEEKDAY_FIELD_BY_INDEX.items():
        raw_value = props.get(f"overtime_{field_name}")
        if raw_value is None:
            continue
        try:
            provided[weekday] = max(0.0, float(raw_value))
        except (TypeError, ValueError):
            continue

    if provided:
        fallback_capacity = sum(provided.values()) / len(provided)
        return {weekday: provided.get(weekday, fallback_capacity) for weekday in WEEKDAY_FIELD_BY_INDEX}

    overtime_capacity = max(0.0, _to_float(props.get("overtime_capacity") or 0, 0.0))
    return {weekday: overtime_capacity for weekday in WEEKDAY_FIELD_BY_INDEX}


def _find_project_bounds(nodes: Iterable[Any]) -> Tuple[Optional[date], Optional[date]]:
    project_start: Optional[date] = None
    project_end: Optional[date] = None

    for node in nodes:
        node_type = _node_type(node)
        if node_type not in {"project_root", "project"}:
            continue

        props = _node_properties(node)
        project_start = (
            _parse_date(props.get("project_start"))
            or _parse_date(props.get("project_start_date"))
            or _parse_date(props.get("start_date"))
        )
        project_end = (
            _parse_date(props.get("project_end"))
            or _parse_date(props.get("project_end_date"))
            or _parse_date(props.get("end_date"))
        )
        if project_start and project_end:
            return project_start, project_end

    # Fallback to schedulable-node-derived bounds if master project dates are unavailable
    task_starts: List[date] = []
    task_ends: List[date] = []
    for node in nodes:
        props = _node_properties(node)
        start = _parse_date(props.get("start_date"))
        end = _parse_date(props.get("end_date"))
        if start and end:
            task_starts.append(start)
            task_ends.append(end)

    if not task_starts or not task_ends:
        return None, None

    return min(task_starts), max(task_ends)


def _empty_load_bucket() -> Dict[str, Any]:
    return {
        "total": 0.0,
        "tasks": [],
    }


def calculate_manpower_load(nodes: Iterable[Any]) -> Dict[str, Any]:
    """
    Calculate day-by-day manpower loading for person resources.

    Rules:
    - Person nodes are first-class resources (type == 'person').
        - Work nodes contribute load when they have:
      * estimated_hours > 0
      * valid start_date and end_date
      * assigned_to referencing an existing person node
        - Allocation is constrained by each person's day-specific capacity.
        - If the scheduling window lacks enough capacity, remaining hours are reported.
    """
    node_list = list(nodes or [])

    people: Dict[str, Dict[str, Any]] = {}
    for node in node_list:
        if _node_type(node) != "person":
            continue

        node_id = _node_id(node)
        if not node_id:
            continue

        props = _node_properties(node)
        weekday_capacity_profile = _build_weekday_capacity_profile(props)
        weekday_overtime_profile = _build_weekday_overtime_profile(props)
        capacity = sum(weekday_capacity_profile.values()) / len(weekday_capacity_profile)
        overtime_capacity = sum(weekday_overtime_profile.values()) / len(weekday_overtime_profile)

        people[node_id] = {
            "name": _node_name(node),
            "capacity": capacity,
            "overtime_capacity": overtime_capacity,
            "weekday_capacity": weekday_capacity_profile,
            "weekday_overtime_capacity": weekday_overtime_profile,
            "load": {},
        }

    start, end = _find_project_bounds(node_list)
    if not start or not end:
        return {
            "date_columns": [],
            "resources": {
                pid: {
                    "name": pdata["name"],
                    "capacity": pdata["capacity"],
                    "overtime_capacity": pdata["overtime_capacity"],
                    "capacity_by_day": {},
                    "overtime_capacity_by_day": {},
                    "load": {},
                }
                for pid, pdata in people.items()
            },
        }

    date_columns = _date_columns(start, end)

    resources: Dict[str, Dict[str, Any]] = {}
    for person_id, person_data in people.items():
        capacity_by_day = {
            day: person_data["weekday_capacity"][datetime.strptime(day, "%Y-%m-%d").weekday()]
            for day in date_columns
        }
        overtime_capacity_by_day = {
            day: person_data["weekday_overtime_capacity"][datetime.strptime(day, "%Y-%m-%d").weekday()]
            for day in date_columns
        }
        resources[person_id] = {
            "name": person_data["name"],
            "capacity": person_data["capacity"],
            "overtime_capacity": person_data["overtime_capacity"],
            "capacity_by_day": capacity_by_day,
            "overtime_capacity_by_day": overtime_capacity_by_day,
            "load": {day: _empty_load_bucket() for day in date_columns},
        }

    unallocated_tasks: List[Dict[str, Any]] = []

    for node in node_list:
        props = _node_properties(node)
        assigned_to_values = _parse_assigned_to_values(props.get("assigned_to"))
        assigned_person_ids = [person_id for person_id in assigned_to_values if person_id in resources]
        if not assigned_person_ids:
            continue

        estimated_hours = _to_float(props.get("estimated_hours") or 0, 0.0)
        if estimated_hours <= 0:
            continue

        start_date = _parse_date(props.get("start_date"))
        end_date = _parse_date(props.get("end_date"))
        if not start_date or not end_date:
            continue

        if end_date < start_date:
            start_date, end_date = end_date, start_date

        duration_days = (end_date - start_date).days + 1
        if duration_days <= 0:
            continue

        days_in_window = [
            (start_date + timedelta(days=idx)).isoformat()
            for idx in range(duration_days)
        ]

        # Parse manual_allocations: {"YYYY-MM-DD": {"person_id": hours}}
        raw_manual = props.get("manual_allocations")
        if isinstance(raw_manual, str):
            try:
                raw_manual = json.loads(raw_manual)
            except (TypeError, ValueError):
                raw_manual = {}
        if not isinstance(raw_manual, dict):
            raw_manual = {}

        # Remainder math: each person gets an equal share, with manual overrides reducing the auto pool
        person_total = estimated_hours / len(assigned_person_ids)

        for person_id in assigned_person_ids:
            # Collect manual overrides for this person within the task's date span
            person_manual: Dict[str, float] = {}
            for day in days_in_window:
                day_alloc = raw_manual.get(day)
                if isinstance(day_alloc, dict) and person_id in day_alloc:
                    try:
                        person_manual[day] = float(day_alloc[person_id])
                    except (TypeError, ValueError):
                        pass

            total_manual = sum(person_manual.values())
            manual_days_count = len(person_manual)
            remaining = max(0.0, person_total - total_manual)
            auto_days_count = duration_days - manual_days_count
            daily_auto = remaining / auto_days_count if auto_days_count > 0 else 0.0

            # Track tasks where manual overrides consume all days but hours remain unallocated
            if auto_days_count == 0 and remaining > 1e-6:
                unallocated_tasks.append(
                    {
                        "node_id": _node_id(node),
                        "name": _node_name(node),
                        "start_date": start_date.isoformat(),
                        "end_date": end_date.isoformat(),
                        "estimated_hours": estimated_hours,
                        "unallocated_hours": remaining,
                        "assigned_to": assigned_person_ids,
                    }
                )

            for day in days_in_window:
                if day not in resources[person_id]["load"]:
                    continue
                hours = person_manual.get(day, daily_auto)
                bucket = resources[person_id]["load"].setdefault(day, _empty_load_bucket())
                bucket["total"] += hours
                bucket["tasks"].append(
                    {
                        "id": _node_id(node),
                        "name": _node_name(node),
                        "hours": hours,
                    }
                )

    return {
        "date_columns": date_columns,
        "resources": resources,
        "unallocated_tasks": unallocated_tasks,
    }
