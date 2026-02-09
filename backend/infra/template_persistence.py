"""
Template Persistence Manager - handles loading, saving, validating templates.

Provides CRUD operations for template YAML files in data/templates/ directory.
"""

import os
import sys
import yaml
from pathlib import Path
from typing import List, Dict, Any, Optional
from uuid import uuid4


def get_templates_directory() -> str:
    """
    Determine the templates directory based on environment and deployment context.
    
    Priority:
    1. TEMPLATES_DIR environment variable (if set)
    2. Development path: <project_root>/data/templates when available
    3. Production path: /opt/talus_tally/data/templates when writable
    4. Fallback to development path (creating it if needed)
    
    Returns:
        Absolute path to templates directory
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # Check environment variable first
    env_dir = os.getenv('TEMPLATES_DIR')
    if env_dir:
        logger.info(f"Using templates directory from TEMPLATES_DIR env var: {env_dir}")
        return env_dir
    
    # Prefer development path when running from the source tree
    current_dir = Path(__file__).resolve().parent.parent.parent  # Go up from backend/infra
    dev_path = current_dir / 'data' / 'templates'
    if dev_path.exists():
        logger.info(f"Using development templates directory: {dev_path}")
        return str(dev_path)

    # Check production path
    production_path = Path('/opt/talus_tally/data/templates')
    if production_path.exists():
        if os.access(production_path, os.W_OK):
            logger.info(f"Using production templates directory: {production_path}")
            return str(production_path)
        logger.warning(
            f"Production templates directory {production_path} is not writable; falling back to development path"
        )
        try:
            dev_path.mkdir(parents=True, exist_ok=True)
            logger.info(f"Using development templates directory: {dev_path}")
            return str(dev_path)
        except Exception as fallback_error:
            logger.error(
                f"Failed to prepare development templates directory {dev_path}: {fallback_error}"
            )
            return str(production_path)

    # Final fallback attempts to create development path
    try:
        dev_path.mkdir(parents=True, exist_ok=True)
    except Exception as create_error:
        logger.error(
            f"Failed to create development templates directory {dev_path}: {create_error}"
        )
        return str(Path.cwd())
    logger.info(f"Using development templates directory: {dev_path}")
    return str(dev_path)


class TemplatePersistence:
    """Manages loading, saving, and validating template YAML files."""
    
    def __init__(self, templates_dir: Optional[str] = None):
        """
        Initialize template persistence manager.
        
        Args:
            templates_dir: Path to templates directory. If None, uses get_templates_directory()
        """
        if templates_dir:
            self.templates_dir = templates_dir
        else:
            self.templates_dir = get_templates_directory()

    def _write_template_file(self, template_path: Path, template_data: Dict[str, Any]) -> None:
        with open(template_path, 'w') as f:
            yaml.dump(template_data, f, sort_keys=False, default_flow_style=False)

    def _ensure_template_uuid(
        self,
        template_data: Dict[str, Any],
        template_path: Optional[Path] = None
    ) -> Dict[str, Any]:
        if not template_data:
            return template_data

        if not template_data.get('uuid'):
            template_data['uuid'] = str(uuid4())
            if template_path is not None:
                self._write_template_file(template_path, template_data)

        return template_data
    
    def list_templates(self) -> List[Dict[str, Any]]:
        """
        List all available templates.
        
        Returns:
            List of template metadata dicts with keys: id, name, version, description
            Note: 'id' is the filename (without .yaml) used for loading templates
        """
        templates = []
        templates_path = Path(self.templates_dir)
        
        if not templates_path.exists():
            return templates
        
        for file in templates_path.glob('*.yaml'):
            try:
                with open(file, 'r') as f:
                    data = yaml.safe_load(f)
                if data:
                    data = self._ensure_template_uuid(data, file)
                    templates.append({
                        'id': file.stem,  # Use filename as ID for loading
                        'uuid': data.get('uuid'),
                        'name': data.get('name', ''),
                        'version': data.get('version', '0.1.0'),
                        'description': data.get('description', '')
                    })
            except Exception:
                # Skip files that can't be parsed
                continue
        
        return sorted(templates, key=lambda t: t['name'])
    
    def load_template(self, template_id: str) -> Dict[str, Any]:
        """
        Load a complete template by ID.
        
        Args:
            template_id: The template ID (e.g., 'project_talus')
            
        Returns:
            Complete template dict
            
        Raises:
            FileNotFoundError: If template doesn't exist
        """
        template_path = Path(self.templates_dir) / f'{template_id}.yaml'
        
        if not template_path.exists():
            raise FileNotFoundError(f'Template not found: {template_id}')
        
        with open(template_path, 'r') as f:
            data = yaml.safe_load(f)

        return self._ensure_template_uuid(data, template_path)
    
    def save_template(self, template_data: Dict[str, Any]) -> None:
        """
        Save a template to disk.
        
        Args:
            template_data: Complete template dict with id, name, version, node_types, etc.
            
        Raises:
            ValueError: If template is invalid
        """
        template_data = self._ensure_template_uuid(template_data)
        errors = self.validate_template(template_data)
        if errors:
            raise ValueError(f'Template validation failed: {"; ".join(errors)}')
        
        template_id = template_data.get('id')
        if not template_id:
            raise ValueError('Template must have an id')
        
        templates_path = Path(self.templates_dir)
        templates_path.mkdir(parents=True, exist_ok=True)
        
        template_file = templates_path / f'{template_id}.yaml'
        
        self._write_template_file(template_file, template_data)
    
    def delete_template(self, template_id: str) -> None:
        """
        Delete a template from disk.
        
        Args:
            template_id: The template ID to delete
            
        Raises:
            FileNotFoundError: If template doesn't exist
        """
        template_path = Path(self.templates_dir) / f'{template_id}.yaml'
        
        if not template_path.exists():
            raise FileNotFoundError(f'Template not found: {template_id}')
        
        template_path.unlink()
    
    def validate_template(self, template_data: Dict[str, Any]) -> List[str]:
        """
        Validate a template.
        
        Returns:
            List of error messages (empty if valid)
        """
        errors = []
        
        # Check required top-level fields
        if 'id' not in template_data:
            errors.append('Template must have an id')
        if 'name' not in template_data:
            errors.append('Template must have a name')
        if 'version' not in template_data:
            errors.append('Template must have a version')
        
        # Check node_types
        node_types = template_data.get('node_types', [])
        if not isinstance(node_types, list):
            errors.append('node_types must be a list')
            return errors
        
        if not node_types:
            errors.append('Template must have at least one node_type')
            return errors
        
        node_type_ids = set()
        for i, nt in enumerate(node_types):
            nt_errors = self._validate_node_type(nt, i)
            errors.extend(nt_errors)
            
            if 'id' in nt:
                node_type_ids.add(nt['id'])
        
        # Validate allowed_children references
        for i, nt in enumerate(node_types):
            allowed = nt.get('allowed_children', [])
            if isinstance(allowed, list):
                for child_id in allowed:
                    if child_id not in node_type_ids:
                        errors.append(
                            f'Node type "{nt.get("id")}" references unknown child type "{child_id}"'
                        )
        
        return errors
    
    def _validate_node_type(self, node_type: Dict[str, Any], index: int) -> List[str]:
        """Validate a single node type definition."""
        errors = []
        prefix = f'node_types[{index}]'
        
        if not isinstance(node_type, dict):
            errors.append(f'{prefix}: node_type must be a dict')
            return errors
        
        if 'id' not in node_type:
            errors.append(f'{prefix}: missing id')
        if 'label' not in node_type:
            errors.append(f'{prefix}: missing label')
        
        # Validate properties
        properties = node_type.get('properties', [])
        if properties and not isinstance(properties, list):
            errors.append(f'{prefix}: properties must be a list')
        else:
            for j, prop in enumerate(properties):
                prop_errors = self._validate_property(prop, j, prefix)
                errors.extend(prop_errors)
        
        return errors
    
    def _validate_property(
        self, 
        prop: Dict[str, Any], 
        index: int, 
        parent_prefix: str
    ) -> List[str]:
        """Validate a single property definition."""
        errors = []
        prefix = f'{parent_prefix}.properties[{index}]'
        
        if not isinstance(prop, dict):
            errors.append(f'{prefix}: property must be a dict')
            return errors
        
        if 'id' not in prop:
            errors.append(f'{prefix}: missing id')
        if 'label' not in prop:
            errors.append(f'{prefix}: missing label')
        if 'type' not in prop:
            errors.append(f'{prefix}: missing type')
        
        # Validate select properties have options
        prop_type = prop.get('type')
        if prop_type == 'select':
            options = prop.get('options')
            if not options:
                errors.append(f'{prefix}: select type requires options array')
            elif not isinstance(options, list):
                errors.append(f'{prefix}: options must be a list')
        
        return errors
