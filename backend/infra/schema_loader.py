import yaml
import uuid
import hashlib
import os
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional
from backend.infra.icon_catalog import IconCatalog
from backend.infra.template_validator import TemplateValidator, TemplateValidationError
from backend.infra.template_persistence import get_templates_directory
from backend.infra.user_data_dir import (
    get_user_icons_dir,
    get_user_indicators_dir,
)


def _generate_stable_uuid(namespace: str, name: str) -> str:
    """Generate a stable UUID based on content hash (deterministic).
    
    Args:
        namespace: Context for the UUID (e.g., "task.status" for status option)
        name: The name/value to generate UUID for (e.g., "In Progress")
        
    Returns:
        A stable UUID string
    """
    # Create a deterministic UUID based on the namespace and name
    # This ensures the same option always gets the same UUID
    seed = f"{namespace}:{name}".encode('utf-8')
    hash_obj = hashlib.sha1(seed)
    return str(uuid.UUID(bytes=hash_obj.digest()[:16]))


class IndicatorCatalog:
    """Registry of indicator sets with themes."""
    
    def __init__(self, indicator_sets: Dict[str, Dict[str, Any]], catalog_dir: str):
        """Initialize indicator catalog.
        
        Args:
            indicator_sets: Dict of indicator set definitions
            catalog_dir: Directory where catalog.yaml is located (for resolving SVG paths)
        """
        self.indicator_sets = indicator_sets
        self.catalog_dir = catalog_dir
    
    @classmethod
    def load(cls, filepath: str) -> "IndicatorCatalog":
        """Load indicator catalog from YAML file.
        
        Args:
            filepath: Path to catalog.yaml
            
        Returns:
            IndicatorCatalog instance
        """
        with open(filepath, 'r') as f:
            data = yaml.safe_load(f)
        data = data or {}
        
        indicator_sets = data.get('indicator_sets', {})
        catalog_dir = os.path.dirname(os.path.abspath(filepath))
        
        return cls(indicator_sets, catalog_dir)
    
    def get_indicator_file(self, set_id: str, indicator_id: str) -> Optional[str]:
        """Get the full path to an indicator SVG file.
        
        Args:
            set_id: Indicator set ID (e.g., "status")
            indicator_id: Indicator ID within the set (e.g., "empty")
            
        Returns:
            Full path to SVG file or None if not found
        """
        if set_id not in self.indicator_sets:
            return None
        
        indicator_set = self.indicator_sets[set_id]
        indicators = indicator_set.get("indicators", [])
        
        for indicator in indicators:
            if indicator.get("id") == indicator_id:
                filename = indicator.get("file")
                if filename:
                    return os.path.join(self.catalog_dir, filename)
        
        return None
    
    def get_indicator_theme(self, set_id: str, indicator_id: str) -> Optional[Dict[str, Any]]:
        """Get the theme (color, styling) for an indicator.
        
        Args:
            set_id: Indicator set ID (e.g., "status")
            indicator_id: Indicator ID within the set (e.g., "empty")
            
        Returns:
            Theme dict with indicator_color, text_color, text_style, or None
        """
        if set_id not in self.indicator_sets:
            return None
        
        indicator_set = self.indicator_sets[set_id]
        default_theme = indicator_set.get("default_theme", {})
        
        if indicator_id in default_theme:
            return default_theme[indicator_id].copy()
        
        return None


class NodeTypeDef:
    """Definition of a node type from a blueprint."""
    
    def __init__(self, id: str = None, label: str = None, name: str = None, allowed_children: List[str] = None, allowed_asset_types: List[str] = None, properties: List[Dict[str, Any]] = None, primary_status_property_id: str = None, features: List[str] = None, **kwargs):
        # The uuid is the stable identity for this node type.  Legacy
        # templates supply only ``id`` (a slug like "equipment"); the
        # SchemaLoader migration layer generates a deterministic uuid from
        # it and stores it in ``kwargs['uuid']``.
        self.uuid: str = kwargs.pop('uuid', None) or ''
        # Keep the legacy id for backward-compat / logging but it is no
        # longer the primary key.  New templates may omit it entirely.
        self.id = id or ''
        # Accept either 'label' or 'name', prefer 'label'
        self.name = label or name or id or 'Unnamed'
        self.allowed_children = allowed_children or []
        self.allowed_asset_types = allowed_asset_types or []
        self.properties = properties or []  # Preserve properties with their velocityConfigs
        self.primary_status_property_id = primary_status_property_id  # Which status property controls node styling
        self.features = features or []  # Feature flags: is_root, is_person, scheduling, budgeting, etc.
        self.has_time_log = kwargs.get('has_time_log', False)
        self._extra_props = kwargs
        # Ensure properties is in _extra_props for backward compatibility
        if properties is not None:
            self._extra_props['properties'] = properties
        if primary_status_property_id is not None:
            self._extra_props['primary_status_property_id'] = primary_status_property_id
        # Ensure features is in _extra_props for feature_macros compatibility
        self._extra_props['features'] = self.features

    def has_feature(self, feature: str) -> bool:
        """Check if this node type has a specific feature flag."""
        return feature in self.features


class Blueprint:
    """Represents a loaded blueprint definition."""
    
    def __init__(self, id: str, name: str, version: str, node_types: List[NodeTypeDef], **kwargs):
        self.id = id
        self.name = name
        self.version = version
        self.node_types = node_types
        # Primary lookup is by uuid; keep a secondary map by legacy id for
        # backward compatibility during the migration window.
        self._node_type_map = {nt.uuid: nt for nt in node_types}
        self._node_type_map_by_legacy_id = {nt.id: nt for nt in node_types if nt.id}
        self._extra_props = kwargs

    def get_node_type(self, type_ref: str) -> Optional['NodeTypeDef']:
        """Look up a node type by uuid, falling back to legacy id."""
        return self._node_type_map.get(type_ref) or self._node_type_map_by_legacy_id.get(type_ref)

    def allowed_children_as_legacy_ids(self, node_type_def: 'NodeTypeDef') -> list:
        """Return allowed_children as legacy IDs for frontend serialization."""
        uuid_to_legacy = {nt.uuid: nt.id for nt in self.node_types if nt.uuid}
        return [uuid_to_legacy.get(ref, ref) for ref in (node_type_def.allowed_children or [])]
    
    def is_allowed_child(self, parent_type: str, child_type: str) -> bool:
        """
        Check if a child type is allowed under a parent type.
        
        Args:
            parent_type: The uuid (or legacy id) of the parent node type
            child_type: The uuid (or legacy id) of the child node type
            
        Returns:
            True if the relationship is allowed, False otherwise
        """
        parent_def = self.get_node_type(parent_type)
        if not parent_def:
            return False
        # Resolve child_type to its uuid for comparison against
        # the UUID-based allowed_children list.
        child_def = self.get_node_type(child_type)
        if child_def:
            return child_def.uuid in parent_def.allowed_children or child_type in parent_def.allowed_children
        return child_type in parent_def.allowed_children
    
    def get_option_by_uuid(self, property_id: str, option_uuid: str) -> Optional[Dict[str, Any]]:
        """Get an option definition by its UUID.
        
        Args:
            property_id: The property ID (legacy or uuid)
            option_uuid: The UUID of the option
            
        Returns:
            The option dict or None if not found
        """
        for node_type in self.node_types:
            properties = node_type._extra_props.get('properties', [])
            for prop in properties:
                if (prop.get('id') == property_id or prop.get('uuid') == property_id) and 'options' in prop:
                    for option in prop['options']:
                        if option.get('id') == option_uuid:
                            return option
        return None
    
    def get_option_uuid(self, node_type_id: str, property_id: str, option_name: str) -> Optional[str]:
        """Get the UUID for an option by its name.
        
        Args:
            node_type_id: The node type uuid (or legacy id)
            property_id: The property ID (legacy or uuid)
            option_name: The option name/value
            
        Returns:
            The option UUID or None if not found
        """
        node_type = self.get_node_type(node_type_id)
        if not node_type:
            return None
        properties = node_type._extra_props.get('properties', [])
        
        for prop in properties:
            if (prop.get('id') == property_id or prop.get('uuid') == property_id) and 'options' in prop:
                for option in prop['options']:
                    if option.get('name') == option_name:
                        return option.get('id')
        
        return None

    def build_property_uuid_map(self, node_type_ref: str) -> Dict[str, str]:
        """Return ``{prop_key: property_uuid}`` for a given node type.

        Maps semantic property keys (e.g., "name", "status") to their
        deterministic UUIDs.  Used by backend engines that need to look
        up well-known properties by semantic key.
        """
        node_type = self.get_node_type(node_type_ref)
        if not node_type:
            return {}
        result: Dict[str, str] = {}
        for prop in node_type._extra_props.get('properties', []):
            lid = prop.get('id', '')
            puuid = prop.get('uuid', '')
            if lid and puuid:
                result[lid] = puuid
        return result

    def build_all_property_uuid_maps(self) -> Dict[str, Dict[str, str]]:
        """Return ``{node_type_uuid: {prop_key: property_uuid}}`` for all types."""
        result: Dict[str, Dict[str, str]] = {}
        for nt in self.node_types:
            m = self.build_property_uuid_map(nt.uuid)
            if m:
                result[nt.uuid] = m
        return result


class SchemaLoader:
    """Loads and parses blueprint YAML files."""
    
    def __init__(self):
        """Initialize schema loader with optional indicator catalog."""
        self.indicator_catalog = None
        self.icon_catalog = None

        env_mode = os.environ.get('TALUS_ENV', '').strip().lower()
        if env_mode in {'development', 'dev'}:
            is_development_mode = True
        elif env_mode in {'production', 'prod'}:
            is_development_mode = False
        else:
            is_development_mode = not (getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'))
        
        # Get absolute path to project root
        schema_loader_dir = Path(__file__).resolve().parent  # backend/infra
        project_root = schema_loader_dir.parent.parent  # Go up 2 levels to project root

        # Look for assets in environment-aware order.
        asset_roots = []
        production_root = Path('/opt/talus_tally')
        pyinstaller_root = Path(sys._MEIPASS) if hasattr(sys, '_MEIPASS') else None
        if is_development_mode:
            asset_roots.append(project_root)
            if production_root.exists():
                asset_roots.append(production_root)
            if pyinstaller_root:
                asset_roots.append(pyinstaller_root)
        else:
            if production_root.exists():
                asset_roots.append(production_root)
            if pyinstaller_root:
                asset_roots.append(pyinstaller_root)
            asset_roots.append(project_root)

        catalog_path = None
        icon_catalog_path = None

        # Check settings-based overrides first.
        from backend.infra.settings import (
            CUSTOM_ICONS_DIR_KEY,
            CUSTOM_INDICATORS_DIR_KEY,
            get_setting,
        )
        custom_indicators_dir = get_setting(CUSTOM_INDICATORS_DIR_KEY)
        if custom_indicators_dir:
            candidate = Path(str(custom_indicators_dir)) / 'catalog.yaml'
            if candidate.exists():
                catalog_path = candidate
        custom_icons_dir = get_setting(CUSTOM_ICONS_DIR_KEY)
        if custom_icons_dir:
            candidate = Path(str(custom_icons_dir)) / 'catalog.yaml'
            if candidate.exists():
                icon_catalog_path = candidate

        # In production, prefer user-managed catalogs so edits live outside install prefix.
        if not is_development_mode:
            user_indicator_catalog = get_user_indicators_dir() / 'catalog.yaml'
            if user_indicator_catalog.exists():
                catalog_path = user_indicator_catalog

            user_icon_catalog = get_user_icons_dir() / 'catalog.yaml'
            if user_icon_catalog.exists():
                icon_catalog_path = user_icon_catalog

        for root in asset_roots:
            candidate_catalog = root / 'assets' / 'indicators' / 'catalog.yaml'
            candidate_icon = root / 'assets' / 'icons' / 'catalog.yaml'
            if catalog_path is None and candidate_catalog.exists():
                catalog_path = candidate_catalog
            if icon_catalog_path is None and candidate_icon.exists():
                icon_catalog_path = candidate_icon
            if catalog_path and icon_catalog_path:
                break

        # Final fallback to user catalogs if no asset catalog was found.
        if catalog_path is None:
            user_indicator_catalog = get_user_indicators_dir() / 'catalog.yaml'
            if user_indicator_catalog.exists():
                catalog_path = user_indicator_catalog
        if icon_catalog_path is None:
            user_icon_catalog = get_user_icons_dir() / 'catalog.yaml'
            if user_icon_catalog.exists():
                icon_catalog_path = user_icon_catalog

        if catalog_path:
            try:
                self.indicator_catalog = IndicatorCatalog.load(str(catalog_path))
            except Exception as e:
                print(f"[WARN] Failed to load indicator catalog: {e}")

        if icon_catalog_path:
            try:
                self.icon_catalog = IconCatalog.load(str(icon_catalog_path))
            except Exception as e:
                print(f"[WARN] Failed to load icon catalog: {e}")
        
        # Store templates directory for discovery
        self.templates_dir = get_templates_directory()
    
    def load(self, filepath: str) -> Blueprint:
        """
        Load a blueprint from a YAML file.

        Generates stable UUIDs for all select option values to enable
        UUID-based reference instead of string matching.

        Args:
            filepath: Path to the blueprint YAML file (or template ID like 'restomod.yaml')

        Returns:
            A Blueprint object with UUIDs generated for options
        """
        # If filepath doesn't include a directory, look in templates_dir
        if not os.path.isabs(filepath) and os.path.sep not in filepath:
            filepath = os.path.join(self.templates_dir, filepath)
        
        try:
            # Use utf-8-sig to handle Windows BOM, fallback to utf-8
            try:
                with open(filepath, 'r', encoding='utf-8-sig') as f:
                    data = yaml.safe_load(f)
            except UnicodeDecodeError:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = yaml.safe_load(f)
        except Exception as e:
            print(f"[SchemaLoader.load] ERROR opening/reading file: {type(e).__name__}: {e}")
            raise
        
        # Validate template structure before processing
        try:
            TemplateValidator.validate_and_raise(data, filepath)
        except TemplateValidationError as e:
            print(f"[SchemaLoader.load] VALIDATION ERROR: {e}")
            raise
        
        blueprint_id = data.get('id') or os.path.splitext(os.path.basename(filepath))[0]
        name = data.get('name')
        version = data.get('version', '1.0')
        
        # Parse node types and generate UUIDs for options
        node_types_data = data.get('node_types', [])

        # --- Phase 1: ensure every node type has a stable uuid ---
        # Build a mapping of legacy id → uuid so allowed_children can be
        # resolved in Phase 2.
        legacy_id_to_uuid: Dict[str, str] = {}
        for nt_data in node_types_data:
            if not isinstance(nt_data, dict):
                continue
            if not nt_data.get('uuid'):
                legacy_id = nt_data.get('id', '')
                nt_data['uuid'] = _generate_stable_uuid('node_type', legacy_id)
            legacy_id = nt_data.get('id')
            if legacy_id:
                legacy_id_to_uuid[legacy_id] = nt_data['uuid']

        # --- Phase 2: resolve allowed_children from legacy ids to UUIDs ---
        all_uuids = {nt_data.get('uuid') for nt_data in node_types_data if isinstance(nt_data, dict)}
        for nt_data in node_types_data:
            if not isinstance(nt_data, dict):
                continue
            children = nt_data.get('allowed_children', [])
            resolved: List[str] = []
            for child_ref in children:
                if child_ref in all_uuids:
                    # Already a uuid
                    resolved.append(child_ref)
                elif child_ref in legacy_id_to_uuid:
                    # Legacy id → resolve to uuid
                    resolved.append(legacy_id_to_uuid[child_ref])
                else:
                    # Unknown reference — keep as-is so validation can flag it
                    resolved.append(child_ref)
            nt_data['allowed_children'] = resolved

        # --- Phase 2.5: apply feature macros so macro-injected properties
        #     (e.g. scheduling → status) are present in every Blueprint,
        #     not just the schema endpoint. ---
        from backend.core.feature_macros import apply_feature_macros
        apply_feature_macros({'node_types': node_types_data})

        # --- Phase 3: construct NodeTypeDef objects ---
        node_types = []
        for nt_data in node_types_data:
            if not isinstance(nt_data, dict):
                continue
            self._generate_option_uuids(nt_data)
            self._generate_property_uuids(nt_data)
            node_type = NodeTypeDef(**nt_data)
            node_types.append(node_type)
        
        # Pass remaining properties as kwargs
        extra_props = {k: v for k, v in data.items() if k not in ['id', 'name', 'version', 'node_types']}
        
        return Blueprint(id=blueprint_id, name=name, version=version, node_types=node_types, **extra_props)
    
    def _generate_option_uuids(self, node_type_data: Dict[str, Any]) -> None:
        """Generate UUIDs for select options in a node type.
        Modifies node_type_data in place to add 'id' to each option.
        UUIDs are deterministic based on content, ensuring stability across reloads.
        Args:
            node_type_data: The node type definition dict from YAML
        """
        node_type_id = node_type_data.get('id')
        properties = node_type_data.get('properties', [])
        for prop in properties:
            if prop.get('type') == 'select' and 'options' in prop:
                property_id = prop.get('id')
                options = prop['options']
                # Handle both string and dict option formats
                normalized_options = []
                for option in options:
                    if isinstance(option, str):
                        normalized_options.append({
                            'name': option,
                            'id': _generate_stable_uuid(f"{node_type_id}.{property_id}", option)
                        })
                    elif isinstance(option, dict):
                        if 'id' not in option and 'name' in option:
                            option['id'] = _generate_stable_uuid(f"{node_type_id}.{property_id}", option['name'])
                        normalized_options.append(option)
                    else:
                        normalized_options.append(option)
                prop['options'] = normalized_options

    def _generate_property_uuids(self, node_type_data: Dict[str, Any]) -> None:
        """Generate deterministic UUIDs for properties in a node type.

        Modifies each property dict in place, adding a ``uuid`` field.
        The original ``id`` is kept unchanged so that internal code
        (feature macros, option UUID generation) that already ran can
        still reference it.  Downstream serialisers (schema endpoint,
        velocity schema) will expose ``uuid`` as the primary ``id``.
        """
        node_type_legacy_id = node_type_data.get('id', '')
        properties = node_type_data.get('properties', [])
        for prop in properties:
            if not isinstance(prop, dict):
                continue
            legacy_id = prop.get('id', '')
            if not prop.get('uuid'):
                prop['uuid'] = _generate_stable_uuid(
                    f"property.{node_type_legacy_id}", legacy_id
                )

