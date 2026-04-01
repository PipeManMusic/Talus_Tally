"""
Feature Macro Service — injects/removes system-locked properties
based on the `features` array on each node type.

When a feature like "scheduling" or "budgeting" is enabled on a node type,
the corresponding properties are forcefully merged into that node type's
`properties` list.  When a feature is removed, any system_locked properties
that belonged to that feature are removed.
"""

from typing import Any, Dict, List

# ---------------------------------------------------------------------------
# Macro definitions: feature_id → list of property dicts to inject
# ---------------------------------------------------------------------------
FEATURE_MACROS: Dict[str, List[Dict[str, Any]]] = {
    "scheduling": [
        {
            "id": "start_date",
            "label": "Start Date",
            "type": "date",
            "system_locked": True,
            "ui_group": "Schedule",
            "semantic_role": "gantt_start",
        },
        {
            "id": "end_date",
            "label": "End Date",
            "type": "date",
            "system_locked": True,
            "ui_group": "Schedule",
            "semantic_role": "gantt_end",
        },
        {
            "id": "assigned_to",
            "label": "Assigned To",
            "type": "node_reference",
            "target_type": "person",
            "system_locked": True,
            "ui_group": "Schedule",
        },
        {
            "id": "estimated_hours",
            "label": "Estimated Hours",
            "type": "number",
            "value": 0,
            "system_locked": True,
            "ui_group": "Schedule",
        },
        {
            "id": "actual_hours",
            "label": "Actual Hours",
            "type": "number",
            "value": 0,
            "system_locked": True,
            "ui_group": "Schedule",
        },
        {
            "id": "allocations",
            "label": "Allocations",
            "type": "object",
            "value": {},
            "system_locked": True,
            "ui_group": "Schedule",
        },
        {
            "id": "status",
            "label": "Status",
            "type": "select",
            "indicator_set": "status",
            "options": [
                {"name": "To Do", "indicator_id": "empty"},
                {"name": "In Progress", "indicator_id": "partial"},
                {"name": "Done", "indicator_id": "filled"},
            ],
            "value": "To Do",
            "system_locked": True,
            "ui_group": "Schedule",
        },
    ],
    "budgeting": [
        {
            "id": "estimated_cost",
            "label": "Estimated Cost",
            "type": "currency",
            "system_locked": True,
            "ui_group": "Financial",
        },
        {
            "id": "actual_cost",
            "label": "Actual Cost",
            "type": "currency",
            "system_locked": True,
            "ui_group": "Financial",
        },
    ],
    "is_person": [
        # Weekday capacity
        {"id": "capacity_monday", "label": "Capacity Monday (Hours)", "type": "number", "value": 8, "required": True, "system_locked": True, "ui_group": "Capacity"},
        {"id": "capacity_tuesday", "label": "Capacity Tuesday (Hours)", "type": "number", "value": 8, "required": True, "system_locked": True, "ui_group": "Capacity"},
        {"id": "capacity_wednesday", "label": "Capacity Wednesday (Hours)", "type": "number", "value": 8, "required": True, "system_locked": True, "ui_group": "Capacity"},
        {"id": "capacity_thursday", "label": "Capacity Thursday (Hours)", "type": "number", "value": 8, "required": True, "system_locked": True, "ui_group": "Capacity"},
        {"id": "capacity_friday", "label": "Capacity Friday (Hours)", "type": "number", "value": 8, "required": True, "system_locked": True, "ui_group": "Capacity"},
        {"id": "capacity_saturday", "label": "Capacity Saturday (Hours)", "type": "number", "value": 0, "required": True, "system_locked": True, "ui_group": "Capacity"},
        {"id": "capacity_sunday", "label": "Capacity Sunday (Hours)", "type": "number", "value": 0, "required": True, "system_locked": True, "ui_group": "Capacity"},
        # Overtime capacity
        {"id": "overtime_capacity_monday", "label": "Overtime Monday (Hours)", "type": "number", "value": 0, "system_locked": True, "ui_group": "Overtime"},
        {"id": "overtime_capacity_tuesday", "label": "Overtime Tuesday (Hours)", "type": "number", "value": 0, "system_locked": True, "ui_group": "Overtime"},
        {"id": "overtime_capacity_wednesday", "label": "Overtime Wednesday (Hours)", "type": "number", "value": 0, "system_locked": True, "ui_group": "Overtime"},
        {"id": "overtime_capacity_thursday", "label": "Overtime Thursday (Hours)", "type": "number", "value": 0, "system_locked": True, "ui_group": "Overtime"},
        {"id": "overtime_capacity_friday", "label": "Overtime Friday (Hours)", "type": "number", "value": 0, "system_locked": True, "ui_group": "Overtime"},
        {"id": "overtime_capacity_saturday", "label": "Overtime Saturday (Hours)", "type": "number", "value": 0, "system_locked": True, "ui_group": "Overtime"},
        {"id": "overtime_capacity_sunday", "label": "Overtime Sunday (Hours)", "type": "number", "value": 0, "system_locked": True, "ui_group": "Overtime"},
        # Hourly rates
        {"id": "hourly_rate_monday", "label": "Hourly Rate Monday", "type": "number", "system_locked": True, "ui_group": "Rates"},
        {"id": "hourly_rate_tuesday", "label": "Hourly Rate Tuesday", "type": "number", "system_locked": True, "ui_group": "Rates"},
        {"id": "hourly_rate_wednesday", "label": "Hourly Rate Wednesday", "type": "number", "system_locked": True, "ui_group": "Rates"},
        {"id": "hourly_rate_thursday", "label": "Hourly Rate Thursday", "type": "number", "system_locked": True, "ui_group": "Rates"},
        {"id": "hourly_rate_friday", "label": "Hourly Rate Friday", "type": "number", "system_locked": True, "ui_group": "Rates"},
        {"id": "hourly_rate_saturday", "label": "Hourly Rate Saturday", "type": "number", "system_locked": True, "ui_group": "Rates"},
        {"id": "hourly_rate_sunday", "label": "Hourly Rate Sunday", "type": "number", "system_locked": True, "ui_group": "Rates"},
    ],
}


def _macro_prop_ids(feature: str) -> set:
    """Return the set of property IDs for a given feature."""
    return {p["id"] for p in FEATURE_MACROS.get(feature, [])}


def apply_feature_macros(template_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Walk every node type in *template_data*.

    * For each **enabled** feature, ensure the macro properties exist
      (insert them if missing, update if present but stale).
    * For each **disabled** feature, remove any system_locked properties
      that belong to that feature.

    Returns the (mutated) template_data for convenience.
    """
    node_types: List[Dict[str, Any]] = template_data.get("node_types", [])

    for nt in node_types:
        enabled_features: List[str] = nt.get("features") or []
        properties: List[Dict[str, Any]] = nt.get("properties") or []

        # Build a quick lookup of existing property IDs → index
        prop_index: Dict[str, int] = {p["id"]: i for i, p in enumerate(properties)}

        # --- inject / update for enabled features ---
        for feature in enabled_features:
            macro_props = FEATURE_MACROS.get(feature, [])
            for macro_prop in macro_props:
                pid = macro_prop["id"]
                if pid in prop_index:
                    existing = properties[prop_index[pid]]
                    if existing.get("system_locked"):
                        # Previously injected macro property — update it
                        for key, value in macro_prop.items():
                            if key not in existing:
                                existing[key] = value
                    else:
                        # User-defined property with the same id — append the
                        # macro property alongside it with a unique id so each
                        # gets its own UUID during _generate_property_uuids.
                        new_prop = dict(macro_prop)
                        unique_id = f"_feat_{feature}_{pid}"
                        new_prop["id"] = unique_id
                        new_prop["key"] = pid  # preserve semantic key for lookups
                        new_prop["_macro_injected"] = True
                        properties.append(new_prop)
                        prop_index[unique_id] = len(properties) - 1
                else:
                    new_prop = dict(macro_prop)
                    new_prop["_macro_injected"] = True
                    properties.append(new_prop)
                    prop_index[pid] = len(properties) - 1

        # --- remove for disabled features ---
        all_known_features = set(FEATURE_MACROS.keys())
        disabled_features = all_known_features - set(enabled_features)

        ids_to_remove: set = set()
        for feature in disabled_features:
            ids_to_remove |= _macro_prop_ids(feature)

        if ids_to_remove:
            properties = [
                p for p in properties
                if not (
                    p.get("_macro_injected")
                    and p.get("system_locked")
                    and (p["id"] in ids_to_remove or p.get("key") in ids_to_remove)
                )
            ]

        nt["properties"] = properties

    return template_data
