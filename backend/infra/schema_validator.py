"""
Schema Validation Service

Provides validation for YAML configuration files against defined schemas.
Validates markup profiles, icon catalogs, and indicator sets.
"""

from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
import re


class ValidationError(Exception):
    """Raised when schema validation fails."""
    pass


class SchemaValidator:
    """
    Validates YAML configuration structures against defined schemas.
    
    Supports:
    - Markup profiles (markup_schema.yaml)
    - Icon catalogs (icon_schema.yaml)
    - Indicator sets (indicator_schema.yaml)
    """
    
    @staticmethod
    def validate_markup_profile(data: Dict[str, Any]) -> List[str]:
        """
        Validate a markup profile against markup_schema.
        
        Args:
            data: Markup profile data to validate
            
        Returns:
            List of validation errors (empty if valid)
        """
        errors = []
        
        # Check required fields at profile level
        if 'id' not in data:
            errors.append("markup_profile: missing required field 'id'")
        elif not isinstance(data['id'], str) or not data['id'].strip():
            errors.append("markup_profile.id: must be non-empty string")
        
        if 'label' not in data:
            errors.append("markup_profile: missing required field 'label'")
        elif not isinstance(data['label'], str) or not data['label'].strip():
            errors.append("markup_profile.label: must be non-empty string")
        
        # Validate tokens if present
        if 'tokens' in data:
            if not isinstance(data['tokens'], list):
                errors.append("markup_profile.tokens: must be array")
            else:
                for i, token in enumerate(data['tokens']):
                    token_errors = SchemaValidator._validate_markup_token(token, i)
                    errors.extend(token_errors)
        
        return errors
    
    @staticmethod
    def _validate_markup_token(token: Dict[str, Any], index: int) -> List[str]:
        """Validate individual markup token."""
        errors = []
        prefix = f"markup_profile.tokens[{index}]"
        
        # Required fields
        if 'id' not in token:
            errors.append(f"{prefix}: missing required field 'id'")
        elif not isinstance(token['id'], str) or not token['id'].strip():
            errors.append(f"{prefix}.id: must be non-empty string")
        
        if 'label' not in token:
            errors.append(f"{prefix}: missing required field 'label'")
        elif not isinstance(token['label'], str) or not token['label'].strip():
            errors.append(f"{prefix}.label: must be non-empty string")
        
        prefix_value = token.get('prefix')
        has_prefix = False
        if prefix_value is not None:
            if not isinstance(prefix_value, str):
                errors.append(f"{prefix}.prefix: must be string")
            else:
                has_prefix = True
        else:
            errors.append(f"{prefix}: missing required field 'prefix'")

        pattern_value = token.get('pattern')
        has_pattern = False
        if pattern_value is not None:
            if not isinstance(pattern_value, str) or not pattern_value.strip():
                errors.append(f"{prefix}.pattern: must be non-empty string if provided")
            else:
                has_pattern = True

        if not has_prefix and not has_pattern:
            errors.append(f"{prefix}: missing required field 'prefix' (or provide 'pattern')")
        
        # Optional format_scope
        if 'format_scope' in token:
            valid_scopes = ['line', 'prefix']
            if token['format_scope'] not in valid_scopes:
                errors.append(
                    f"{prefix}.format_scope: must be 'line' or 'prefix'"
                )
        
        # Optional format rules
        if 'format' in token:
            fmt = token['format']
            if not isinstance(fmt, dict):
                errors.append(f"{prefix}.format: must be object")
            else:
                # Validate format properties
                valid_transforms = ['uppercase', 'lowercase', 'capitalize', 'none']
                if 'text_transform' in fmt and fmt['text_transform'] not in valid_transforms:
                    errors.append(f"{prefix}.format.text_transform: must be one of {valid_transforms}")
                
                # Boolean flags
                for bool_field in ['bold', 'italic', 'underline']:
                    if bool_field in fmt and not isinstance(fmt[bool_field], bool):
                        errors.append(f"{prefix}.format.{bool_field}: must be boolean")
                
                # String fields
                for str_field in ['color', 'background_color', 'font_size']:
                    if str_field in fmt and not isinstance(fmt[str_field], str):
                        errors.append(f"{prefix}.format.{str_field}: must be string")
                
                # Alignment
                if 'align' in fmt:
                    valid_aligns = ['left', 'center', 'right']
                    if fmt['align'] not in valid_aligns:
                        errors.append(f"{prefix}.format.align: must be one of {valid_aligns}")
        
        return errors
    
    @staticmethod
    def validate_icon_catalog(data: Dict[str, Any]) -> List[str]:
        """
        Validate an icon catalog against icon_schema.
        
        Args:
            data: Icon catalog data to validate
            
        Returns:
            List of validation errors (empty if valid)
        """
        errors = []
        
        # Check required 'icons' array
        if 'icons' not in data:
            errors.append("icon_catalog: missing required field 'icons'")
        elif not isinstance(data['icons'], list):
            errors.append("icon_catalog.icons: must be array")
        else:
            seen_ids = set()
            for i, icon in enumerate(data['icons']):
                icon_errors = SchemaValidator._validate_icon(icon, i, seen_ids)
                errors.extend(icon_errors)
        
        return errors
    
    @staticmethod
    def _validate_icon(icon: Dict[str, Any], index: int, seen_ids: set) -> List[str]:
        """Validate individual icon definition."""
        errors = []
        prefix = f"icon_catalog.icons[{index}]"
        
        # Required fields
        if 'id' not in icon:
            errors.append(f"{prefix}: missing required field 'id'")
        elif not isinstance(icon['id'], str) or not icon['id'].strip():
            errors.append(f"{prefix}.id: must be non-empty string")
        else:
            icon_id = icon['id']
            # Check ID format
            if not re.match(r'^[a-z0-9]+(-[a-z0-9]+)*$', icon_id):
                errors.append(f"{prefix}.id: must match kebab-case pattern (got '{icon_id}')")
            
            # Check uniqueness
            if icon_id in seen_ids:
                errors.append(f"{prefix}.id: duplicate icon id '{icon_id}'")
            else:
                seen_ids.add(icon_id)
        
        if 'file' not in icon:
            errors.append(f"{prefix}: missing required field 'file'")
        elif not isinstance(icon['file'], str) or not icon['file'].strip():
            errors.append(f"{prefix}.file: must be non-empty string")
        
        return errors
    
    @staticmethod
    def validate_indicator_catalog(data: Dict[str, Any]) -> List[str]:
        """
        Validate an indicator catalog against indicator_schema.
        
        Args:
            data: Indicator catalog data to validate
            
        Returns:
            List of validation errors (empty if valid)
        """
        errors = []
        
        # Check required 'indicator_sets' object
        if 'indicator_sets' not in data:
            errors.append("indicator_catalog: missing required field 'indicator_sets'")
        elif not isinstance(data['indicator_sets'], dict):
            errors.append("indicator_catalog.indicator_sets: must be object")
        else:
            seen_set_ids = set()
            for set_id, indicator_set in data['indicator_sets'].items():
                set_errors = SchemaValidator._validate_indicator_set(
                    indicator_set, set_id, seen_set_ids
                )
                errors.extend(set_errors)
        
        return errors
    
    @staticmethod
    def _validate_indicator_set(
        indicator_set: Dict[str, Any],
        set_id: str,
        seen_set_ids: set
    ) -> List[str]:
        """Validate individual indicator set."""
        errors = []
        prefix = f"indicator_catalog.indicator_sets['{set_id}']"
        
        # Check ID format
        if not re.match(r'^[a-z0-9]+(_[a-z0-9]+)*$', set_id):
            errors.append(f"{prefix}: id must match snake_case pattern (got '{set_id}')")
        
        if set_id in seen_set_ids:
            errors.append(f"{prefix}: duplicate indicator set id '{set_id}'")
        else:
            seen_set_ids.add(set_id)
        
        # Required fields
        if 'description' not in indicator_set:
            errors.append(f"{prefix}: missing required field 'description'")
        elif not isinstance(indicator_set['description'], str) or not indicator_set['description'].strip():
            errors.append(f"{prefix}.description: must be non-empty string")
        
        # Validate indicators if present
        if 'indicators' in indicator_set:
            if not isinstance(indicator_set['indicators'], list):
                errors.append(f"{prefix}.indicators: must be array")
            else:
                seen_indicator_ids = set()
                for i, indicator in enumerate(indicator_set['indicators']):
                    ind_errors = SchemaValidator._validate_indicator(
                        indicator, i, set_id, seen_indicator_ids
                    )
                    errors.extend(ind_errors)
        
        # Validate default_theme colors if present
        if 'default_theme' in indicator_set:
            if not isinstance(indicator_set['default_theme'], dict):
                errors.append(f"{prefix}.default_theme: must be object")
            else:
                for indicator_id, theme in indicator_set['default_theme'].items():
                    theme_errors = SchemaValidator._validate_theme(
                        theme, indicator_id, set_id
                    )
                    errors.extend(theme_errors)
        
        return errors
    
    @staticmethod
    def _validate_indicator(
        indicator: Dict[str, Any],
        index: int,
        set_id: str,
        seen_ids: set
    ) -> List[str]:
        """Validate individual indicator definition."""
        errors = []
        prefix = f"indicator_catalog.indicator_sets['{set_id}'].indicators[{index}]"
        
        # Required fields
        if 'id' not in indicator:
            errors.append(f"{prefix}: missing required field 'id'")
        elif not isinstance(indicator['id'], str) or not indicator['id'].strip():
            errors.append(f"{prefix}.id: must be non-empty string")
        else:
            ind_id = indicator['id']
            if ind_id in seen_ids:
                errors.append(f"{prefix}.id: duplicate indicator id '{ind_id}' in set '{set_id}'")
            else:
                seen_ids.add(ind_id)
        
        if 'file' not in indicator:
            errors.append(f"{prefix}: missing required field 'file'")
        elif not isinstance(indicator['file'], str) or not indicator['file'].strip():
            errors.append(f"{prefix}.file: must be non-empty string")
        
        return errors
    
    @staticmethod
    def _validate_theme(theme: Dict[str, Any], indicator_id: str, set_id: str) -> List[str]:
        """Validate theme color definitions."""
        errors = []
        prefix = f"indicator_catalog.indicator_sets['{set_id}'].default_theme['{indicator_id}']"
        
        if not isinstance(theme, dict):
            errors.append(f"{prefix}: must be object")
            return errors
        
        for color_field in ['indicator_color', 'text_color']:
            if color_field in theme:
                color = theme[color_field]
                if not isinstance(color, str):
                    errors.append(f"{prefix}.{color_field}: must be string")
                elif not re.match(r'^#[0-9A-F]{3}([0-9A-F]{3})?$', color, re.IGNORECASE):
                    errors.append(f"{prefix}.{color_field}: invalid hex color '{color}'")
        
        return errors


def validate_yaml_file(
    file_path: str,
    schema_type: str
) -> Tuple[bool, List[str]]:
    """
    Validate a YAML file against a schema.
    
    Args:
        file_path: Path to YAML file
        schema_type: Type of schema ('markup', 'icon', 'indicator')
        
    Returns:
        Tuple of (is_valid, error_list)
    """
    try:
        import yaml
    except ImportError:
        raise ImportError("PyYAML is required for schema validation")
    
    path = Path(file_path)
    if not path.exists():
        return False, [f"File not found: {file_path}"]
    
    try:
        with open(path, 'r') as f:
            data = yaml.safe_load(f)
    except Exception as e:
        return False, [f"Failed to parse YAML: {str(e)}"]
    
    if not isinstance(data, dict):
        return False, ["YAML content must be an object/dict at root level"]
    
    # Validate based on schema type
    if schema_type == 'markup':
        errors = SchemaValidator.validate_markup_profile(data)
    elif schema_type == 'icon':
        errors = SchemaValidator.validate_icon_catalog(data)
    elif schema_type == 'indicator':
        errors = SchemaValidator.validate_indicator_catalog(data)
    else:
        return False, [f"Unknown schema type: {schema_type}"]
    
    return len(errors) == 0, errors
