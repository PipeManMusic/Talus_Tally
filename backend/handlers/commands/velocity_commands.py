from typing import Optional, List, Dict, Any, Tuple
from uuid import UUID

from backend.handlers.command import Command


def _find_status_property_and_blocked_option(
    blueprint: Any,
    node_type_id: str,
) -> Optional[Tuple[str, str]]:
    """Locate the (status_property_id, blocked_option_id) pair for a node type.

    Returns ``None`` if the node type has no status select with a "Blocked"
    option (e.g. node types without the scheduling feature).
    """
    if blueprint is None:
        return None
    node_type = blueprint.get_node_type(node_type_id)
    if node_type is None:
        return None
    properties = getattr(node_type, "properties", None) or []

    primary_id = getattr(node_type, "primary_status_property_id", None)
    candidates: List[Dict[str, Any]] = []
    if primary_id:
        for prop in properties:
            if isinstance(prop, dict) and prop.get("id") == primary_id:
                candidates.append(prop)
                break
    if not candidates:
        # Prefer the macro-injected/system-locked status property; fall
        # back to any select property whose options include "Blocked".
        for prop in properties:
            if not isinstance(prop, dict):
                continue
            if prop.get("type") != "select":
                continue
            key = prop.get("key")
            if key == "status" or prop.get("_macro_injected") or prop.get("system_locked"):
                candidates.append(prop)
        if not candidates:
            for prop in properties:
                if isinstance(prop, dict) and prop.get("type") == "select":
                    candidates.append(prop)

    for prop in candidates:
        options = prop.get("options") or []
        for option in options:
            if isinstance(option, dict) and option.get("name") == "Blocked":
                option_id = option.get("id")
                prop_id = prop.get("id")
                if option_id and prop_id:
                    return (str(prop_id), str(option_id))
    return None


class UpdateBlockingRelationshipCommand(Command):
    """Command to update a blocking relationship with undo support.

    When a blocking relationship is newly created, the blocked node's status
    is automatically set to "Blocked" (if its node type has such an option).
    The previous status value is captured so undo can restore it.
    """

    def __init__(
        self,
        blocked_node_id: str,
        new_blocking_node_id: Optional[str],
        relationships: List[Dict[str, str]],
        session_id: Optional[str] = None,
        graph: Any = None,
        blueprint: Any = None,
    ) -> None:
        self.blocked_node_id = blocked_node_id
        self.new_blocking_node_id = new_blocking_node_id
        self.relationships = relationships
        self.session_id = session_id
        self.graph = graph
        self.blueprint = blueprint
        self.previous_blocking_node_id: Optional[str] = None
        # Tracks status mutation we performed so undo can revert it.
        # _had_previous_status indicates whether the property key existed
        # on the node before; this distinguishes "restore old value" from
        # "delete the key we added".
        self._status_property_id: Optional[str] = None
        self._previous_status_value: Any = None
        self._had_previous_status: bool = False
        self._status_mutated: bool = False

    def _resolve_node(self) -> Any:
        if self.graph is None or not self.blocked_node_id:
            return None
        nodes = getattr(self.graph, "nodes", None)
        if not isinstance(nodes, dict):
            return None
        try:
            uuid_key = UUID(self.blocked_node_id)
        except (ValueError, TypeError, AttributeError):
            uuid_key = None
        if uuid_key is not None and uuid_key in nodes:
            return nodes[uuid_key]
        # Fallback: stringified-key lookup (defensive against mixed key types).
        for key, node in nodes.items():
            if str(key) == str(self.blocked_node_id):
                return node
        return None

    def execute(self) -> None:
        # Store previous relationship if it exists
        self.previous_blocking_node_id = next(
            (
                rel.get("blockingNodeId")
                for rel in self.relationships
                if rel.get("blockedNodeId") == self.blocked_node_id
            ),
            None,
        )

        # Remove any existing relationship for this blocked node
        self.relationships[:] = [
            rel for rel in self.relationships
            if rel.get("blockedNodeId") != self.blocked_node_id
        ]

        # Add new relationship if provided
        if self.new_blocking_node_id:
            self.relationships.append({
                "blockedNodeId": self.blocked_node_id,
                "blockingNodeId": self.new_blocking_node_id,
            })

        # If a blocking relationship was newly created (none existed
        # before), set the blocked node's status to "Blocked".
        is_new_relationship = (
            self.new_blocking_node_id is not None
            and self.previous_blocking_node_id is None
        )
        if not is_new_relationship:
            return

        node = self._resolve_node()
        if node is None:
            return
        type_id = getattr(node, "blueprint_type_id", None)
        if not type_id:
            return
        resolved = _find_status_property_and_blocked_option(self.blueprint, type_id)
        if resolved is None:
            return
        prop_id, blocked_option_id = resolved
        properties = getattr(node, "properties", None)
        if not isinstance(properties, dict):
            return
        had_previous = prop_id in properties
        previous_value = properties.get(prop_id)
        # No-op if the node is already marked Blocked.
        if had_previous and previous_value == blocked_option_id:
            return
        properties[prop_id] = blocked_option_id
        self._status_property_id = prop_id
        self._previous_status_value = previous_value
        self._had_previous_status = had_previous
        self._status_mutated = True

    def undo(self) -> None:
        # Remove current relationship for this blocked node
        self.relationships[:] = [
            rel for rel in self.relationships
            if rel.get("blockedNodeId") != self.blocked_node_id
        ]

        # Restore previous relationship if it existed
        if self.previous_blocking_node_id:
            self.relationships.append({
                "blockedNodeId": self.blocked_node_id,
                "blockingNodeId": self.previous_blocking_node_id,
            })

        # Revert any status mutation we performed
        if not self._status_mutated or not self._status_property_id:
            return
        node = self._resolve_node()
        if node is None:
            return
        properties = getattr(node, "properties", None)
        if not isinstance(properties, dict):
            return
        if self._had_previous_status:
            properties[self._status_property_id] = self._previous_status_value
        else:
            properties.pop(self._status_property_id, None)
        self._status_mutated = False
