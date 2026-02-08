import io
import json

import pytest

from backend.app import create_app


@pytest.fixture
def client():
    app = create_app({"TESTING": True})
    with app.test_client() as client:
        yield client


def create_project(client):
    payload = {"template_id": "restomod", "project_name": "Import Project"}
    response = client.post("/api/v1/projects", json=payload)
    assert response.status_code == 201, response.get_json()
    return response.get_json()


def test_csv_import_route_creates_nodes(client):
    project = create_project(client)
    session_id = project["session_id"]
    parent_id = project["graph"]["roots"][0]["id"]

    csv_content = "Name,Cost\nTask A,100\nTask B,250\n"
    column_map = json.dumps([
        {"header": "Name", "property_id": "name"},
        {"header": "Cost", "property_id": "cost"},
    ])

    data = {
        "session_id": session_id,
        "parent_id": parent_id,
        "blueprint_type_id": "task",
        "column_map": column_map,
        "file": (io.BytesIO(csv_content.encode("utf-8")), "import.csv"),
    }

    response = client.post(
        "/api/v1/imports/csv",
        data=data,
        content_type="multipart/form-data",
    )

    assert response.status_code == 200, response.get_json()
    result = response.get_json()
    assert result["success"] is True
    assert result["created_count"] == 2
    child_names = [child["name"] for child in result["graph"]["roots"][0]["children"]]
    assert "Task A" in child_names
    assert "Task B" in child_names


def test_csv_import_route_rejects_missing_required_binding(client):
    project = create_project(client)
    session_id = project["session_id"]
    parent_id = project["graph"]["roots"][0]["id"]

    csv_content = "Name\nTask A\n"
    # Omit binding for required cost? Instead omit name mapping
    column_map = json.dumps([
        {"header": "Cost", "property_id": "cost"}
    ])

    data = {
        "session_id": session_id,
        "parent_id": parent_id,
        "blueprint_type_id": "task",
        "column_map": column_map,
        "file": (io.BytesIO(csv_content.encode("utf-8")), "import.csv"),
    }

    response = client.post(
        "/api/v1/imports/csv",
        data=data,
        content_type="multipart/form-data",
    )

    assert response.status_code == 400
    error = response.get_json()["error"]
    assert error["code"] == "INVALID_PLAN"


def test_csv_import_route_returns_row_errors(client):
    project = create_project(client)
    session_id = project["session_id"]
    parent_id = project["graph"]["roots"][0]["id"]

    csv_content = "Name,Cost\n,100\nTask B,\n"
    column_map = json.dumps([
        {"header": "Name", "property_id": "name"},
        {"header": "Cost", "property_id": "cost"},
    ])

    data = {
        "session_id": session_id,
        "parent_id": parent_id,
        "blueprint_type_id": "task",
        "column_map": column_map,
        "file": (io.BytesIO(csv_content.encode("utf-8")), "import.csv"),
    }

    response = client.post(
        "/api/v1/imports/csv",
        data=data,
        content_type="multipart/form-data",
    )

    assert response.status_code == 422
    payload = response.get_json()
    assert payload["error"]["code"] == "CSV_ROW_ERRORS"
    rows = payload["error"]["rows"]
    assert rows[0]["row_number"] == 2
    assert "Missing value" in rows[0]["messages"][0]
*** End of File