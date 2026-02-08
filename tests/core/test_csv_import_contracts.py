import uuid
import pytest

from backend.core.imports import CSVColumnBinding, CSVImportPlan


def test_plan_detects_missing_required_properties():
    parent_id = uuid.uuid4()
    plan = CSVImportPlan(
        parent_id=parent_id,
        blueprint_type_id="task",
        column_bindings=[
            CSVColumnBinding(header="Name", property_id="name"),
            CSVColumnBinding(header="Cost", property_id="cost"),
        ],
    )

    missing = plan.missing_required_properties({"name", "description"})

    assert missing == {"description"}


def test_plan_rejects_duplicate_property_bindings():
    parent_id = uuid.uuid4()

    with pytest.raises(ValueError):
        CSVImportPlan(
            parent_id=parent_id,
            blueprint_type_id="task",
            column_bindings=[
                CSVColumnBinding(header="Name", property_id="name"),
                CSVColumnBinding(header="Display Name", property_id="name"),
            ],
        )
