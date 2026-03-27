"""
Property UUID resolution utility for backend engines.

After the property UUID migration, ``node.properties`` is keyed by
deterministic UUIDs.  Backend engines that reference well-known property
keys (``"start_date"``, ``"status"``, etc.) use this resolver to
transparently translate semantic keys into the correct UUID keys.
"""

from typing import Any, Dict, Optional


class PropertyResolver:
    """Resolve semantic property keys to UUIDs given a Blueprint context."""

    def __init__(self, blueprint=None):
        self._maps: Dict[str, Dict[str, str]] = {}
        if blueprint and hasattr(blueprint, 'build_all_property_uuid_maps'):
            self._maps = blueprint.build_all_property_uuid_maps()

    # ------------------------------------------------------------------
    # Core resolution
    # ------------------------------------------------------------------

    def key(self, node_type_id: str, prop_key: str) -> str:
        """Return the UUID for *prop_key* on *node_type_id*.

        Falls back to *prop_key* itself when no mapping exists (e.g.
        when the blueprint is unavailable).
        """
        return self._maps.get(node_type_id, {}).get(prop_key, prop_key)

    # ------------------------------------------------------------------
    # Convenience accessors
    # ------------------------------------------------------------------

    @staticmethod
    def _node_type(node: Any) -> str:
        if hasattr(node, 'blueprint_type_id'):
            return node.blueprint_type_id or ''
        if isinstance(node, dict):
            return node.get('type', '') or node.get('blueprint_type_id', '')
        return ''

    @staticmethod
    def _node_props(node: Any) -> dict:
        if hasattr(node, 'properties'):
            return node.properties if isinstance(node.properties, dict) else {}
        if isinstance(node, dict):
            p = node.get('properties')
            return p if isinstance(p, dict) else {}
        return {}

    def get(self, node: Any, prop_key: str, default: Any = None) -> Any:
        """Read a property value using its semantic key."""
        ntype = self._node_type(node)
        uuid_key = self.key(ntype, prop_key)
        return self._node_props(node).get(uuid_key, default)

    def set(self, node: Any, prop_key: str, value: Any) -> None:
        """Write a property value using its semantic key."""
        ntype = self._node_type(node)
        uuid_key = self.key(ntype, prop_key)
        if hasattr(node, 'properties'):
            if node.properties is None:
                node.properties = {}
            node.properties[uuid_key] = value
        elif isinstance(node, dict):
            node.setdefault('properties', {})[uuid_key] = value

    def map_for(self, node_type_id: str) -> Dict[str, str]:
        """Return the full ``{prop_key: uuid}`` map for a node type."""
        return dict(self._maps.get(node_type_id, {}))
