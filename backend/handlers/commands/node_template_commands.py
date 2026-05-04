"""Commands implementing the Node Templates feature.

Four commands route through the standard CommandDispatcher so they all
participate in undo/redo:

* CreateNodeTemplateCommand  – save a new subtree template into the project
* UpdateNodeTemplateCommand  – replace an existing template (full overwrite)
* DeleteNodeTemplateCommand  – remove a saved template
* InstantiateNodeTemplateCommand – materialise a template's subtree under a parent

Templates live in ``session_data['node_templates']`` (a dict keyed by id) and
are serialised in the project file by the frontend save flow.
"""

from __future__ import annotations

import copy
from typing import Any, Dict, List, Optional
from uuid import UUID

from backend.handlers.command import Command
from backend.core.node import Node
from backend.core.node_templates import (
    NodeTemplate,
    NodeTemplateNode,
    validate_template_against_blueprint,
)


class _TemplateStoreCommand(Command):
    """Base for commands that mutate the per-session node-template store."""

    def __init__(self, store: Dict[str, NodeTemplate], session_id: Optional[str] = None):
        self.store = store
        self.session_id = session_id


class CreateNodeTemplateCommand(_TemplateStoreCommand):
    """Add a new NodeTemplate to the session store."""

    def __init__(
        self,
        template: NodeTemplate,
        store: Dict[str, NodeTemplate],
        blueprint: Any = None,
        session_id: Optional[str] = None,
    ):
        super().__init__(store, session_id)
        self.template = template
        self.blueprint = blueprint
        self._already_existed: bool = False

    def execute(self) -> str:
        if self.blueprint is not None:
            errors = validate_template_against_blueprint(self.template, self.blueprint)
            if errors:
                raise ValueError("; ".join(errors))
        self._already_existed = self.template.id in self.store
        self.store[self.template.id] = self.template
        return self.template.id

    def undo(self) -> None:
        if not self._already_existed:
            self.store.pop(self.template.id, None)


class UpdateNodeTemplateCommand(_TemplateStoreCommand):
    """Replace an existing NodeTemplate in the store (full overwrite)."""

    def __init__(
        self,
        template_id: str,
        new_template: NodeTemplate,
        store: Dict[str, NodeTemplate],
        blueprint: Any = None,
        session_id: Optional[str] = None,
    ):
        super().__init__(store, session_id)
        self.template_id = template_id
        self.new_template = new_template
        self.blueprint = blueprint
        self._previous: Optional[NodeTemplate] = None

    def execute(self) -> str:
        if self.template_id not in self.store:
            raise ValueError(f"Node template '{self.template_id}' not found")
        if self.blueprint is not None:
            errors = validate_template_against_blueprint(self.new_template, self.blueprint)
            if errors:
                raise ValueError("; ".join(errors))
        self._previous = self.store[self.template_id]
        # Preserve the id even if caller passed a different one in new_template.
        replacement = NodeTemplate(
            id=self.template_id,
            name=self.new_template.name,
            description=self.new_template.description,
            root=self.new_template.root,
        )
        self.store[self.template_id] = replacement
        return self.template_id

    def undo(self) -> None:
        if self._previous is not None:
            self.store[self.template_id] = self._previous


class DeleteNodeTemplateCommand(_TemplateStoreCommand):
    """Remove a NodeTemplate from the store."""

    def __init__(
        self,
        template_id: str,
        store: Dict[str, NodeTemplate],
        session_id: Optional[str] = None,
    ):
        super().__init__(store, session_id)
        self.template_id = template_id
        self._removed: Optional[NodeTemplate] = None

    def execute(self) -> str:
        if self.template_id not in self.store:
            raise ValueError(f"Node template '{self.template_id}' not found")
        self._removed = self.store.pop(self.template_id)
        return self.template_id

    def undo(self) -> None:
        if self._removed is not None:
            self.store[self._removed.id] = self._removed


class InstantiateNodeTemplateCommand(Command):
    """Materialise a NodeTemplate's subtree as real nodes under ``parent_id``.

    The command walks the template tree depth-first, creating one Node per
    template node, copying ``properties`` verbatim as defaults. Each created
    node is attached to its template parent's resulting node (and the root is
    attached to ``parent_id``).

    Validation occurs against the blueprint (parent must allow the root type,
    each template parent→child must be allowed). On any validation failure
    no nodes are created.

    Undo removes every created node from the graph (and from its parent's
    children list).
    """

    def __init__(
        self,
        template: NodeTemplate,
        parent_id: UUID,
        graph,
        blueprint=None,
        session_id: Optional[str] = None,
    ):
        self.template = template
        self.parent_id = parent_id
        self.graph = graph
        self.blueprint = blueprint
        self.session_id = session_id
        self.created_node_ids: List[UUID] = []

    def execute(self) -> List[UUID]:
        if not self.graph:
            raise ValueError("Graph is required to instantiate a node template")

        parent_node = self.graph.get_node(self.parent_id)
        if not parent_node:
            raise ValueError(f"Parent node {self.parent_id} not found")

        if self.blueprint is not None:
            if hasattr(self.blueprint, "is_allowed_child") and not self.blueprint.is_allowed_child(
                parent_node.blueprint_type_id, self.template.root.blueprint_type_id
            ):
                raise ValueError(
                    f"Template root type '{self.template.root.blueprint_type_id}' is not "
                    f"allowed under parent type '{parent_node.blueprint_type_id}'"
                )
            errors = validate_template_against_blueprint(self.template, self.blueprint)
            if errors:
                raise ValueError("; ".join(errors))

        self.created_node_ids = []
        # Lazy import to avoid circulars
        from backend.api.broadcaster import emit_node_created

        def _create(template_node: NodeTemplateNode, parent: Node) -> Node:
            new_node = Node(
                blueprint_type_id=template_node.blueprint_type_id,
                name=template_node.name or "",
            )
            new_node.properties = copy.deepcopy(template_node.properties or {})
            # Mirror name into the property dict using the resolved UUID key,
            # matching ImportNodesCommand behaviour.
            if self.blueprint is not None and template_node.name:
                pmap = self.blueprint.build_property_uuid_map(template_node.blueprint_type_id) or {}
                name_key = pmap.get("name", "name")
                new_node.properties[name_key] = template_node.name

            self.graph.add_node(new_node)
            if new_node.id not in parent.children:
                parent.children.append(new_node.id)
            new_node.parent_id = parent.id
            self.created_node_ids.append(new_node.id)

            if self.session_id:
                emit_node_created(
                    self.session_id,
                    str(new_node.id),
                    str(parent.id),
                    template_node.blueprint_type_id,
                    new_node.name,
                )

            for child_template in template_node.children:
                _create(child_template, new_node)
            return new_node

        _create(self.template.root, parent_node)
        return list(self.created_node_ids)

    def undo(self) -> None:
        if not self.graph:
            return
        # Remove from parent children list (root only — the rest are already
        # detached when we remove their parents, but we explicitly clean up
        # each parent reference for safety).
        for node_id in self.created_node_ids:
            node = self.graph.get_node(node_id)
            if node and node.parent_id:
                parent = self.graph.get_node(node.parent_id)
                if parent and node_id in parent.children:
                    parent.children.remove(node_id)
        for node_id in self.created_node_ids:
            self.graph.remove_node(node_id)
        self.created_node_ids = []
