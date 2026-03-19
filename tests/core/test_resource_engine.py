import pytest
from backend.core.resource_engine import calculate_manpower_load, recalculate_manpower_allocations


def _load_total(resource, day):
    return resource["load"][day]["total"]


def _load_tasks(resource, day):
    return resource["load"][day]["tasks"]


def test_calculate_manpower_load_distributes_hours_across_date_span():
    nodes = [
        {
            "id": "project-1",
            "type": "project_root",
            "properties": {
                "name": "Master Project",
                "start_date": "2024-01-01",
                "end_date": "2024-01-03",
            },
        },
        {
            "id": "person-1",
            "type": "person",
            "properties": {
                "name": "Bob",
                "daily_capacity": 8,
            },
        },
        {
            "id": "task-1",
            "type": "task",
            "properties": {
                "name": "Task A",
                "assigned_to": "person-1",
                "estimated_hours": 12,
                "start_date": "2024-01-01",
                "end_date": "2024-01-03",
            },
        },
    ]

    payload = calculate_manpower_load(nodes)

    assert payload["date_columns"] == ["2024-01-01", "2024-01-02", "2024-01-03"]
    assert "person-1" in payload["resources"]

    person = payload["resources"]["person-1"]
    assert person["name"] == "Bob"
    assert person["capacity"] == 8
    # Manual-only mode: no auto-distribution unless recalc is explicitly requested.
    assert _load_total(person, "2024-01-01") == 0.0
    assert _load_total(person, "2024-01-02") == 0.0
    assert _load_total(person, "2024-01-03") == 0.0
    assert _load_tasks(person, "2024-01-01") == []

    assert payload["task_allocations"] == [
        {
            "node_id": "task-1",
            "name": "Task A",
            "person_id": "person-1",
            "target_hours": 12.0,
            "allocated_hours": 0.0,
            "status": "under",
        }
    ]
    assert payload["unallocated_tasks"] == [
        {
            "node_id": "task-1",
            "name": "Task A",
            "start_date": "2024-01-01",
            "end_date": "2024-01-03",
            "estimated_hours": 12.0,
            "unallocated_hours": 12.0,
            "assigned_to": ["person-1"],
            "status": "under",
        }
    ]


def test_calculate_manpower_load_skips_invalid_tasks_and_references():
    nodes = [
        {
            "id": "person-1",
            "type": "person",
            "properties": {
                "name": "Alex",
                "daily_capacity": 6,
            },
        },
        {
            "id": "task-no-assignee",
            "type": "task",
            "properties": {
                "estimated_hours": 8,
                "start_date": "2024-01-01",
                "end_date": "2024-01-02",
            },
        },
        {
            "id": "task-missing-dates",
            "type": "task",
            "properties": {
                "assigned_to": "person-1",
                "estimated_hours": 8,
            },
        },
        {
            "id": "task-bad-reference",
            "type": "task",
            "properties": {
                "assigned_to": "person-missing",
                "estimated_hours": 8,
                "start_date": "2024-01-01",
                "end_date": "2024-01-02",
            },
        },
    ]

    payload = calculate_manpower_load(nodes)

    # Fallback derives date bounds from task ranges; invalid tasks contribute no load
    assert payload["resources"]["person-1"]["name"] == "Alex"
    assert payload["resources"]["person-1"]["capacity"] == 6
    assert payload["date_columns"] == ["2024-01-01", "2024-01-02"]
    assert payload["resources"]["person-1"]["load"] == {
        "2024-01-01": {"total": 0.0, "tasks": []},
        "2024-01-02": {"total": 0.0, "tasks": []},
    }


def test_calculate_manpower_load_supports_multi_assignee_formats_and_splits_hours():
    nodes = [
        {
            "id": "project-1",
            "type": "project_root",
            "properties": {
                "name": "Master Project",
                "start_date": "2024-01-01",
                "end_date": "2024-01-02",
            },
        },
        {
            "id": "person-1",
            "type": "person",
            "properties": {
                "name": "Alex",
                "daily_capacity": 8,
            },
        },
        {
            "id": "person-2",
            "type": "person",
            "properties": {
                "name": "Blair",
                "daily_capacity": 8,
            },
        },
        {
            "id": "task-array",
            "type": "task",
            "properties": {
                "assigned_to": ["person-1", "person-2"],
                "estimated_hours": 8,
                "start_date": "2024-01-01",
                "end_date": "2024-01-02",
            },
        },
        {
            "id": "task-json",
            "type": "task",
            "properties": {
                "assigned_to": '["person-1"]',
                "estimated_hours": 4,
                "start_date": "2024-01-01",
                "end_date": "2024-01-02",
            },
        },
        {
            "id": "task-csv",
            "type": "task",
            "properties": {
                "assigned_to": "person-2, person-missing",
                "estimated_hours": 2,
                "start_date": "2024-01-01",
                "end_date": "2024-01-02",
            },
        },
    ]

    payload = calculate_manpower_load(nodes)

    assert payload["date_columns"] == ["2024-01-01", "2024-01-02"]

    assert _load_total(payload["resources"]["person-1"], "2024-01-01") == 0.0
    assert _load_total(payload["resources"]["person-1"], "2024-01-02") == 0.0
    assert _load_total(payload["resources"]["person-2"], "2024-01-01") == 0.0
    assert _load_total(payload["resources"]["person-2"], "2024-01-02") == 0.0

    status_map = {(entry["node_id"], entry["person_id"]): entry["status"] for entry in payload["task_allocations"]}
    assert status_map[("task-array", "person-1")] == "under"
    assert status_map[("task-array", "person-2")] == "under"
    assert status_map[("task-json", "person-1")] == "under"
    assert status_map[("task-csv", "person-2")] == "under"


def test_calculate_manpower_load_includes_schedulable_non_task_nodes():
    nodes = [
        {
            "id": "project-1",
            "type": "project_root",
            "properties": {
                "start_date": "2024-01-01",
                "end_date": "2024-01-02",
            },
        },
        {
            "id": "person-1",
            "type": "person",
            "properties": {
                "name": "Alex",
                "daily_capacity": 8,
            },
        },
        {
            "id": "episode-1",
            "type": "episode",
            "properties": {
                "assigned_to": "person-1",
                "estimated_hours": 6,
                "start_date": "2024-01-01",
                "end_date": "2024-01-02",
            },
        },
    ]

    payload = calculate_manpower_load(nodes)

    assert payload["date_columns"] == ["2024-01-01", "2024-01-02"]
    assert _load_total(payload["resources"]["person-1"], "2024-01-01") == 0.0
    assert _load_total(payload["resources"]["person-1"], "2024-01-02") == 0.0


def test_calculate_manpower_load_derives_bounds_from_non_task_nodes_when_project_dates_missing():
    nodes = [
        {
            "id": "project-1",
            "type": "project_root",
            "properties": {
                "name": "Master Project",
            },
        },
        {
            "id": "person-1",
            "type": "person",
            "properties": {
                "name": "Alex",
                "daily_capacity": 8,
            },
        },
        {
            "id": "episode-1",
            "type": "episode",
            "properties": {
                "assigned_to": "person-1",
                "estimated_hours": 6,
                "start_date": "2024-02-10",
                "end_date": "2024-02-12",
            },
        },
    ]

    payload = calculate_manpower_load(nodes)

    assert payload["date_columns"] == ["2024-02-10", "2024-02-11", "2024-02-12"]
    assert _load_total(payload["resources"]["person-1"], "2024-02-10") == 0.0
    assert _load_total(payload["resources"]["person-1"], "2024-02-11") == 0.0
    assert _load_total(payload["resources"]["person-1"], "2024-02-12") == 0.0


def test_calculate_manpower_load_uses_weekday_and_weekend_capacities_per_day():
    nodes = [
        {
            "id": "project-1",
            "type": "project_root",
            "properties": {
                "start_date": "2024-02-09",  # Friday
                "end_date": "2024-02-11",    # Sunday
            },
        },
        {
            "id": "person-1",
            "type": "person",
            "properties": {
                "name": "Alex",
                "capacity_monday": 0.5,
                "capacity_tuesday": 0.5,
                "capacity_wednesday": 0.5,
                "capacity_thursday": 0.5,
                "capacity_friday": 0.5,
                "capacity_saturday": 8,
                "capacity_sunday": 8,
            },
        },
        {
            "id": "episode-1",
            "type": "episode",
            "properties": {
                "assigned_to": "person-1",
                "estimated_hours": 6,
                "start_date": "2024-02-09",
                "end_date": "2024-02-11",
            },
        },
    ]

    payload = calculate_manpower_load(nodes)
    resource = payload["resources"]["person-1"]

    assert payload["date_columns"] == ["2024-02-09", "2024-02-10", "2024-02-11"]
    assert resource["capacity_by_day"]["2024-02-09"] == 0.5
    assert resource["capacity_by_day"]["2024-02-10"] == 8.0
    assert resource["capacity_by_day"]["2024-02-11"] == 8.0
    assert _load_total(resource, "2024-02-09") == 0.0
    assert _load_total(resource, "2024-02-10") == 0.0
    assert _load_total(resource, "2024-02-11") == 0.0


def test_calculate_manpower_load_uses_day_specific_overtime_capacity_per_day():
    nodes = [
        {
            "id": "project-1",
            "type": "project_root",
            "properties": {
                "start_date": "2024-02-09",  # Friday
                "end_date": "2024-02-10",    # Saturday
            },
        },
        {
            "id": "person-1",
            "type": "person",
            "properties": {
                "name": "Alex",
                "capacity_friday": 4,
                "capacity_saturday": 4,
                "overtime_capacity_friday": 2,
                "overtime_capacity_saturday": 0,
            },
        },
    ]

    payload = calculate_manpower_load(nodes)
    resource = payload["resources"]["person-1"]

    assert resource["overtime_capacity_by_day"]["2024-02-09"] == 2.0
    assert resource["overtime_capacity_by_day"]["2024-02-10"] == 0.0


def test_calculate_manpower_load_reports_unallocated_hours_when_window_capacity_is_insufficient():
    nodes = [
        {
            "id": "project-1",
            "type": "project_root",
            "properties": {
                "start_date": "2024-02-05",  # Monday
                "end_date": "2024-02-09",    # Friday
            },
        },
        {
            "id": "person-1",
            "type": "person",
            "properties": {
                "name": "Alex",
                "capacity_monday": 0.5,
                "capacity_tuesday": 0.5,
                "capacity_wednesday": 0.5,
                "capacity_thursday": 0.5,
                "capacity_friday": 0.5,
                "capacity_saturday": 8,
                "capacity_sunday": 8,
            },
        },
        {
            "id": "task-1",
            "type": "episode",
            "properties": {
                "name": "Heavy Task",
                "assigned_to": "person-1",
                "estimated_hours": 8,
                "start_date": "2024-02-05",
                "end_date": "2024-02-09",
            },
        },
    ]

    payload = calculate_manpower_load(nodes)
    resource = payload["resources"]["person-1"]

    assert _load_total(resource, "2024-02-05") == 0.0
    assert _load_total(resource, "2024-02-06") == 0.0
    assert _load_total(resource, "2024-02-07") == 0.0
    assert _load_total(resource, "2024-02-08") == 0.0
    assert _load_total(resource, "2024-02-09") == 0.0
    assert payload["unallocated_tasks"] == [
        {
            "node_id": "task-1",
            "name": "Heavy Task",
            "start_date": "2024-02-05",
            "end_date": "2024-02-09",
            "estimated_hours": 8.0,
            "unallocated_hours": 8.0,
            "assigned_to": ["person-1"],
            "status": "under",
        }
    ]


def test_calculate_manpower_load_respects_manual_allocations():
    """Manual allocations are used exactly as entered and are not auto-filled."""
    nodes = [
        {
            "id": "project-1",
            "type": "project_root",
            "properties": {
                "start_date": "2024-01-01",
                "end_date": "2024-01-04",
            },
        },
        {
            "id": "person-1",
            "type": "person",
            "properties": {
                "name": "Alice",
                "daily_capacity": 8,
            },
        },
        {
            "id": "task-1",
            "type": "task",
            "properties": {
                "name": "Manual Task",
                "assigned_to": "person-1",
                "estimated_hours": 10,
                "start_date": "2024-01-01",
                "end_date": "2024-01-04",
                # Hardcode 3h on day 1; remaining 7h split over days 2-4 = 7/3 each
                "manual_allocations": {"2024-01-01": {"person-1": 3}},
            },
        },
    ]

    payload = calculate_manpower_load(nodes)
    person = payload["resources"]["person-1"]

    # Day 1: manual override = 3h
    assert _load_total(person, "2024-01-01") == pytest.approx(3.0)
    assert _load_total(person, "2024-01-02") == 0.0
    assert _load_total(person, "2024-01-03") == 0.0
    assert _load_total(person, "2024-01-04") == 0.0
    assert _load_tasks(person, "2024-01-01") == [
        {"id": "task-1", "name": "Manual Task", "hours": 3.0}
    ]
    # Total remains only what user explicitly entered
    total = sum(_load_total(person, d) for d in ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04"])
    assert total == pytest.approx(3.0)


def test_recalculate_manpower_allocations_populates_weekdays_only_manual_entries():
    nodes = [
        {
            "id": "project-1",
            "type": "project_root",
            "properties": {
                "start_date": "2024-02-09",  # Friday
                "end_date": "2024-02-11",    # Sunday
            },
        },
        {
            "id": "person-1",
            "type": "person",
            "properties": {
                "name": "Alex",
                "capacity_friday": 8,
                "capacity_saturday": 8,
                "capacity_sunday": 8,
            },
        },
        {
            "id": "task-1",
            "type": "task",
            "properties": {
                "name": "Task A",
                "assigned_to": "person-1",
                "estimated_hours": 6,
                "start_date": "2024-02-09",
                "end_date": "2024-02-11",
            },
        },
    ]

    result = recalculate_manpower_allocations(nodes)
    assert result == {"updated_tasks": 1, "total_tasks": 1}

    payload = calculate_manpower_load(nodes)
    person = payload["resources"]["person-1"]
    assert _load_total(person, "2024-02-09") == pytest.approx(6.0)
    assert _load_total(person, "2024-02-10") == 0.0
    assert _load_total(person, "2024-02-11") == 0.0

    allocation = payload["task_allocations"][0]
    assert allocation["status"] == "full"
    assert allocation["target_hours"] == pytest.approx(6.0)
    assert allocation["allocated_hours"] == pytest.approx(6.0)
    assert payload["unallocated_tasks"] == []

