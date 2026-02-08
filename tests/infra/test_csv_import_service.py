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
*** End of File