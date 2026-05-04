"""Dataclasses describing reusable node-subtree templates saved in the project file.

A ``NodeTemplate`` is a user-defined preset that captures a tree of nodes
(root + children, recursive) with default property values. Users create them
through the Tools → Node Templates editor and instantiate them under any
compatible parent node to quickly add a common grouping of nodes.

The templates are persisted as part of the project JSON and live in the
session's ``node_templates`` dict (keyed by template id).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from uuid import uuid4


@dataclass
class NodeTemplateNode:
    """A single node within a NodeTemplate (recursive)."""

    blueprint_type_id: str
    name: str = ""
    properties: Dict[str, Any] = field(default_factory=dict)
    children: List["NodeTemplateNode"] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "blueprint_type_id": self.blueprint_type_id,
            "name": self.name,
            "properties": dict(self.properties or {}),
            "children": [c.to_dict() for c in self.children],
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "NodeTemplateNode":
        if not isinstance(data, dict):
            raise ValueError("NodeTemplateNode requires a dict")
        bp = data.get("blueprint_type_id") or data.get("type")
        if not bp:
            raise ValueError("NodeTemplateNode missing blueprint_type_id")
        children_raw = data.get("children", []) or []
        return cls(
            blueprint_type_id=str(bp),
            name=str(data.get("name", "") or ""),
            properties=dict(data.get("properties", {}) or {}),
            children=[cls.from_dict(c) for c in children_raw],
        )


@dataclass
class NodeTemplate:
    """A named, savable subtree template scoped to a single project."""

    id: str
    name: str
    root: NodeTemplateNode
    description: str = ""

    @classmethod
    def new(cls, name: str, root: NodeTemplateNode, description: str = "") -> "NodeTemplate":
        return cls(id=str(uuid4()), name=name, root=root, description=description)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "root": self.root.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "NodeTemplate":
        if not isinstance(data, dict):
            raise ValueError("NodeTemplate requires a dict")
        tid = data.get("id")
        name = data.get("name")
        root = data.get("root")
        if not tid or not name or not isinstance(root, dict):
            raise ValueError("NodeTemplate requires id, name, and root")
        return cls(
            id=str(tid),
            name=str(name),
            description=str(data.get("description", "") or ""),
            root=NodeTemplateNode.from_dict(root),
        )


def validate_template_against_blueprint(
    template: NodeTemplate, blueprint: Any
) -> List[str]:
    """Walk the template tree and return a list of error messages.

    Verifies every parent→child relation is allowed by the blueprint.
    Unknown blueprint types are reported as errors. An empty list means valid.
    """
    errors: List[str] = []
    if blueprint is None:
        return errors

    def walk(parent_node: NodeTemplateNode) -> None:
        if hasattr(blueprint, "get_node_type"):
            if blueprint.get_node_type(parent_node.blueprint_type_id) is None:
                errors.append(
                    f"Unknown node type '{parent_node.blueprint_type_id}'"
                )
        for child in parent_node.children:
            if hasattr(blueprint, "is_allowed_child"):
                if not blueprint.is_allowed_child(
                    parent_node.blueprint_type_id, child.blueprint_type_id
                ):
                    errors.append(
                        f"Type '{child.blueprint_type_id}' is not allowed under "
                        f"'{parent_node.blueprint_type_id}'"
                    )
            walk(child)

    walk(template.root)
    return errors


def is_template_compatible_with_parent(
    template: NodeTemplate, parent_blueprint_type_id: Optional[str], blueprint: Any
) -> bool:
    """Return True if the template's root type can be a child of the given parent type."""
    if parent_blueprint_type_id is None or blueprint is None:
        # If we have no parent context we can't validate; allow.
        return True
    if not hasattr(blueprint, "is_allowed_child"):
        return True
    return bool(
        blueprint.is_allowed_child(
            parent_blueprint_type_id, template.root.blueprint_type_id
        )
    )
