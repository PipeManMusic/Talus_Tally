import csv
from typing import Callable, Dict, Iterable, List, Optional, TextIO

from backend.core.imports import (
    CSVColumnBinding,
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

        # Build a key → uuid map so bindings using semantic property keys
        # (e.g., "name", "cost") are resolved to their UUID equivalents.
        key_to_uuid: Dict[str, str] = {}
        for prop in schema:
            pkey = prop.get("key")
            pid = str(prop.get("id", ""))
            if pkey and pkey != pid:
                key_to_uuid[pkey] = pid

        # Resolve each binding's property_id from semantic key to UUID if needed.
        resolved_bindings: List[CSVColumnBinding] = []
        for binding in plan.column_bindings:
            resolved_pid = key_to_uuid.get(binding.property_id, binding.property_id)
            resolved_bindings.append(
                CSVColumnBinding(header=binding.header, property_id=resolved_pid)
            )
        plan.column_bindings = resolved_bindings

        schema_by_id = {
            str(prop.get("id")): prop
            for prop in schema
            if isinstance(prop, dict) and prop.get("id")
        }

        required_properties = {
            prop["id"]
            for prop in schema
            if prop.get("required")
        }
        valid_properties = {prop["id"] for prop in schema}

        # Identify the UUID-based id for the "name" property.
        name_prop_id: Optional[str] = None
        for prop in schema:
            pkey = prop.get("key") or prop.get("id")
            if pkey == "name":
                name_prop_id = str(prop.get("id"))
                break
        if name_prop_id is None:
            name_prop_id = "name"

        # Name is a system field used by node creation and CSV import payloads.
        # Some custom templates may omit it from node_type.properties, but import
        # still needs to accept and require the name binding consistently.
        required_properties.add(name_prop_id)
        valid_properties.add(name_prop_id)

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

                if binding.property_id == name_prop_id:
                    name_value = value
                else:
                    properties[binding.property_id] = _normalize_property_value(
                        schema_by_id.get(binding.property_id),
                        value,
                    )

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


def _normalize_property_value(property_schema: Optional[dict], value: str) -> str:
    if not property_schema:
        return value

    property_type = str(property_schema.get("type") or "").strip().lower()
    options = property_schema.get("options") or []
    if not isinstance(options, list) or not options:
        return value

    if property_type == "select":
        return _resolve_option_value(options, value)

    if property_type == "multi_select":
        parts = [part.strip() for part in value.split("|")]
        normalized_parts = [
            _resolve_option_value(options, part)
            for part in parts
            if part.strip()
        ]
        return "|".join(normalized_parts)

    return value


def _resolve_option_value(options: List[dict], raw_value: str) -> str:
    normalized_raw = raw_value.strip().casefold()
    for option in options:
        option_id = str(option.get("id") or "").strip()
        option_name = str(option.get("name") or "").strip()
        if option_id and option_id.casefold() == normalized_raw:
            return option_id
        if option_name and option_name.casefold() == normalized_raw:
            return option_id or raw_value
    return raw_value
