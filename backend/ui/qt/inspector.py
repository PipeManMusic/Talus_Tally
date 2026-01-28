"""Qt Inspector Widget for displaying and editing node properties.

This module provides a Qt widget for the Properties panel that displays
editable fields for a selected node based on its type and blueprint.
"""
from typing import Optional
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QFormLayout, QLineEdit, 
    QSpinBox, QDoubleSpinBox, QComboBox, QLabel
)
from PySide6.QtCore import Qt, Signal

from backend.core.node import Node
from backend.ui.viewmodels.inspector import InspectorViewModel, FieldDefinition


class InspectorWidget(QWidget):
    """Widget for inspecting and editing node properties."""
    
    # Signal emitted when a property is changed: (node_id, property_id, new_value)
    property_changed = Signal(object, str, object)
    
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
        self.field_widgets = {}  # Map field IDs to widgets for later retrieval
        
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
    
    def set_blueprint(self, blueprint):
        """
        Set the blueprint for field schema generation.
        
        Args:
            blueprint: The blueprint definition
        """
        self.view_model = InspectorViewModel(blueprint)
    
    def clear_form(self):
        """Clear all widgets from the form."""
        self.field_widgets.clear()
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
            # Show placeholder message
            placeholder = QLabel("Select a node to view properties")
            placeholder.setAlignment(Qt.AlignCenter)
            placeholder.setStyleSheet("color: gray; font-style: italic; padding: 20px;")
            self.form_layout.addRow(placeholder)
            return
        
        # Get fields from view model
        fields = self.view_model.get_fields_for_node(node)
        
        # Create widgets for each field
        for field in fields:
            widget = self._create_widget_for_field(field)
            if widget:
                self.field_widgets[field.id] = widget
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
            # Connect to property_changed signal
            widget.textChanged.connect(
                lambda text: self._on_field_changed(field.id, text)
            )
            return widget
        
        elif ui_type == "number":
            widget = QSpinBox()
            widget.setRange(-999999, 999999)
            if field.value is not None:
                widget.setValue(int(field.value))
            # Connect to property_changed signal
            widget.valueChanged.connect(
                lambda value: self._on_field_changed(field.id, value)
            )
            return widget
        
        elif ui_type == "currency":
            widget = QDoubleSpinBox()
            widget.setPrefix("$")
            widget.setRange(0.0, 999999.99)
            widget.setDecimals(2)
            if field.value is not None:
                widget.setValue(float(field.value))
            # Connect to property_changed signal
            widget.valueChanged.connect(
                lambda value: self._on_field_changed(field.id, value)
            )
            return widget
        
        elif ui_type == "select":
            widget = QComboBox()
            # Add options if available
            if hasattr(field, 'options') and field.options:
                for i, opt in enumerate(field.options):
                    # Options can be strings or dicts with name/bullet/id
                    if isinstance(opt, dict):
                        display_text = opt.get("name", str(opt))
                        widget.addItem(display_text)
                        # Store the UUID in itemData for reference
                        option_uuid = opt.get("id", "")
                        widget.setItemData(i, option_uuid)
                    else:
                        display_text = str(opt)
                        widget.addItem(display_text)
                        # For string options, use the string as the data
                        widget.setItemData(i, display_text)
                
                # Set current value
                if field.value is not None:
                    # field.value is now a UUID string
                    if isinstance(field.value, str):
                        # Try to find the option with this UUID
                        option_name = None
                        for j in range(widget.count()):
                            if widget.itemData(j) == field.value:
                                option_name = widget.itemText(j)
                                widget.setCurrentIndex(j)
                                break
            
            # Connect to property_changed signal
            widget.currentIndexChanged.connect(
                lambda idx, combo=widget: self._on_combo_changed(field.id, combo)
            )
            return widget
        
        else:
            # Fallback to text for unknown types
            widget = QLineEdit()
            if field.value is not None:
                widget.setText(str(field.value))
            # Connect to property_changed signal
            widget.textChanged.connect(
                lambda text: self._on_field_changed(field.id, text)
            )
            return widget
    
    def _on_field_changed(self, field_id: str, new_value):
        """
        Handle field value changes.
        
        Args:
            field_id: The ID of the field that changed
            new_value: The new value
        """
        if self.current_node:
            self.property_changed.emit(self.current_node.id, field_id, new_value)
    
    def _on_combo_changed(self, field_id: str, combo):
        """
        Handle combo box selection changes.
        
        Emits the option UUID (not the option name).
        
        Args:
            field_id: The ID of the field that changed
            combo: The QComboBox widget
        """
        if self.current_node:
            # Get the currently selected item data (the option UUID)
            current_index = combo.currentIndex()
            if current_index >= 0:
                option_uuid = combo.itemData(current_index)
                # Emit the UUID (the authoritative reference)
                if option_uuid:
                    self.property_changed.emit(self.current_node.id, field_id, option_uuid)
    
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
