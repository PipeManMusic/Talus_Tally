from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple


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

    # Fallback to task-derived bounds if master project dates are unavailable
    task_starts: List[date] = []
    task_ends: List[date] = []
    for node in nodes:
        if _node_type(node) != "task":
            continue
        props = _node_properties(node)
        start = _parse_date(props.get("start_date"))
        end = _parse_date(props.get("end_date"))
        if start and end:
            task_starts.append(start)
            task_ends.append(end)

    if not task_starts or not task_ends:
        return None, None

    return min(task_starts), max(task_ends)


def calculate_manpower_load(nodes: Iterable[Any]) -> Dict[str, Any]:
    """
    Calculate day-by-day manpower loading for person resources.

    Rules:
    - Person nodes are first-class resources (type == 'person').
    - Task nodes contribute load when they have:
      * estimated_hours > 0
      * valid start_date and end_date
      * assigned_to referencing an existing person node
    - Daily load is evenly spread across inclusive task duration.
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
        capacity_keys = [
            "capacity_monday",
            "capacity_tuesday",
            "capacity_wednesday",
            "capacity_thursday",
            "capacity_friday",
            "capacity_saturday",
            "capacity_sunday",
        ]

        daily_capacity_value = props.get("daily_capacity")
        if daily_capacity_value is not None:
            try:
                capacity = float(daily_capacity_value or 8)
            except (TypeError, ValueError):
                capacity = 8.0
        else:
            weekday_capacities: List[float] = []
            for key in capacity_keys:
                raw_value = props.get(key)
                if raw_value is None:
                    continue
                try:
                    weekday_capacities.append(float(raw_value))
                except (TypeError, ValueError):
                    continue

            if weekday_capacities:
                capacity = sum(weekday_capacities) / len(weekday_capacities)
            else:
                capacity = 8.0

        people[node_id] = {
            "name": _node_name(node),
            "capacity": capacity,
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
                    "load": {},
                }
                for pid, pdata in people.items()
            },
        }

    date_columns = _date_columns(start, end)

    resources: Dict[str, Dict[str, Any]] = {}
    for person_id, person_data in people.items():
        resources[person_id] = {
            "name": person_data["name"],
            "capacity": person_data["capacity"],
            "load": {day: 0.0 for day in date_columns},
        }

    for node in node_list:
        if _node_type(node) != "task":
            continue

        props = _node_properties(node)
        assigned_to = str(props.get("assigned_to") or "").strip()
        if not assigned_to or assigned_to not in resources:
            continue

        try:
            estimated_hours = float(props.get("estimated_hours") or 0)
        except (TypeError, ValueError):
            continue

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

        daily_hours = estimated_hours / duration_days

        for idx in range(duration_days):
            current_day = (start_date + timedelta(days=idx)).isoformat()
            if current_day not in resources[assigned_to]["load"]:
                continue
            resources[assigned_to]["load"][current_day] += daily_hours

    return {
        "date_columns": date_columns,
        "resources": resources,
    }
