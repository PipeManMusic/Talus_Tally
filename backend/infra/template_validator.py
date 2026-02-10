"""Template YAML validation to catch errors before they cause UI freezes."""

from typing import Dict, Any, List, Tuple


class TemplateValidationError(Exception):
    """Raised when a template fails validation."""
    
    def __init__(self, message: str, field_path: str = None):
        self.message = message
        self.field_path = field_path
        super().__init__(f"{field_path}: {message}" if field_path else message)


class TemplateValidator:
    """Validates template YAML structure and content."""
    
    REQUIRED_TOP_LEVEL = ['id', 'name', 'node_types']
    REQUIRED_NODE_TYPE = ['id', 'label']  # or 'name' as alternative to 'label'
    # Note: Property types are not strictly validated to allow for extensibility
    # The backend and frontend explicitly handle the types they understand
    
    @classmethod
    def validate(cls, data: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """Validate a template data structure.
        
        Args:
            data: The loaded YAML data
            
        Returns:
            Tuple of (is_valid, list_of_error_messages)
        """
        errors = []
        
        # Check top-level required fields
        for field in cls.REQUIRED_TOP_LEVEL:
            if field not in data or data[field] is None:
                errors.append(f"Missing required field: '{field}'")
        
        # Validate node_types is a list
        if 'node_types' in data:
            if not isinstance(data['node_types'], list):
                errors.append(f"'node_types' must be a list, got {type(data['node_types']).__name__}")
            elif len(data['node_types']) == 0:
                errors.append("'node_types' cannot be empty")
            else:
                # Validate each node type
                for idx, node_type in enumerate(data['node_types']):
                    node_path = f"node_types[{idx}]"
                    errors.extend(cls._validate_node_type(node_type, node_path))
        
        return len(errors) == 0, errors
    
    @classmethod
    def _validate_node_type(cls, node_type: Any, path: str) -> List[str]:
        """Validate a single node type definition.
        
        Args:
            node_type: The node type data
            path: The path to this node type (for error messages)
            
        Returns:
            List of error messages
        """
        errors = []
        
        if not isinstance(node_type, dict):
            errors.append(f"{path}: must be a dict, got {type(node_type).__name__}")
            return errors
        
        # Check required fields (id + either label or name)
        if 'id' not in node_type:
            errors.append(f"{path}: missing required field 'id'")
        
        if 'label' not in node_type and 'name' not in node_type:
            errors.append(f"{path}: missing required field 'label' or 'name'")
        
        # Validate properties if present
        if 'properties' in node_type:
            if not isinstance(node_type['properties'], list):
                errors.append(f"{path}.properties: must be a list, got {type(node_type['properties']).__name__}")
            else:
                for prop_idx, prop in enumerate(node_type['properties']):
                    prop_path = f"{path}.properties[{prop_idx}]"
                    errors.extend(cls._validate_property(prop, prop_path))
        
        # Validate allowed_children if present
        if 'allowed_children' in node_type:
            if not isinstance(node_type['allowed_children'], list):
                errors.append(f"{path}.allowed_children: must be a list, got {type(node_type['allowed_children']).__name__}")
        
        return errors
    
    @classmethod
    def _validate_property(cls, prop: Any, path: str) -> List[str]:
        """Validate a property definition.
        
        Args:
            prop: The property data
            path: The path to this property (for error messages)
            
        Returns:
            List of error messages
        """
        errors = []
        
        if not isinstance(prop, dict):
            errors.append(f"{path}: must be a dict, got {type(prop).__name__}")
            return errors
        
        # Check required fields
        if 'id' not in prop:
            errors.append(f"{path}: missing required field 'id'")
        
        if 'label' not in prop and 'name' not in prop:
            errors.append(f"{path}: missing required field 'label' or 'name'")
        
        # Get property type (validates exists and is a string, but doesn't restrict values)
        prop_type = prop.get('type')
        if prop_type is None:
            errors.append(f"{path}: missing required field 'type'")
        elif not isinstance(prop_type, str):
            errors.append(f"{path}.type: must be a string, got {type(prop_type).__name__}")
        
        # Validate select options
        if prop_type == 'select':
            if 'options' not in prop:
                errors.append(f"{path}: 'select' type requires 'options' field")
            elif not isinstance(prop['options'], list):
                errors.append(f"{path}.options: must be a list, got {type(prop['options']).__name__}")
            elif len(prop['options']) == 0:
                errors.append(f"{path}.options: cannot be empty for 'select' type")
            else:
                # Validate each option
                option_names = set()
                for opt_idx, opt in enumerate(prop['options']):
                    opt_path = f"{path}.options[{opt_idx}]"
                    opt_errors = cls._validate_option(opt, opt_path)
                    errors.extend(opt_errors)
                    
                    # Check for duplicate option names
                    if isinstance(opt, dict):
                        opt_name = opt.get('name')
                    elif isinstance(opt, str):
                        opt_name = opt
                    else:
                        opt_name = None
                    
                    if opt_name:
                        if opt_name in option_names:
                            errors.append(f"{path}.options: duplicate option name '{opt_name}'")
                        option_names.add(opt_name)
        
        # Validate velocityConfig if present (optional)
        if 'velocityConfig' in prop:
            velocity_config = prop['velocityConfig']
            if not isinstance(velocity_config, dict):
                errors.append(f"{path}.velocityConfig: must be a dict, got {type(velocity_config).__name__}")
            else:
                # Validate velocityConfig structure
                errors.extend(cls._validate_velocity_config(velocity_config, f"{path}.velocityConfig"))
        
        return errors
    
    @classmethod
    def _validate_option(cls, opt: Any, path: str) -> List[str]:
        """Validate a select option.
        
        Args:
            opt: The option data (can be string or dict)
            path: The path to this option (for error messages)
            
        Returns:
            List of error messages
        """
        errors = []
        
        # Options can be strings or dicts
        if isinstance(opt, str):
            # String options are valid
            pass
        elif isinstance(opt, dict):
            # Dict options must have 'name'
            if 'name' not in opt:
                errors.append(f"{path}: dict option missing required field 'name'")
        else:
            errors.append(f"{path}: must be a string or dict, got {type(opt).__name__}")
        
        return errors
    
    @classmethod
    def _validate_velocity_config(cls, velocity_config: Dict[str, Any], path: str) -> List[str]:
        """Validate a velocityConfig definition (node-level or property-level).
        
        Args:
            velocity_config: The velocityConfig data
            path: The path to this config (for error messages)
            
        Returns:
            List of error messages
        """
        errors = []
        
        if not isinstance(velocity_config, dict):
            return errors  # Already checked by caller
        
        # Allowed fields for velocityConfig (all optional)
        allowed_fields = {
            'enabled', 'baseScore', 'scoreMode', 'penaltyScore', 'mode',
            'statusScores', 'multiplierFactor', 'penaltyMode'
        }
        
        # Validate field types
        if 'enabled' in velocity_config:
            if not isinstance(velocity_config['enabled'], bool):
                errors.append(f"{path}.enabled: must be boolean, got {type(velocity_config['enabled']).__name__}")
        
        if 'baseScore' in velocity_config:
            val = velocity_config['baseScore']
            if not isinstance(val, (int, float)):
                errors.append(f"{path}.baseScore: must be number, got {type(val).__name__}")
            elif val < 0:
                errors.append(f"{path}.baseScore: must be non-negative, got {val}")
        
        if 'scoreMode' in velocity_config:
            mode = velocity_config['scoreMode']
            if mode not in ['inherit', 'fixed']:
                errors.append(f"{path}.scoreMode: must be 'inherit' or 'fixed', got '{mode}'")
        
        if 'penaltyScore' in velocity_config:
            if not isinstance(velocity_config['penaltyScore'], (bool, int, float)):
                errors.append(f"{path}.penaltyScore: must be boolean or number, got {type(velocity_config['penaltyScore']).__name__}")
        
        if 'mode' in velocity_config:
            mode = velocity_config['mode']
            if mode not in ['status', 'multiplier', 'inherit']:
                errors.append(f"{path}.mode: must be 'status', 'multiplier', or 'inherit', got '{mode}'")
        
        if 'statusScores' in velocity_config:
            status_scores = velocity_config['statusScores']
            if not isinstance(status_scores, dict):
                errors.append(f"{path}.statusScores: must be a dict, got {type(status_scores).__name__}")
            else:
                # Validate each status score value is numeric
                for status_name, score_val in status_scores.items():
                    if not isinstance(score_val, (int, float)):
                        errors.append(f"{path}.statusScores['{status_name}']: must be number, got {type(score_val).__name__}")
        
        if 'multiplierFactor' in velocity_config:
            factor = velocity_config['multiplierFactor']
            if not isinstance(factor, (int, float)):
                errors.append(f"{path}.multiplierFactor: must be number, got {type(factor).__name__}")
        
        if 'penaltyMode' in velocity_config:
            if not isinstance(velocity_config['penaltyMode'], bool):
                errors.append(f"{path}.penaltyMode: must be boolean, got {type(velocity_config['penaltyMode']).__name__}")
        
        return errors
    
    @classmethod
    def validate_and_raise(cls, data: Dict[str, Any], template_path: str = None) -> None:
        """Validate template data and raise exception if invalid.
        
        Args:
            data: The loaded YAML data
            template_path: Optional path to template file (for error context)
            
        Raises:
            TemplateValidationError: If validation fails
        """
        is_valid, errors = cls.validate(data)
        
        if not is_valid:
            template_info = f" in {template_path}" if template_path else ""
            error_list = "\n  - ".join(errors)
            raise TemplateValidationError(
                f"Template validation failed{template_info}:\n  - {error_list}"
            )
