import json
import os
import pytest
from datetime import date
from backend.core.resource_engine import calculate_manpower_load, recalculate_manpower_allocations


def _load_total(resource, day):
    return resource["load"][day]["total"]


def _load_tasks(resource, day):
    return resource["load"][day]["tasks"]


def _load_fixture():
    fixture_path = os.path.join(os.path.dirname(__file__), '..', 'fixtures', 'manpower_scenario.json')
    with open(fixture_path) as f:
        return json.load(f)["nodes"]

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

    payload = calculate_manpower_load(nodes, _today=date(2024, 1, 2))

    assert payload["date_columns"] == ["2024-01-01", "2024-01-02", "2024-01-03"]
    assert "person-1" in payload["resources"]

    person = payload["resources"]["person-1"]
    assert person["name"] == "Bob"
    assert person["capacity"] == 24  # 8h/day × 3 days
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

    payload = calculate_manpower_load(nodes, _today=date(2024, 1, 2))

    # Fallback derives date bounds from task ranges; invalid tasks contribute no load
    assert payload["resources"]["person-1"]["name"] == "Alex"
    assert payload["resources"]["person-1"]["capacity"] == 12  # 6h/day × 2 days
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

    payload = calculate_manpower_load(nodes, _today=date(2024, 1, 2))

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

    payload = calculate_manpower_load(nodes, _today=date(2024, 1, 2))

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

    payload = calculate_manpower_load(nodes, _today=date(2024, 2, 11))

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

    payload = calculate_manpower_load(nodes, _today=date(2024, 2, 10))
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
                "allocations": {"2024-01-01": {"person-1": 3}},
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
    assert result["updated_tasks"] == 1
    assert result["total_tasks"] == 1
    assert len(result["changes"]) == 1
    assert result["changes"][0]["property_id"] == "allocations"
    assert result["changes"][0]["node_id"] == "task-1"

    # Apply the calculated changes to nodes before loading
    for change in result["changes"]:
        for node in nodes:
            if node["id"] == change["node_id"]:
                node["properties"][change["property_id"]] = change["new_value"]
                break

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


def test_calculate_manpower_load_resolves_legacy_manual_allocation_keys_to_assignees():
    nodes = [
        {
            "id": "project-1",
            "type": "project_root",
            "properties": {
                "start_date": "2026-04-13",
                "end_date": "2026-04-16",
            },
        },
        {
            "id": "5a4e7080-ea15-5873-965f-9004c5a1455e",
            "type": "person",
            "properties": {
                "name": "Casey Morgan",
                "daily_capacity": 8,
            },
        },
        {
            "id": "task-legacy-1",
            "type": "task",
            "properties": {
                "name": "Paint Prep",
                "assigned_to": "5a4e7080-ea15-5873-965f-9004c5a1455e",
                "estimated_hours": 24,
                "start_date": "2026-04-13",
                "end_date": "2026-04-16",
                "allocations": {
                    "2026-04-13": {"person-casey-morgan-003": 8},
                    "2026-04-14": {"person-casey-morgan-003": 8},
                    "2026-04-15": {"person-casey-morgan-003": 4},
                    "2026-04-16": {"person-casey-morgan-003": 4},
                },
            },
        },
    ]

    payload = calculate_manpower_load(nodes)

    person = payload["resources"]["5a4e7080-ea15-5873-965f-9004c5a1455e"]
    assert _load_total(person, "2026-04-13") == pytest.approx(8.0)
    assert _load_total(person, "2026-04-14") == pytest.approx(8.0)
    assert _load_total(person, "2026-04-15") == pytest.approx(4.0)
    assert _load_total(person, "2026-04-16") == pytest.approx(4.0)

    allocation = payload["task_allocations"][0]
    assert allocation["person_id"] == "5a4e7080-ea15-5873-965f-9004c5a1455e"
    assert allocation["allocated_hours"] == pytest.approx(24.0)
    assert allocation["status"] == "full"


def test_calculate_manpower_load_reads_canonical_allocations_property():
    nodes = [
        {
            "id": "project-1",
            "type": "project_root",
            "properties": {
                "start_date": "2026-02-03",
                "end_date": "2026-02-04",
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
            "id": "task-1",
            "type": "task",
            "properties": {
                "name": "Task A",
                "assigned_to": "person-1",
                "estimated_hours": 6,
                "start_date": "2026-02-03",
                "end_date": "2026-02-04",
                "allocations": {
                    "2026-02-03": {"person-1": 4},
                    "2026-02-04": {"person-1": 2},
                },
            },
        },
    ]

    payload = calculate_manpower_load(nodes)
    person = payload["resources"]["person-1"]

    assert _load_total(person, "2026-02-03") == pytest.approx(4.0)
    assert _load_total(person, "2026-02-04") == pytest.approx(2.0)
    assert payload["task_allocations"][0]["status"] == "full"
    assert payload["allocation_property_id"] == "allocations"


# ──────────────────────────────────────────────────────────────────────────────
# Fixture-based tests — realistic project_talus template structure
# ──────────────────────────────────────────────────────────────────────────────


def test_fixture_capacity_reflects_weekday_hours_not_7day_average(fixture_today):
    """
    Bug: capacity was computed as sum(all_7_days) / 7, giving ~5.71 for a
    standard M-F 8h worker instead of 8.0. capacity should be the average
    over days where capacity > 0 (the working days).
    """
    nodes = _load_fixture()
    payload = calculate_manpower_load(nodes, _today=fixture_today)

    # Alex: M-F=8h/day × 8 working days (Jan5-9 + Jan12-14) = 64h total
    alex = payload["resources"]["person-alex-001"]
    assert alex["capacity"] == pytest.approx(64.0), (
        f"Alex's capacity should be 64.0 (8h/day × 8 working days) but got {alex['capacity']:.4f}."
    )

    # Blair: M-F=4h/day × 8 working days = 32h total
    blair = payload["resources"]["person-blair-002"]
    assert blair["capacity"] == pytest.approx(32.0), (
        f"Blair's capacity should be 32.0 (4h/day × 8 working days) but got {blair['capacity']:.4f}."
    )


def test_fixture_bounds_derived_from_episode_dates_when_project_root_lacks_dates(fixture_today):
    """
    The real project_talus template has no start_date/end_date on project_root.
    Timeline bounds must be derived from episode node dates instead.
    """
    nodes = _load_fixture()
    payload = calculate_manpower_load(nodes, _today=fixture_today)

    # Fixture episodes span 2026-01-05 to 2026-01-14
    assert payload["date_columns"][0] == "2026-01-05"
    assert payload["date_columns"][-1] == "2026-01-14"


def test_fixture_episode_nodes_appear_as_schedulable_work():
    """
    Only 'episode' nodes (not 'task') carry scheduling properties in the real
    project_talus template. The engine must find them regardless of node type.
    """
    nodes = _load_fixture()
    payload = calculate_manpower_load(nodes)

    # Alex is assigned to episode-suspension-001 and episode-partial-manual-003
    alex = payload["resources"]["person-alex-001"]
    # partial-manual-003 has allocations pre-set, so load should be visible
    assert _load_total(alex, "2026-01-07") == pytest.approx(2.0)
    assert _load_total(alex, "2026-01-08") == pytest.approx(2.0)
    assert _load_total(alex, "2026-01-09") == pytest.approx(2.0)

    # suspension episode has no manual allocations yet — no auto-distribution
    assert _load_total(alex, "2026-01-05") == 0.0
    assert _load_total(alex, "2026-01-06") == 0.0


def test_fixture_recalculate_distributes_episode_hours_across_weekdays():
    """
    After recalculate, each episode's estimated_hours should be spread evenly
    over weekdays in its date window.
    """
    nodes = _load_fixture()
    # Remove any pre-existing allocations so we test a clean recalculate
    for node in nodes:
        if node.get("type") == "episode":
            node.setdefault("properties", {})["allocations"] = {}

    result = recalculate_manpower_allocations(nodes)
    assert result["updated_tasks"] > 0

    # Apply the calculated changes to nodes before loading
    for change in result["changes"]:
        for node in nodes:
            if node["id"] == change["node_id"]:
                node["properties"][change["property_id"]] = change["new_value"]
                break

    payload = calculate_manpower_load(nodes)
    alex = payload["resources"]["person-alex-001"]

    # episode-suspension-001: 16h for Alex, Mon 5 Jan – Fri 9 Jan = 5 weekdays → 3.2h/day
    for day in ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"]:
        assert _load_total(alex, day) == pytest.approx(3.2 + (2.0 if day in {"2026-01-07", "2026-01-08", "2026-01-09"} else 0.0))


def test_fixture_recalculate_episode_suspension_only():
    """
    Targeted test: episode-suspension-001 only (Alex, 16h, Mon-Fri 2026-01-05..09).
    After recalculate: 16h / 5 weekdays = 3.2h per day.
    """
    suspension_nodes = [
        n for n in _load_fixture()
        if n["id"] in {"person-alex-001", "episode-suspension-001"}
    ]

    result = recalculate_manpower_allocations(suspension_nodes)
    assert result["updated_tasks"] == 1
    assert result["total_tasks"] == 1
    assert "changes" in result

    # Apply the calculated changes to nodes before loading
    for change in result["changes"]:
        for node in suspension_nodes:
            if node["id"] == change["node_id"]:
                node["properties"][change["property_id"]] = change["new_value"]
                break

    payload = calculate_manpower_load(suspension_nodes)
    alex = payload["resources"]["person-alex-001"]
    for day in ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"]:
        assert _load_total(alex, day) == pytest.approx(3.2), (
            f"Expected 3.2h on {day} but got {_load_total(alex, day)}"
        )
    allocation = payload["task_allocations"][0]
    assert allocation["status"] == "full"
    assert allocation["allocated_hours"] == pytest.approx(16.0)


def test_fixture_recalculate_multi_assignee_episode():
    """
    episode-brakes-002: 12h, Alex + Blair, Mon-Wed 2026-01-12..14.
    After recalculate: per-person = 12/2 = 6h over 3 weekdays = 2h/day each.
    """
    brake_nodes = [
        n for n in _load_fixture()
        if n["id"] in {"person-alex-001", "person-blair-002", "episode-brakes-002"}
    ]
    # Clear any pre-existing allocations
    for node in brake_nodes:
        if node.get("type") == "episode":
            node["properties"]["allocations"] = {}

    result = recalculate_manpower_allocations(brake_nodes)
    assert result["updated_tasks"] == 1
    assert result["total_tasks"] == 1
    assert "changes" in result

    # Apply the calculated changes to nodes before loading
    for change in result["changes"]:
        for node in brake_nodes:
            if node["id"] == change["node_id"]:
                node["properties"][change["property_id"]] = change["new_value"]
                break

    payload = calculate_manpower_load(brake_nodes)
    alex = payload["resources"]["person-alex-001"]
    blair = payload["resources"]["person-blair-002"]

    for day in ["2026-01-12", "2026-01-13", "2026-01-14"]:
        assert _load_total(alex, day) == pytest.approx(2.0), f"Alex on {day}"
        assert _load_total(blair, day) == pytest.approx(2.0), f"Blair on {day}"

    for alloc in payload["task_allocations"]:
        assert alloc["status"] == "full"
        assert alloc["allocated_hours"] == pytest.approx(6.0)


def test_fixture_capacity_by_day_weekends_show_zero(fixture_today):
    """
    Capacity on Saturday and Sunday must be 0 for standard M-F workers,
    and the day-specific capacity_by_day dict must reflect this.
    """
    nodes = _load_fixture()
    payload = calculate_manpower_load(nodes, _today=fixture_today)

    alex = payload["resources"]["person-alex-001"]
    # 2026-01-10 = Saturday, 2026-01-11 = Sunday
    assert alex["capacity_by_day"]["2026-01-10"] == 0.0
    assert alex["capacity_by_day"]["2026-01-11"] == 0.0

    # Weekday should be non-zero
    assert alex["capacity_by_day"]["2026-01-05"] == 8.0  # Monday

