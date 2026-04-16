"""
Template Persistence Manager - handles loading, saving, validating templates.

Provides CRUD operations for template YAML files in data/templates/ directory.
"""

import os
import sys
from copy import deepcopy
import re
import yaml
from pathlib import Path
from typing import List, Dict, Any, Optional
from uuid import uuid4


from backend.infra.user_data_dir import get_user_templates_dir


def _resolve_directory_setting(setting_key: str, default_path: Path) -> str:
    from backend.infra.settings import get_setting

    custom_dir = get_setting(setting_key)
    if custom_dir:
        candidate = Path(str(custom_dir))
        if candidate.is_dir():
            return str(candidate)
    return str(default_path)


def _get_workspace_templates_dir() -> Optional[str]:
    """
    Resolve repository-local templates directory when running from source.

    Returns <repo>/data/templates if it exists, else None.
    """
    repo_candidate = Path(__file__).resolve().parents[2] / "data" / "templates"
    if repo_candidate.is_dir():
        return str(repo_candidate)

    return None


def get_templates_directory() -> str:
    """
    Returns the templates directory.

    Resolution order (highest → lowest priority):
    1) TALUS_BLUEPRINT_TEMPLATES_DIR environment variable
    2) Custom setting from the user's settings.json
    3) Repository-local ``data/templates/`` when running from source
    4) XDG user-data default
    """
    # Environment variable has absolute priority so tests and CI can
    # override without touching the user's settings.json.
    env_override = os.environ.get("TALUS_BLUEPRINT_TEMPLATES_DIR")
    if env_override:
        candidate = Path(env_override).expanduser().resolve()
        if candidate.is_dir():
            return str(candidate)

    from backend.infra.settings import CUSTOM_BLUEPRINT_TEMPLATES_DIR_KEY, get_setting

    custom_dir = get_setting(CUSTOM_BLUEPRINT_TEMPLATES_DIR_KEY)
    if custom_dir:
        candidate = Path(str(custom_dir)).expanduser().resolve()
        if candidate.is_dir():
            return str(candidate)

    workspace_templates_dir = _get_workspace_templates_dir()
    if workspace_templates_dir:
        return workspace_templates_dir

    return str(get_user_templates_dir())


class TemplatePersistence:
    """Manages loading, saving, and validating template YAML files."""

    @staticmethod
    def _format_label_from_identifier(value: str, fallback: str) -> str:
        raw = str(value or '').strip()
        if not raw:
            return fallback
        return ' '.join(part.capitalize() for part in re.split(r'[_\-\s]+', raw) if part)

    def _normalize_select_options(self, options: Any) -> List[Dict[str, Any]]:
        raw_options = options if isinstance(options, list) else []
        normalized: List[Dict[str, Any]] = []
        used_names = set()

        def unique_name(candidate: str, ordinal: int) -> str:
            base = str(candidate or '').strip() or f'Option {ordinal}'
            if base not in used_names:
                used_names.add(base)
                return base
            suffix = 2
            while f'{base} ({suffix})' in used_names:
                suffix += 1
            next_name = f'{base} ({suffix})'
            used_names.add(next_name)
            return next_name

        for idx, option in enumerate(raw_options):
            option_dict = dict(option) if isinstance(option, dict) else {}
            raw_name = option if isinstance(option, str) else option_dict.get('name', '')
            option_dict['name'] = unique_name(str(raw_name or ''), idx + 1)

            indicator_id = option_dict.get('indicator_id')
            if indicator_id is None or not str(indicator_id).strip():
                option_dict.pop('indicator_id', None)
            else:
                option_dict['indicator_id'] = str(indicator_id)

            normalized.append(option_dict)

        if not normalized:
            normalized.append({'name': 'Option 1'})

        return normalized

    def normalize_template_data(self, template_data: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize editor-managed template data into a persistable shape."""
        if not isinstance(template_data, dict):
            return template_data

        normalized = deepcopy(template_data)
        node_types = normalized.get('node_types')
        if not isinstance(node_types, list):
            return normalized

        valid_type_ids = {
            str(node_type.get('id')).strip()
            for node_type in node_types
            if isinstance(node_type, dict) and str(node_type.get('id', '')).strip()
        }

        for node_type in node_types:
            if not isinstance(node_type, dict):
                continue

            if 'label' not in node_type or not str(node_type.get('label', '')).strip():
                node_type['label'] = self._format_label_from_identifier(node_type.get('id', ''), 'New Node Type')

            allowed_children = node_type.get('allowed_children', [])
            if not isinstance(allowed_children, list):
                allowed_children = []
            node_type['allowed_children'] = list(dict.fromkeys(
                child_id
                for child_id in allowed_children
                if isinstance(child_id, str)
                and child_id.strip()
                and child_id != node_type.get('id')
                and child_id in valid_type_ids
            ))

            allowed_asset_types = node_type.get('allowed_asset_types', [])
            if not isinstance(allowed_asset_types, list):
                allowed_asset_types = []
            node_type['allowed_asset_types'] = list(dict.fromkeys(
                asset_type
                for asset_type in allowed_asset_types
                if isinstance(asset_type, str) and asset_type.strip()
            ))

            properties = node_type.get('properties', [])
            if not isinstance(properties, list):
                properties = []

            for prop in properties:
                if not isinstance(prop, dict):
                    continue
                if 'required' not in prop:
                    prop['required'] = False
                if 'label' not in prop or not str(prop.get('label', '')).strip():
                    prop['label'] = self._format_label_from_identifier(prop.get('id', ''), 'New Property')
                if 'type' not in prop or not str(prop.get('type', '')).strip():
                    prop['type'] = 'text'
                if prop.get('type') == 'select':
                    prop['indicator_set'] = str(prop.get('indicator_set') or 'status')
                    prop['options'] = self._normalize_select_options(prop.get('options'))

            node_type['properties'] = properties

            status_property_ids = [
                prop.get('id')
                for prop in properties
                if isinstance(prop, dict)
                and prop.get('type') == 'select'
                and str(prop.get('indicator_set') or 'status') == 'status'
            ]
            if node_type.get('primary_status_property_id') not in status_property_ids:
                node_type.pop('primary_status_property_id', None)

        return normalized
    
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
                try:
                    with open(file, 'r', encoding='utf-8-sig') as f:
                        data = yaml.safe_load(f)
                except UnicodeDecodeError:
                    with open(file, 'r', encoding='utf-8') as f:
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
        
        try:
            with open(template_path, 'r', encoding='utf-8-sig') as f:
                data = yaml.safe_load(f)
        except UnicodeDecodeError:
            with open(template_path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f)

        data = self._ensure_template_uuid(data, template_path)
        # Inject id from filename — the filename is the canonical identifier
        data['id'] = template_id
        return data
    
    def save_template(self, template_data: Dict[str, Any], template_id: Optional[str] = None) -> None:
        """
        Save a template to disk.
        
        Args:
            template_data: Complete template dict with name, version, node_types, etc.
            template_id: The filename (without .yaml) to save as. If None, falls back
                         to template_data['id'] for backward compatibility.
            
        Raises:
            ValueError: If template is invalid or no ID can be determined
        """
        template_data = self.normalize_template_data(template_data)
        template_data = self._ensure_template_uuid(template_data)
        errors = self.validate_template(template_data)
        if errors:
            raise ValueError(f'Template validation failed: {"; ".join(errors)}')
        
        if not template_id:
            template_id = template_data.get('id')
        if not template_id:
            raise ValueError('Template must have an id')
        
        templates_path = Path(self.templates_dir)
        templates_path.mkdir(parents=True, exist_ok=True)
        
        template_file = templates_path / f'{template_id}.yaml'
        
        # Strip 'id' from YAML — the filename is the canonical identifier
        data_to_write = {k: v for k, v in template_data.items() if k != 'id'}
        self._write_template_file(template_file, data_to_write)
    
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
            seen_property_ids = set()
            seen_property_uuids = set()
            for j, prop in enumerate(properties):
                prop_errors = self._validate_property(prop, j, prefix)
                errors.extend(prop_errors)
                if not isinstance(prop, dict):
                    continue

                property_id = prop.get('id')
                if isinstance(property_id, str) and property_id:
                    if property_id in seen_property_ids:
                        errors.append(f'{prefix}: duplicate property id "{property_id}"')
                    else:
                        seen_property_ids.add(property_id)

                property_uuid = prop.get('uuid')
                if isinstance(property_uuid, str) and property_uuid:
                    if property_uuid in seen_property_uuids:
                        errors.append(f'{prefix}: duplicate property uuid "{property_uuid}"')
                    else:
                        seen_property_uuids.add(property_uuid)
        
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
            else:
                seen_option_names = set()
                for option_index, option in enumerate(options):
                    option_prefix = f'{prefix}.options[{option_index}]'
                    if isinstance(option, str):
                        option_name = option.strip()
                        if not option_name:
                            errors.append(f'{option_prefix}: option name cannot be empty')
                            continue
                    elif isinstance(option, dict):
                        option_name = str(option.get('name', '')).strip()
                        if not option_name:
                            errors.append(f'{option_prefix}: option name cannot be empty')
                            continue
                        indicator_id = option.get('indicator_id')
                        if indicator_id is not None and not isinstance(indicator_id, str):
                            errors.append(f'{option_prefix}: indicator_id must be a string when provided')
                    else:
                        errors.append(f'{option_prefix}: option must be a string or object')
                        continue

                    if option_name in seen_option_names:
                        errors.append(f'{option_prefix}: duplicate option name "{option_name}"')
                    seen_option_names.add(option_name)
        
        return errors
