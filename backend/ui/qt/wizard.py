"""Qt Wizard Dialog for creating new projects.

This module provides a dialog for the initial project setup wizard,
allowing users to create new projects with a name and initial configuration.
"""
from typing import Optional
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QLineEdit, QLabel, 
    QDialogButtonBox, QFormLayout
)
from PySide6.QtCore import Qt

from backend.core.graph import ProjectGraph
from backend.core.node import Node
from backend.ui.viewmodels.wizard import WizardLogic


class ProjectWizardDialog(QDialog):
    """Dialog for creating a new project."""
    
    def __init__(self, parent=None):
        """
        Initialize the wizard dialog.
        
        Args:
            parent: Optional parent widget
        """
        super().__init__(parent)
        
        # Initialize wizard logic
        self.wizard_logic = WizardLogic()
        self.result_graph: Optional[ProjectGraph] = None
        
        # Setup UI
        self._setup_ui()
        
        # Connect signals
        self._connect_signals()
    
    def _setup_ui(self):
        """Setup the dialog UI."""
        self.setWindowTitle("New Project")
        self.setModal(True)
        self.resize(400, 200)
        
        # Main layout
        layout = QVBoxLayout(self)
        
        # Form layout for inputs
        form_layout = QFormLayout()
        
        # Project name input
        self.project_name_input = QLineEdit()
        self.project_name_input.setObjectName("project_name")
        self.project_name_input.setPlaceholderText("Enter project name...")
        form_layout.addRow("Project Name:", self.project_name_input)
        
        layout.addLayout(form_layout)
        
        # Add spacing
        layout.addStretch()
        
        # Button box
        self.button_box = QDialogButtonBox(
            QDialogButtonBox.Ok | QDialogButtonBox.Cancel
        )
        layout.addWidget(self.button_box)
        
        # Initially disable OK button
        self.button_box.button(QDialogButtonBox.Ok).setEnabled(False)
    
    def _connect_signals(self):
        """Connect widget signals to slots."""
        # Connect buttons
        self.button_box.accepted.connect(self.accept)
        self.button_box.rejected.connect(self.reject)
        
        # Connect name input to validation
        self.project_name_input.textChanged.connect(self._validate_inputs)
    
    def _validate_inputs(self):
        """Validate inputs and enable/disable OK button."""
        project_name = self.project_name_input.text().strip()
        is_valid = self.wizard_logic.validate_project_name(project_name)
        
        ok_button = self.button_box.button(QDialogButtonBox.Ok)
        ok_button.setEnabled(is_valid)
    
    def accept(self):
        """Handle dialog acceptance - create the project graph."""
        project_name = self.project_name_input.text().strip()
        
        if not self.wizard_logic.validate_project_name(project_name):
            return
        
        # Create the result graph
        self.result_graph = ProjectGraph()
        
        # Create root node using wizard logic
        root_node = self.wizard_logic.create_project_root(project_name)
        self.result_graph.add_node(root_node)
        
        # Call parent accept to close dialog
        super().accept()
    
    def get_result_graph(self) -> Optional[ProjectGraph]:
        """
        Get the created project graph.
        
        Returns:
            The ProjectGraph created by the wizard, or None if cancelled
        """
        return self.result_graph
