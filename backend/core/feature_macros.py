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
            "id": "manual_allocations",
            "label": "Manual Allocations",
            "type": "object",
            "value": {},
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
                    # Overwrite with the canonical macro definition
                    properties[prop_index[pid]] = dict(macro_prop)
                else:
                    properties.append(dict(macro_prop))
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
                if not (p.get("system_locked") and p["id"] in ids_to_remove)
            ]

        nt["properties"] = properties

    return template_data
