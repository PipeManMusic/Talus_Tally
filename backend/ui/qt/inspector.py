"""Qt Inspector Widget for displaying and editing node properties.

This module provides a Qt widget for the Properties panel that displays
editable fields for a selected node based on its type and blueprint.
"""
from typing import Optional
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QFormLayout, QLineEdit, 
    QSpinBox, QDoubleSpinBox, QComboBox, QLabel
)
from PySide6.QtCore import Qt

from backend.core.node import Node
from backend.ui.viewmodels.inspector import InspectorViewModel, FieldDefinition


class InspectorWidget(QWidget):
    """Widget for inspecting and editing node properties."""
    
    def __init__(self, blueprint=None, parent=None):
        """
        Initialize the inspector widget.
        
        Args:
            blueprint: Optional blueprint for field schema
            parent: Optional parent widget
        """
        super().__init__(parent)
        
        # Initialize view model
        self.view_model = InspectorViewModel(blueprint)
        self.current_node: Optional[Node] = None
        
        # Setup UI
        self._setup_ui()
    
    def _setup_ui(self):
        """Setup the widget layout."""
        layout = QVBoxLayout(self)
        
        # Create form layout for fields
        self.form_layout = QFormLayout()
        layout.addLayout(self.form_layout)
        
        # Add stretch to push fields to top
        layout.addStretch()
    
    def clear_form(self):
        """Clear all widgets from the form."""
        while self.form_layout.rowCount() > 0:
            self.form_layout.removeRow(0)
    
    def set_node(self, node: Optional[Node]):
        """
        Set the node to inspect and display its properties.
        
        Args:
            node: The node to inspect, or None to clear
        """
        self.current_node = node
        self.clear_form()
        
        if node is None:
            return
        
        # Get fields from view model
        fields = self.view_model.get_fields_for_node(node)
        
        # Create widgets for each field
        for field in fields:
            widget = self._create_widget_for_field(field)
            if widget:
                self.form_layout.addRow(field.label, widget)
    
    def _create_widget_for_field(self, field: FieldDefinition) -> Optional[QWidget]:
        """
        Create an appropriate widget for a field definition.
        
        Args:
            field: The field definition
            
        Returns:
            A Qt widget for editing the field
        """
        ui_type = field.ui_type.lower()
        
        if ui_type == "text":
            widget = QLineEdit()
            if field.value is not None:
                widget.setText(str(field.value))
            return widget
        
        elif ui_type == "number":
            widget = QSpinBox()
            widget.setRange(-999999, 999999)
            if field.value is not None:
                widget.setValue(int(field.value))
            return widget
        
        elif ui_type == "currency":
            widget = QDoubleSpinBox()
            widget.setPrefix("$")
            widget.setRange(0.0, 999999.99)
            widget.setDecimals(2)
            if field.value is not None:
                widget.setValue(float(field.value))
            return widget
        
        elif ui_type == "select":
            widget = QComboBox()
            # Add options if available
            if hasattr(field, 'options') and field.options:
                widget.addItems(field.options)
            if field.value is not None:
                index = widget.findText(str(field.value))
                if index >= 0:
                    widget.setCurrentIndex(index)
            return widget
        
        else:
            # Fallback to text for unknown types
            widget = QLineEdit()
            if field.value is not None:
                widget.setText(str(field.value))
            return widget
    
    def get_field_values(self) -> dict:
        """
        Get current values from all field widgets.
        
        Returns:
            Dictionary mapping field IDs to values
        """
        values = {}
        
        # This would need to track field IDs to widgets
        # For now, simplified implementation
        
        return values
