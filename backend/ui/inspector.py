from dataclasses import dataclass, field
from typing import Any, Optional
from backend.core.node import Node


@dataclass
class FieldDefinition:
    """Definition of a field in the inspector."""
    id: str
    label: str
    ui_type: str
    required: bool = False
    value: Optional[Any] = None
    
    # Legacy compatibility
    @property
    def name(self):
        return self.id
    
    @property
    def field_type(self):
        return self.ui_type


class InspectorViewModel:
    """View model for node inspector."""
    
    def __init__(self, blueprint=None):
        """Initialize inspector view model.
        
        Args:
            blueprint: Optional blueprint definition for schema-based field generation
        """
        self.blueprint = blueprint
    
    def get_fields_for_node(self, node: Node) -> list[FieldDefinition]:
        """Get field definitions for a node type.
        
        Args:
            node: The node to inspect
            
        Returns:
            List of field definitions
        """
        fields = []
        
        # If we have a blueprint, use it to generate fields
        if self.blueprint and hasattr(self.blueprint, '_extra_props'):
            # Check if blueprint has properties defined
            properties = self.blueprint._extra_props.get('properties', [])
            
            for prop in properties:
                prop_id = prop.get('name') or prop.get('id')
                value = node.properties.get(prop_id) if hasattr(node, 'properties') else None
                fields.append(FieldDefinition(
                    id=prop_id,
                    label=prop.get('label', prop_id.replace('_', ' ').title()),
                    ui_type=prop.get('type', 'text'),
                    required=prop.get('required', False),
                    value=value
                ))
            
            if fields:
                return fields
        
        # Fallback to default fields
        base_fields = [
            FieldDefinition(id="name", label="Name", ui_type="text", required=True),
            FieldDefinition(id="description", label="Description", ui_type="text")
        ]
        
        # Type-specific fields
        type_fields = {
            "part": [
                FieldDefinition(id="quantity", label="Quantity", ui_type="number"),
                FieldDefinition(id="unit_cost", label="Unit Cost", ui_type="currency")
            ],
            "task": [
                FieldDefinition(id="cost_estimate", label="Cost Estimate", ui_type="currency"),
                FieldDefinition(id="difficulty", label="Difficulty", ui_type="select"),
                FieldDefinition(id="duration", label="Duration", ui_type="number"),
                FieldDefinition(id="status", label="Status", ui_type="select")
            ]
        }
        
        specific = type_fields.get(node.blueprint_type_id, [])
        
        # Set values from node properties
        all_fields = base_fields + specific
        for field in all_fields:
            if hasattr(node, 'properties') and field.id in node.properties:
                field.value = node.properties[field.id]
        
        return all_fields
    
    def validate_field(self, field: FieldDefinition, value: Any) -> bool:
        """Validate a field value.
        
        Args:
            field: Field definition
            value: Value to validate
            
        Returns:
            True if valid, False otherwise
        """
        if field.required and not value:
            return False
        
        if field.ui_type == "number" and value is not None:
            try:
                float(value)
            except (ValueError, TypeError):
                return False
        
        return True


def main():
    print("Inspector module loaded successfully.")

if __name__ == "__main__":
    main()