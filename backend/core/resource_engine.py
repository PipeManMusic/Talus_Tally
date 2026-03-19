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


def _parse_manual_allocations(raw_value: Any) -> Dict[str, Dict[str, float]]:
    source = raw_value
    if isinstance(source, str):
        try:
            source = json.loads(source)
        except (TypeError, ValueError):
            source = {}

    if not isinstance(source, dict):
        return {}

    parsed: Dict[str, Dict[str, float]] = {}
    for day, day_alloc in source.items():
        if not isinstance(day_alloc, dict):
            continue
        normalized_day: Dict[str, float] = {}
        for person_id, hours_raw in day_alloc.items():
            hours = _to_float(hours_raw, 0.0)
            if hours <= 0:
                continue
            normalized_day[str(person_id)] = hours
        if normalized_day:
            parsed[str(day)] = normalized_day
    return parsed


def _iter_schedulable_tasks(node_list: List[Any], people_ids: set[str]) -> List[Dict[str, Any]]:
    tasks: List[Dict[str, Any]] = []

    for node in node_list:
        props = _node_properties(node)
        assigned_to_values = _parse_assigned_to_values(props.get("assigned_to"))
        assigned_person_ids = [person_id for person_id in assigned_to_values if person_id in people_ids]
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

        tasks.append(
            {
                "node": node,
                "node_id": _node_id(node),
                "name": _node_name(node),
                "estimated_hours": estimated_hours,
                "assigned_person_ids": assigned_person_ids,
                "start_date": start_date,
                "end_date": end_date,
                "days_in_window": days_in_window,
                "manual_allocations": _parse_manual_allocations(props.get("manual_allocations")),
            }
        )

    return tasks


def _allocation_status(allocated_hours: float, target_hours: float, epsilon: float = 1e-6) -> str:
    delta = allocated_hours - target_hours
    if delta > epsilon:
        return "over"
    if delta < -epsilon:
        return "under"
    return "full"


def _build_people_resources(node_list: List[Any]) -> Dict[str, Dict[str, Any]]:
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
    return people


def recalculate_manpower_allocations(nodes: Iterable[Any]) -> Dict[str, Any]:
    """
    Recalculate and persist manual allocations for all schedulable tasks.

    Rules:
    - Explicit action only (never called from normal payload fetches).
    - Distributes each assignee's share only across Monday-Friday.
    - Uses regular capacity days only (ignores overtime for auto allocation).
    - Overwrites `manual_allocations` for each recalculated task.
    """
    node_list = list(nodes or [])
    people = _build_people_resources(node_list)
    tasks = _iter_schedulable_tasks(node_list, set(people.keys()))

    updated_task_count = 0

    for task in tasks:
        per_person_target = task["estimated_hours"] / len(task["assigned_person_ids"])
        next_manual: Dict[str, Dict[str, float]] = {}

        for person_id in task["assigned_person_ids"]:
            person_weekday_capacity = people[person_id]["weekday_capacity"]
            auto_days: List[str] = []
            for day in task["days_in_window"]:
                weekday_index = datetime.strptime(day, "%Y-%m-%d").weekday()
                if weekday_index >= 5:
                    continue
                if person_weekday_capacity.get(weekday_index, 0.0) <= 0:
                    continue
                auto_days.append(day)

            if not auto_days:
                continue

            daily_hours = per_person_target / len(auto_days)
            for day in auto_days:
                day_bucket = next_manual.setdefault(day, {})
                day_bucket[person_id] = daily_hours

        props = _node_properties(task["node"])
        if props.get("manual_allocations") != next_manual:
            props["manual_allocations"] = next_manual
            updated_task_count += 1

    return {
        "updated_tasks": updated_task_count,
        "total_tasks": len(tasks),
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
    people = _build_people_resources(node_list)

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
    task_allocations: List[Dict[str, Any]] = []

    for task in _iter_schedulable_tasks(node_list, set(resources.keys())):
        per_person_target = task["estimated_hours"] / len(task["assigned_person_ids"])
        task_total_allocated = 0.0

        for person_id in task["assigned_person_ids"]:
            person_allocated = 0.0
            for day in task["days_in_window"]:
                if day not in resources[person_id]["load"]:
                    continue
                day_alloc = task["manual_allocations"].get(day)
                if not isinstance(day_alloc, dict):
                    continue
                hours = _to_float(day_alloc.get(person_id), 0.0)
                if hours <= 0:
                    continue
                person_allocated += hours
                bucket = resources[person_id]["load"].setdefault(day, _empty_load_bucket())
                bucket["total"] += hours
                bucket["tasks"].append(
                    {
                        "id": task["node_id"],
                        "name": task["name"],
                        "hours": hours,
                    }
                )

            task_total_allocated += person_allocated
            task_allocations.append(
                {
                    "node_id": task["node_id"],
                    "name": task["name"],
                    "person_id": person_id,
                    "target_hours": per_person_target,
                    "allocated_hours": person_allocated,
                    "status": _allocation_status(person_allocated, per_person_target),
                }
            )

        delta = task["estimated_hours"] - task_total_allocated
        if abs(delta) > 1e-6:
            unallocated_tasks.append(
                {
                    "node_id": task["node_id"],
                    "name": task["name"],
                    "start_date": task["start_date"].isoformat(),
                    "end_date": task["end_date"].isoformat(),
                    "estimated_hours": task["estimated_hours"],
                    "unallocated_hours": delta,
                    "assigned_to": task["assigned_person_ids"],
                    "status": "under" if delta > 0 else "over",
                }
            )

    return {
        "date_columns": date_columns,
        "resources": resources,
        "unallocated_tasks": unallocated_tasks,
        "task_allocations": task_allocations,
    }
