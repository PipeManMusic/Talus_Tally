from backend.core.resource_engine import calculate_manpower_load


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
    assert person["load"]["2024-01-01"] == 4
    assert person["load"]["2024-01-02"] == 4
    assert person["load"]["2024-01-03"] == 4


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
        "2024-01-01": 0.0,
        "2024-01-02": 0.0,
    }
