"""
Template migration system for handling schema version changes.

When a template version changes, migrations transform existing projects to match
the new schema without data loss.
"""
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from uuid import UUID
import logging

logger = logging.getLogger(__name__)


@dataclass
class NodeTypeMigration:
    """Migration rule for a node type."""
    old_type: str
    new_type: str
    # Properties to keep (key: old_prop_id, value: new_prop_id or None to drop)
    property_map: Dict[str, Optional[str]]
    # New default properties if type changed
    new_defaults: Dict[str, Any] = None

    def __post_init__(self):
        if self.new_defaults is None:
            self.new_defaults = {}


@dataclass
class TemplateMigration:
    """Defines migrations from one template version to another."""
    from_version: str
    to_version: str
    description: str
    # Node type migrations
    node_migrations: List[NodeTypeMigration]
    # Function to run custom logic if needed
    custom_transform: Optional[callable] = None

    def apply(self, project_graph) -> Tuple[bool, List[str]]:
        """
        Apply migration to a project graph.
        
        Args:
            project_graph: The ProjectGraph to migrate
            
        Returns:
            Tuple of (success: bool, messages: List[str])
        """
        messages = []
        try:
            # Build migration map for quick lookup
            migration_map = {m.old_type: m for m in self.node_migrations}
            
            # Track nodes that were migrated
            migrated_count = 0
            
            for node in list(project_graph.nodes.values()):
                if node.blueprint_type_id in migration_map:
                    migration = migration_map[node.blueprint_type_id]
                    messages.append(
                        f"Migrating node '{node.name}' from type '{node.blueprint_type_id}' to '{migration.new_type}'"
                    )
                    
                    # Change node type
                    node.blueprint_type_id = migration.new_type
                    
                    # Migrate properties
                    old_props = dict(node.properties)
                    node.properties = {}
                    
                    for old_prop_id, new_prop_id in migration.property_map.items():
                        if new_prop_id is None:
                            # Property was removed
                            if old_prop_id in old_props:
                                messages.append(
                                    f"  Dropped property '{old_prop_id}' (no longer in schema)"
                                )
                        else:
                            # Property was renamed or kept
                            if old_prop_id in old_props:
                                node.properties[new_prop_id] = old_props[old_prop_id]
                    
                    # Add new defaults
                    for prop_id, value in migration.new_defaults.items():
                        if prop_id not in node.properties:
                            node.properties[prop_id] = value
                    
                    migrated_count += 1
            
            messages.insert(0, f"Migration {self.from_version} → {self.to_version}: {migrated_count} nodes updated")
            
            # Run custom transforms if provided
            if self.custom_transform:
                custom_messages = self.custom_transform(project_graph) or []
                messages.extend(custom_messages)
            
            return True, messages
            
        except Exception as e:
            logger.error(f"Migration failed: {e}", exc_info=True)
            return False, [f"Migration failed: {str(e)}"]


class MigrationRegistry:
    """Registry of all template migrations."""
    
    def __init__(self):
        self.migrations: Dict[Tuple[str, str], TemplateMigration] = {}
    
    def register(self, migration: TemplateMigration) -> None:
        """Register a migration."""
        key = (migration.from_version, migration.to_version)
        self.migrations[key] = migration
        logger.info(f"Registered migration: {migration.from_version} → {migration.to_version}")
    
    def get_migration_path(self, from_version: str, to_version: str) -> List[TemplateMigration]:
        """
        Get the migration path from one version to another.
        
        Uses BFS to find shortest path through migration graph.
        """
        if from_version == to_version:
            return []
        
        # BFS to find path
        from collections import deque
        queue = deque([(from_version, [])])
        visited = {from_version}
        
        while queue:
            current_version, path = queue.popleft()
            
            # Find all migrations from current version
            for (from_v, to_v), migration in self.migrations.items():
                if from_v == current_version and to_v not in visited:
                    new_path = path + [migration]
                    
                    if to_v == to_version:
                        return new_path
                    
                    visited.add(to_v)
                    queue.append((to_v, new_path))
        
        return []  # No path found
    
    def apply_migrations(self, project_graph, from_version: str, to_version: str) -> Tuple[bool, List[str]]:
        """
        Apply all migrations from one version to another.
        
        Args:
            project_graph: The ProjectGraph to migrate
            from_version: Starting template version
            to_version: Target template version
            
        Returns:
            Tuple of (success: bool, all_messages: List[str])
        """
        path = self.get_migration_path(from_version, to_version)
        
        if not path:
            if from_version == to_version:
                post_messages = self._post_migration_normalize(project_graph)
                if post_messages:
                    return True, [f"Template already at version {to_version}"] + post_messages
                return True, [f"Template already at version {to_version}"]
            else:
                return False, [f"No migration path from {from_version} to {to_version}"]
        
        all_messages = []
        
        for migration in path:
            success, messages = migration.apply(project_graph)
            all_messages.extend(messages)
            
            if not success:
                return False, all_messages
        
        all_messages.extend(self._post_migration_normalize(project_graph))

        return True, all_messages

    def _post_migration_normalize(self, project_graph) -> List[str]:
        """Normalize fields that should align with the active template schema."""
        messages: List[str] = []
        try:
            from backend.infra.schema_loader import SchemaLoader

            loader = SchemaLoader()
            template_id = getattr(project_graph, 'template_id', None)
            if not template_id:
                return ["[WARN] Could not validate icons/selects: template_id missing on project_graph."]

            blueprint = None
            for candidate in [f"{template_id}.yaml", template_id]:
                try:
                    blueprint = loader.load(candidate)
                    if blueprint:
                        break
                except Exception:
                    continue

            if not blueprint:
                return ["[WARN] Could not load template for post-migration normalization."]

            for node in project_graph.nodes.values():
                node_type_def = blueprint._node_type_map.get(node.blueprint_type_id)
                if not node_type_def:
                    messages.append(
                        f"[WARN] Node {node.name} ({node.id}) has unknown type '{node.blueprint_type_id}'."
                    )
                    continue

                icon_default = node_type_def._extra_props.get('icon')
                if icon_default and 'icon' not in node.properties:
                    node.properties['icon'] = icon_default
                    messages.append(
                        f"[FIX] Set default icon for node {node.name} ({node.id}) to '{icon_default}'"
                    )

                properties = node_type_def._extra_props.get('properties', [])
                for prop in properties:
                    if prop.get('type') != 'select' or 'options' not in prop:
                        continue

                    prop_id = prop.get('id') or prop.get('name')
                    if not prop_id:
                        continue

                    valid_option_ids = {
                        str(opt.get('id'))
                        for opt in prop['options']
                        if isinstance(opt, dict) and opt.get('id') is not None
                    }
                    name_to_id = {
                        (opt.get('name') or opt.get('label')): str(opt.get('id'))
                        for opt in prop['options']
                        if isinstance(opt, dict) and opt.get('id') is not None
                    }

                    current_val = node.properties.get(prop_id)
                    if current_val is None:
                        continue

                    current_val_str = str(current_val)
                    if current_val_str in valid_option_ids:
                        continue

                    if current_val in name_to_id:
                        node.properties[prop_id] = name_to_id[current_val]
                        messages.append(
                            f"[FIX] Normalized select value for node {node.name} ({node.id}) property '{prop_id}' to option UUID"
                        )
                    elif prop['options']:
                        fallback_id = str(prop['options'][0].get('id'))
                        node.properties[prop_id] = fallback_id
                        messages.append(
                            f"[FIX] Set default select value for node {node.name} ({node.id}) property '{prop_id}' to '{fallback_id}'"
                        )
        except Exception as e:
            messages.append(
                f"[ERROR] Post-migration normalization failed: {type(e).__name__}: {e}"
            )

        return messages


# Global migration registry
_migration_registry = MigrationRegistry()


def get_migration_registry() -> MigrationRegistry:
    """Get the global migration registry."""
    return _migration_registry


def register_migration(migration: TemplateMigration) -> None:
    """Register a migration in the global registry."""
    _migration_registry.register(migration)
