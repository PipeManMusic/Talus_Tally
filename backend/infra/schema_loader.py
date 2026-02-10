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
    
    def __init__(self, id: str, label: str = None, name: str = None, allowed_children: List[str] = None, allowed_asset_types: List[str] = None, properties: List[Dict[str, Any]] = None, **kwargs):
        self.id = id
        # Accept either 'label' or 'name', prefer 'label'
        self.name = label or name or id
        self.allowed_children = allowed_children or []
        self.allowed_asset_types = allowed_asset_types or []
        self.properties = properties or []  # Preserve properties with their velocityConfigs
        self.has_time_log = kwargs.get('has_time_log', False)
        self._extra_props = kwargs
        # Ensure properties is in _extra_props for backward compatibility
        if properties is not None:
            self._extra_props['properties'] = properties


class Blueprint:
    """Represents a loaded blueprint definition."""
    
    def __init__(self, id: str, name: str, version: str, node_types: List[NodeTypeDef], **kwargs):
        self.id = id
        self.name = name
        self.version = version
        self.node_types = node_types
        self._node_type_map = {nt.id: nt for nt in node_types}
        self._extra_props = kwargs
    
    def is_allowed_child(self, parent_type: str, child_type: str) -> bool:
        """
        Check if a child type is allowed under a parent type.
        
        Args:
            parent_type: The ID of the parent node type
            child_type: The ID of the child node type
            
        Returns:
            True if the relationship is allowed, False otherwise
        """
        if parent_type not in self._node_type_map:
            return False
        
        parent_def = self._node_type_map[parent_type]
        return child_type in parent_def.allowed_children
    
    def get_option_by_uuid(self, property_id: str, option_uuid: str) -> Optional[Dict[str, Any]]:
        """Get an option definition by its UUID.
        
        Args:
            property_id: The property ID (e.g., "status")
            option_uuid: The UUID of the option
            
        Returns:
            The option dict or None if not found
        """
        for node_type in self.node_types:
            properties = node_type._extra_props.get('properties', [])
            for prop in properties:
                if prop.get('id') == property_id and 'options' in prop:
                    for option in prop['options']:
                        if option.get('id') == option_uuid:
                            return option
        return None
    
    def get_option_uuid(self, node_type_id: str, property_id: str, option_name: str) -> Optional[str]:
        """Get the UUID for an option by its name.
        
        Args:
            node_type_id: The node type ID
            property_id: The property ID (e.g., "status")
            option_name: The option name/value
            
        Returns:
            The option UUID or None if not found
        """
        if node_type_id not in self._node_type_map:
            return None
        
        node_type = self._node_type_map[node_type_id]
        properties = node_type._extra_props.get('properties', [])
        
        for prop in properties:
            if prop.get('id') == property_id and 'options' in prop:
                for option in prop['options']:
                    if option.get('name') == option_name:
                        return option.get('id')
        
        return None


class SchemaLoader:
    """Loads and parses blueprint YAML files."""
    
    def __init__(self):
        """Initialize schema loader with optional indicator catalog."""
        self.indicator_catalog = None
        self.icon_catalog = None
        
        # Get absolute path to project root
        schema_loader_dir = Path(__file__).resolve().parent  # backend/infra
        project_root = schema_loader_dir.parent.parent  # Go up 2 levels to project root

        # Look for assets in preferred order: production install, PyInstaller bundle, repo root
        asset_roots = []
        production_root = Path('/opt/talus_tally')
        if production_root.exists():
            asset_roots.append(production_root)
        if hasattr(sys, '_MEIPASS'):
            asset_roots.append(Path(sys._MEIPASS))
        asset_roots.append(project_root)

        catalog_path = None
        icon_catalog_path = None
        for root in asset_roots:
            candidate_catalog = root / 'assets' / 'indicators' / 'catalog.yaml'
            candidate_icon = root / 'assets' / 'icons' / 'catalog.yaml'
            if catalog_path is None and candidate_catalog.exists():
                catalog_path = candidate_catalog
            if icon_catalog_path is None and candidate_icon.exists():
                icon_catalog_path = candidate_icon
            if catalog_path and icon_catalog_path:
                break

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
        print(f"[SchemaLoader] Templates dir: {self.templates_dir}")
    
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
        
        # Debug logging
        print(f"[SchemaLoader.load] Attempting to load: {filepath}")
        print(f"[SchemaLoader.load] File exists: {os.path.exists(filepath)}")
        print(f"[SchemaLoader.load] Is readable: {os.access(filepath, os.R_OK)}")
        
        try:
            with open(filepath, 'r') as f:
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
        
        blueprint_id = data.get('id')
        name = data.get('name')
        version = data.get('version', '1.0')
        
        # Parse node types and generate UUIDs for options
        node_types_data = data.get('node_types', [])
        # Debug: print node_types_data and their types
        print("[DEBUG] node_types_data after YAML load:")
        for idx, nt in enumerate(node_types_data):
            print(f"  idx={idx} type={type(nt)} value={nt}")
        node_types = []
        for nt_data in node_types_data:
            if not isinstance(nt_data, dict):
                print(f"[DEBUG] Skipping non-dict node_type: {nt_data} (type={type(nt_data)})")
                continue
            self._generate_option_uuids(nt_data)
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
                print(f"[DEBUG] Before UUID normalization: node_type_id={node_type_id} property_id={property_id} options={options}")
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
                        print(f"[DEBUG] Skipping non-str/non-dict option: {option} (type={type(option)})")
                prop['options'] = normalized_options
                print(f"[DEBUG] After UUID normalization: node_type_id={node_type_id} property_id={property_id} options={normalized_options}")

