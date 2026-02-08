import csv
from typing import Callable, Dict, Iterable, List, Optional, TextIO

from backend.core.imports import (
    CSVImportBatch,
    CSVImportPlan,
    CSVImportPlanError,
    CSVRowError,
    PreparedCSVNode,
)

PropertySchemaResolver = Callable[[str], Iterable[dict]]


class CSVImportService:
    """Service responsible for translating CSV files into prepared node data."""

    def __init__(self, schema_resolver: PropertySchemaResolver):
        self._schema_resolver = schema_resolver

    def prepare_import(self, plan: CSVImportPlan, stream: TextIO) -> CSVImportBatch:
        schema = list(self._schema_resolver(plan.blueprint_type_id) or [])
        if not schema:
            raise CSVImportPlanError(
                f"Unknown blueprint type '{plan.blueprint_type_id}' for CSV import"
            )

        required_properties = {
            prop["id"]
            for prop in schema
            if prop.get("required")
        }
        valid_properties = {prop["id"] for prop in schema}

        missing = plan.missing_required_properties(required_properties)
        if missing:
            raise CSVImportPlanError(
                "Missing bindings for required properties: " + ", ".join(sorted(missing))
            )

        for binding in plan.column_bindings:
            if binding.property_id not in valid_properties:
                raise CSVImportPlanError(
                    f"Unknown property '{binding.property_id}' for type '{plan.blueprint_type_id}'"
                )

        reader = csv.DictReader(stream)
        if reader.fieldnames is None:
            raise CSVImportPlanError("CSV file must include a header row")

        header_lookup = set(reader.fieldnames)
        for binding in plan.column_bindings:
            if binding.header not in header_lookup:
                raise CSVImportPlanError(
                    f"CSV is missing the expected column '{binding.header}'"
                )

        prepared_nodes: List[PreparedCSVNode] = []
        row_errors: List[CSVRowError] = []

        for row_index, row in enumerate(reader, start=2):
            if not row:
                continue
            if all(_is_blank_cell(value) for value in row.values()):
                continue

            errors: List[str] = []
            properties: Dict[str, str] = {}
            name_value: Optional[str] = None

            for binding in plan.column_bindings:
                raw_value = row.get(binding.header)
                value = _normalize_cell(raw_value)

                if value == "":
                    if binding.property_id in required_properties:
                        errors.append(f"Missing value for '{binding.property_id}'")
                    continue

                if binding.property_id == "name":
                    name_value = value
                else:
                    properties[binding.property_id] = value

            if name_value is None:
                errors.append("Missing value for 'name'")

            if errors:
                row_errors.append(
                    CSVRowError(row_number=row_index, messages=tuple(errors))
                )
                continue

            prepared_nodes.append(
                PreparedCSVNode(name=name_value, properties=properties)
            )

        return CSVImportBatch(plan=plan, prepared_nodes=prepared_nodes, errors=row_errors)


def _normalize_cell(value: object) -> str:
    if value is None:
        return ""
    text = str(value)
    return text.strip()


def _is_blank_cell(value: object) -> bool:
    return _normalize_cell(value) == ""
