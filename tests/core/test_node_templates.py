"""Tests for the NodeTemplate dataclasses + validation helper."""

import pytest

from backend.core.node_templates import (
    NodeTemplate,
    NodeTemplateNode,
    is_template_compatible_with_parent,
    validate_template_against_blueprint,
)


class DummyNodeType:
    def __init__(self, type_id, allowed_children):
        self.id = type_id
        self.allowed_children = allowed_children


class DummyBlueprint:
    def __init__(self):
        self._types = {
            "project_root": DummyNodeType("project_root", ["folder", "task"]),
            "folder": DummyNodeType("folder", ["task"]),
            "task": DummyNodeType("task", []),
        }

    def is_allowed_child(self, parent_type, child_type):
        nt = self._types.get(parent_type)
        return bool(nt and child_type in nt.allowed_children)

    def get_node_type(self, ref):
        return self._types.get(ref)

    def build_property_uuid_map(self, node_type_ref):
        return {"name": "name"}


def _make_template():
    root = NodeTemplateNode(
        blueprint_type_id="folder",
        name="Camera Kit",
        children=[
            NodeTemplateNode(blueprint_type_id="task", name="Set up camera"),
            NodeTemplateNode(blueprint_type_id="task", name="Frame shot"),
        ],
    )
    return NodeTemplate.new(name="Camera Kit", root=root, description="Standard camera prep")


def test_node_template_roundtrip():
    template = _make_template()
    serialised = template.to_dict()
    restored = NodeTemplate.from_dict(serialised)
    assert restored.id == template.id
    assert restored.name == "Camera Kit"
    assert restored.root.blueprint_type_id == "folder"
    assert len(restored.root.children) == 2
    assert restored.root.children[0].name == "Set up camera"


def test_validate_template_against_blueprint_ok():
    template = _make_template()
    blueprint = DummyBlueprint()
    assert validate_template_against_blueprint(template, blueprint) == []


def test_validate_template_against_blueprint_rejects_disallowed_child():
    template = _make_template()
    template.root.children.append(NodeTemplateNode(blueprint_type_id="folder", name="Nested"))
    blueprint = DummyBlueprint()
    errors = validate_template_against_blueprint(template, blueprint)
    assert errors and "folder" in errors[0]


def test_validate_template_against_blueprint_rejects_unknown_type():
    template = _make_template()
    template.root.children.append(NodeTemplateNode(blueprint_type_id="bogus", name="Nope"))
    blueprint = DummyBlueprint()
    errors = validate_template_against_blueprint(template, blueprint)
    assert any("bogus" in err for err in errors)


def test_is_template_compatible_with_parent():
    template = _make_template()
    blueprint = DummyBlueprint()
    assert is_template_compatible_with_parent(template, "project_root", blueprint) is True
    assert is_template_compatible_with_parent(template, "task", blueprint) is False
    assert is_template_compatible_with_parent(template, None, blueprint) is True


def test_node_template_from_dict_rejects_invalid():
    with pytest.raises(ValueError):
        NodeTemplate.from_dict({"name": "missing-id"})
    with pytest.raises(ValueError):
        NodeTemplateNode.from_dict({"name": "missing-type"})
