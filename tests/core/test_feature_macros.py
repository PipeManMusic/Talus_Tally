"""
Tests for feature_macros — Template Feature Macro injection/removal system.

Covers:
- Scheduling feature injects start_date, end_date, assigned_to, estimated_hours, actual_hours, manual_allocations, status
- Budgeting feature injects estimated_cost + actual_cost
- Disabling a feature removes its system_locked properties
- Enabling both features simultaneously
- Existing user properties are preserved
- Re-enabling a feature re-injects removed properties
- No-op when features list is absent or empty
"""

import pytest
import copy
from backend.core.feature_macros import apply_feature_macros, FEATURE_MACROS


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def base_template():
    """Minimal template with one node type and no features."""
    return {
        "id": "test_template",
        "name": "Test Template",
        "version": "1.0",
        "node_types": [
            {
                "id": "task",
                "label": "Task",
                "allowed_children": [],
                "properties": [
                    {"id": "name", "label": "Name", "type": "text"},
                    {"id": "priority", "label": "Priority", "type": "number"},
                ],
            }
        ],
    }


@pytest.fixture
def scheduling_template(base_template):
    """Template with scheduling feature enabled."""
    tpl = copy.deepcopy(base_template)
    tpl["node_types"][0]["features"] = ["scheduling"]
    return tpl


@pytest.fixture
def budgeting_template(base_template):
    """Template with budgeting feature enabled."""
    tpl = copy.deepcopy(base_template)
    tpl["node_types"][0]["features"] = ["budgeting"]
    return tpl


@pytest.fixture
def both_features_template(base_template):
    """Template with both scheduling and budgeting enabled."""
    tpl = copy.deepcopy(base_template)
    tpl["node_types"][0]["features"] = ["scheduling", "budgeting"]
    return tpl


# ---------------------------------------------------------------------------
# Tests — injection
# ---------------------------------------------------------------------------

class TestFeatureInjection:

    def test_scheduling_injects_required_properties(self, scheduling_template):
        result = apply_feature_macros(scheduling_template)
        props = result["node_types"][0]["properties"]
        prop_ids = [p["id"] for p in props]

        assert "start_date" in prop_ids
        assert "end_date" in prop_ids
        assert "assigned_to" in prop_ids
        assert "estimated_hours" in prop_ids
        assert "actual_hours" in prop_ids
        assert "allocations" in prop_ids
        assert "status" in prop_ids

    def test_scheduling_properties_are_system_locked(self, scheduling_template):
        result = apply_feature_macros(scheduling_template)
        props = result["node_types"][0]["properties"]
        for p in props:
            if p["id"] in ("start_date", "end_date", "assigned_to", "estimated_hours", "actual_hours"):
                assert p["system_locked"] is True

    def test_scheduling_properties_have_correct_types(self, scheduling_template):
        result = apply_feature_macros(scheduling_template)
        prop_map = {p["id"]: p for p in result["node_types"][0]["properties"]}

        assert prop_map["start_date"]["type"] == "date"
        assert prop_map["end_date"]["type"] == "date"
        assert prop_map["assigned_to"]["type"] == "node_reference"
        assert prop_map["assigned_to"]["target_type"] == "person"
        assert prop_map["estimated_hours"]["type"] == "number"
        assert prop_map["actual_hours"]["type"] == "number"
        assert prop_map["allocations"]["type"] == "object"
        assert prop_map["status"]["type"] == "select"
        assert prop_map["status"]["indicator_set"] == "status"

    def test_scheduling_properties_have_ui_group(self, scheduling_template):
        result = apply_feature_macros(scheduling_template)
        prop_map = {p["id"]: p for p in result["node_types"][0]["properties"]}

        assert prop_map["start_date"]["ui_group"] == "Schedule"
        assert prop_map["end_date"]["ui_group"] == "Schedule"
        assert prop_map["assigned_to"]["ui_group"] == "Schedule"
        assert prop_map["estimated_hours"]["ui_group"] == "Schedule"
        assert prop_map["actual_hours"]["ui_group"] == "Schedule"
        assert prop_map["allocations"]["ui_group"] == "Schedule"
        assert prop_map["status"]["ui_group"] == "Schedule"

    def test_scheduling_semantic_roles(self, scheduling_template):
        result = apply_feature_macros(scheduling_template)
        prop_map = {p["id"]: p for p in result["node_types"][0]["properties"]}

        assert prop_map["start_date"]["semantic_role"] == "gantt_start"
        assert prop_map["end_date"]["semantic_role"] == "gantt_end"
        # assigned_to has no semantic_role
        assert "semantic_role" not in prop_map["assigned_to"]

    def test_budgeting_injects_estimated_cost(self, budgeting_template):
        result = apply_feature_macros(budgeting_template)
        prop_map = {p["id"]: p for p in result["node_types"][0]["properties"]}

        assert "estimated_cost" in prop_map
        assert prop_map["estimated_cost"]["type"] == "currency"
        assert prop_map["estimated_cost"]["system_locked"] is True
        assert prop_map["estimated_cost"]["ui_group"] == "Financial"
        assert "actual_cost" in prop_map
        assert prop_map["actual_cost"]["type"] == "currency"
        assert prop_map["actual_cost"]["system_locked"] is True
        assert prop_map["actual_cost"]["ui_group"] == "Financial"

    def test_both_features_inject_all_properties(self, both_features_template):
        result = apply_feature_macros(both_features_template)
        prop_ids = [p["id"] for p in result["node_types"][0]["properties"]]

        expected = {
            "start_date",
            "end_date",
            "assigned_to",
            "estimated_hours",
            "actual_hours",
            "allocations",
            "status",
            "estimated_cost",
            "actual_cost",
        }
        assert expected.issubset(set(prop_ids))


# ---------------------------------------------------------------------------
# Tests — preservation
# ---------------------------------------------------------------------------

class TestPropertyPreservation:

    def test_user_properties_preserved(self, scheduling_template):
        result = apply_feature_macros(scheduling_template)
        prop_ids = [p["id"] for p in result["node_types"][0]["properties"]]

        assert "name" in prop_ids
        assert "priority" in prop_ids

    def test_user_properties_appear_before_injected(self, scheduling_template):
        result = apply_feature_macros(scheduling_template)
        props = result["node_types"][0]["properties"]

        # "name" and "priority" should still be at the beginning
        assert props[0]["id"] == "name"
        assert props[1]["id"] == "priority"


# ---------------------------------------------------------------------------
# Tests — removal
# ---------------------------------------------------------------------------

class TestFeatureRemoval:

    def test_disabling_scheduling_removes_its_properties(self, scheduling_template):
        # First inject
        injected = apply_feature_macros(scheduling_template)
        prop_ids = [p["id"] for p in injected["node_types"][0]["properties"]]
        assert "start_date" in prop_ids

        # Now disable scheduling
        injected["node_types"][0]["features"] = []
        result = apply_feature_macros(injected)
        prop_ids = [p["id"] for p in result["node_types"][0]["properties"]]

        assert "start_date" not in prop_ids
        assert "end_date" not in prop_ids
        assert "assigned_to" not in prop_ids
        assert "estimated_hours" not in prop_ids
        assert "actual_hours" not in prop_ids
        assert "manual_allocations" not in prop_ids
        assert "status" not in prop_ids

    def test_disabling_budgeting_removes_estimated_cost(self, budgeting_template):
        injected = apply_feature_macros(budgeting_template)
        assert any(p["id"] == "estimated_cost" for p in injected["node_types"][0]["properties"])
        assert any(p["id"] == "actual_cost" for p in injected["node_types"][0]["properties"])

        injected["node_types"][0]["features"] = []
        result = apply_feature_macros(injected)
        assert not any(p["id"] == "estimated_cost" for p in result["node_types"][0]["properties"])
        assert not any(p["id"] == "actual_cost" for p in result["node_types"][0]["properties"])

    def test_removing_one_feature_keeps_other(self, both_features_template):
        injected = apply_feature_macros(both_features_template)

        # Disable only budgeting
        injected["node_types"][0]["features"] = ["scheduling"]
        result = apply_feature_macros(injected)
        prop_ids = [p["id"] for p in result["node_types"][0]["properties"]]

        assert "start_date" in prop_ids
        assert "estimated_cost" not in prop_ids

    def test_user_properties_preserved_on_removal(self, scheduling_template):
        injected = apply_feature_macros(scheduling_template)
        injected["node_types"][0]["features"] = []
        result = apply_feature_macros(injected)
        prop_ids = [p["id"] for p in result["node_types"][0]["properties"]]

        assert "name" in prop_ids
        assert "priority" in prop_ids

    def test_removal_only_targets_system_locked_props(self, scheduling_template):
        """If user manually created a property with a macro ID but without system_locked,
        it should NOT be removed when the feature is toggled off."""
        injected = apply_feature_macros(scheduling_template)
        # Simulate a user-created "start_date" without system_locked
        injected["node_types"][0]["properties"].append({
            "id": "start_date_custom",
            "label": "My Start Date",
            "type": "text",
        })
        injected["node_types"][0]["features"] = []
        result = apply_feature_macros(injected)
        prop_ids = [p["id"] for p in result["node_types"][0]["properties"]]

        assert "start_date_custom" in prop_ids


# ---------------------------------------------------------------------------
# Tests — re-injection
# ---------------------------------------------------------------------------

class TestReInjection:

    def test_re_enabling_feature_reinjects_properties(self, base_template):
        # Start with no features
        result = apply_feature_macros(base_template)
        assert not any(p["id"] == "start_date" for p in result["node_types"][0]["properties"])

        # Enable scheduling
        result["node_types"][0]["features"] = ["scheduling"]
        result = apply_feature_macros(result)
        assert any(p["id"] == "start_date" for p in result["node_types"][0]["properties"])


# ---------------------------------------------------------------------------
# Tests — edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:

    def test_no_features_key_is_noop(self, base_template):
        """Template without 'features' key should pass through unchanged."""
        original_props = [p["id"] for p in base_template["node_types"][0]["properties"]]
        result = apply_feature_macros(base_template)
        result_props = [p["id"] for p in result["node_types"][0]["properties"]]

        assert original_props == result_props

    def test_empty_features_list_preserves_template_authored_props(self):
        """Template-authored system_locked properties are preserved even when
        their matching feature is disabled (they were not macro-injected)."""
        template = {
            "id": "t",
            "name": "T",
            "version": "1.0",
            "node_types": [{
                "id": "x",
                "label": "X",
                "features": [],
                "properties": [
                    {"id": "name", "label": "Name", "type": "text"},
                    {"id": "start_date", "label": "Start Date", "type": "date", "system_locked": True},
                ],
            }],
        }
        result = apply_feature_macros(template)
        prop_ids = [p["id"] for p in result["node_types"][0]["properties"]]
        # Template-authored properties are kept even without the feature enabled
        assert "start_date" in prop_ids
        assert "name" in prop_ids

    def test_empty_features_list_removes_macro_injected_props(self):
        """Properties that were dynamically injected by a macro ARE removed
        when their feature is subsequently disabled."""
        template = {
            "id": "t",
            "name": "T",
            "version": "1.0",
            "node_types": [{
                "id": "x",
                "label": "X",
                "features": ["scheduling"],
                "properties": [
                    {"id": "name", "label": "Name", "type": "text"},
                ],
            }],
        }
        # First pass: inject scheduling properties
        result = apply_feature_macros(template)
        prop_ids = [p["id"] for p in result["node_types"][0]["properties"]]
        assert "start_date" in prop_ids

        # Disable the feature
        result["node_types"][0]["features"] = []
        result = apply_feature_macros(result)
        prop_ids = [p["id"] for p in result["node_types"][0]["properties"]]
        assert "start_date" not in prop_ids
        assert "name" in prop_ids

    def test_empty_node_types(self):
        result = apply_feature_macros({"node_types": []})
        assert result["node_types"] == []

    def test_no_node_types_key(self):
        result = apply_feature_macros({})
        assert result == {}

    def test_multiple_node_types_independent(self):
        """Each node type's features are applied independently."""
        template = {
            "id": "multi",
            "name": "Multi",
            "version": "1.0",
            "node_types": [
                {
                    "id": "a",
                    "label": "A",
                    "features": ["scheduling"],
                    "properties": [],
                },
                {
                    "id": "b",
                    "label": "B",
                    "features": ["budgeting"],
                    "properties": [],
                },
            ],
        }
        result = apply_feature_macros(template)

        a_ids = {p["id"] for p in result["node_types"][0]["properties"]}
        b_ids = {p["id"] for p in result["node_types"][1]["properties"]}

        assert "start_date" in a_ids
        assert "estimated_cost" not in a_ids
        assert "estimated_cost" in b_ids
        assert "start_date" not in b_ids

    def test_idempotent_application(self, scheduling_template):
        """Applying macros twice should produce the same result."""
        first = apply_feature_macros(copy.deepcopy(scheduling_template))
        second = apply_feature_macros(copy.deepcopy(first))

        first_props = first["node_types"][0]["properties"]
        second_props = second["node_types"][0]["properties"]

        assert len(first_props) == len(second_props)
        for a, b in zip(first_props, second_props):
            assert a == b

    def test_returns_same_object(self, base_template):
        """apply_feature_macros mutates and returns the same dict."""
        result = apply_feature_macros(base_template)
        assert result is base_template


class TestMacroDefinitions:

    def test_all_macro_properties_have_required_fields(self):
        """Every macro property definition must have id, label, type, system_locked."""
        for feature, props in FEATURE_MACROS.items():
            for prop in props:
                assert "id" in prop, f"{feature}: missing id"
                assert "label" in prop, f"{feature}: missing label"
                assert "type" in prop, f"{feature}: missing type"
                assert prop.get("system_locked") is True, f"{feature}/{prop['id']}: must be system_locked"

    def test_all_macro_properties_have_ui_group(self):
        """Every macro property should have a ui_group for frontend grouping."""
        for feature, props in FEATURE_MACROS.items():
            for prop in props:
                assert "ui_group" in prop, f"{feature}/{prop['id']}: missing ui_group"


class TestPersonFeatureAutoCorrection:
    """is_person feature is auto-added to node types with id=='person'."""

    def test_person_node_type_gets_is_person_feature(self):
        template = {
            "node_types": [
                {"id": "person", "label": "Person", "features": [], "properties": []},
            ]
        }
        apply_feature_macros(template)
        nt = template["node_types"][0]
        assert "is_person" in nt["features"]

    def test_person_feature_not_duplicated_when_already_present(self):
        template = {
            "node_types": [
                {"id": "person", "label": "Person", "features": ["is_person"], "properties": []},
            ]
        }
        apply_feature_macros(template)
        assert template["node_types"][0]["features"].count("is_person") == 1

    def test_non_person_node_type_not_affected(self):
        template = {
            "node_types": [
                {"id": "task", "label": "Task", "features": [], "properties": []},
            ]
        }
        apply_feature_macros(template)
        assert "is_person" not in template["node_types"][0]["features"]
