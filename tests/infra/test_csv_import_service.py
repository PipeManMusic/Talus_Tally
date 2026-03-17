import io
import uuid
import pytest

from backend.core.imports import (
    CSVColumnBinding,
    CSVImportPlan,
    CSVImportPlanError,
)
from backend.infra.imports.csv_service import CSVImportService


@pytest.fixture
def schema_resolver():
    schema = {
        "task": [
            {"id": "name", "required": True},
            {"id": "description", "required": False},
            {"id": "cost", "required": True},
        ]
    }

    def resolve(node_type_id: str):
        return schema.get(node_type_id, [])

    return resolve


def build_plan(parent=None):
    return CSVImportPlan(
        parent_id=parent or uuid.uuid4(),
        blueprint_type_id="task",
        column_bindings=[
            CSVColumnBinding(header="Name", property_id="name"),
            CSVColumnBinding(header="Cost", property_id="cost"),
            CSVColumnBinding(header="Description", property_id="description"),
        ],
    )


def test_prepare_import_returns_nodes_with_mapped_properties(schema_resolver):
    service = CSVImportService(schema_resolver)
    plan = build_plan()
    csv_data = "Name,Cost,Description\nWidget,12.5,Primary part\nGadget,8.0,Secondary"

    batch = service.prepare_import(plan, io.StringIO(csv_data))

    assert not batch.has_errors
    assert len(batch.prepared_nodes) == 2

    first = batch.prepared_nodes[0]
    assert first.name == "Widget"
    assert first.properties == {"cost": "12.5", "description": "Primary part"}


def test_prepare_import_requires_required_properties_mapped(schema_resolver):
    service = CSVImportService(schema_resolver)
    plan = CSVImportPlan(
        parent_id=uuid.uuid4(),
        blueprint_type_id="task",
        column_bindings=[CSVColumnBinding(header="Name", property_id="name")],
    )

    with pytest.raises(CSVImportPlanError):
        service.prepare_import(plan, io.StringIO("Name\nWidget"))


def test_prepare_import_collects_row_errors_for_missing_required_values(schema_resolver):
    service = CSVImportService(schema_resolver)
    plan = build_plan()
    csv_data = "Name,Cost,Description\nWidget,12.5,\nGadget,,Secondary"

    batch = service.prepare_import(plan, io.StringIO(csv_data))

    assert batch.has_errors
    assert len(batch.errors) == 1
    # First row missing optional description, so should still import
    assert len(batch.prepared_nodes) == 1
    assert batch.prepared_nodes[0].name == "Widget"


def test_prepare_import_accepts_name_binding_when_schema_omits_name():
    def schema_resolver(_node_type_id: str):
        return [
            {"id": "description", "required": False},
            {"id": "cost", "required": True},
        ]

    service = CSVImportService(schema_resolver)
    plan = CSVImportPlan(
        parent_id=uuid.uuid4(),
        blueprint_type_id="equpment",
        column_bindings=[
            CSVColumnBinding(header="Name", property_id="name"),
            CSVColumnBinding(header="Cost", property_id="cost"),
        ],
    )

    batch = service.prepare_import(plan, io.StringIO("Name,Cost\nMeter,30\n"))

    assert not batch.has_errors
    assert len(batch.prepared_nodes) == 1
    assert batch.prepared_nodes[0].name == "Meter"
    assert batch.prepared_nodes[0].properties == {"cost": "30"}


def test_prepare_import_resolves_select_labels_to_option_ids():
    def schema_resolver(_node_type_id: str):
        return [
            {"id": "priority", "required": False, "type": "select", "options": [
                {"id": "prio-low", "name": "Low"},
                {"id": "prio-high", "name": "High"},
            ]},
        ]

    service = CSVImportService(schema_resolver)
    plan = CSVImportPlan(
        parent_id=uuid.uuid4(),
        blueprint_type_id="task",
        column_bindings=[
            CSVColumnBinding(header="Name", property_id="name"),
            CSVColumnBinding(header="Priority", property_id="priority"),
        ],
    )

    batch = service.prepare_import(plan, io.StringIO("Name,Priority\nWidget,High\n"))

    assert not batch.has_errors
    assert batch.prepared_nodes[0].properties == {"priority": "prio-high"}


def test_prepare_import_resolves_multi_select_labels_to_option_ids():
    def schema_resolver(_node_type_id: str):
        return [
            {"id": "tags", "required": False, "type": "multi_select", "options": [
                {"id": "tag-red", "name": "Red"},
                {"id": "tag-blue", "name": "Blue"},
            ]},
        ]

    service = CSVImportService(schema_resolver)
    plan = CSVImportPlan(
        parent_id=uuid.uuid4(),
        blueprint_type_id="task",
        column_bindings=[
            CSVColumnBinding(header="Name", property_id="name"),
            CSVColumnBinding(header="Tags", property_id="tags"),
        ],
    )

    batch = service.prepare_import(plan, io.StringIO("Name,Tags\nWidget,Red|Blue\n"))

    assert not batch.has_errors
    assert batch.prepared_nodes[0].properties == {"tags": "tag-red|tag-blue"}