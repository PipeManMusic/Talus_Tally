from typing import Optional, Tuple
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QLineEdit, QLabel, 
    QDialogButtonBox, QFormLayout, QComboBox
)
from PySide6.QtCore import Qt
import os

from backend.ui.viewmodels.wizard import WizardLogic
from backend.infra.schema_loader import SchemaLoader


class ProjectWizardDialog(QDialog):
    """Dialog for creating a new project - returns only template and name data."""
    
    def __init__(self, parent=None):
        """
        Initialize the wizard dialog.
        
        Args:
            parent: Optional parent widget
        """
        super().__init__(parent)
        
        # Initialize wizard logic
        self.wizard_logic = WizardLogic()
        self.result_template_path: Optional[str] = None
        self.result_project_name: Optional[str] = None
        
        # Setup UI
        self._setup_ui()
        
        # Connect signals
        self._connect_signals()
    
    def _setup_ui(self):
        """Setup the dialog UI."""
        self.setWindowTitle("New Project")
        self.setModal(True)
        self.resize(400, 250)
        
        # Main layout
        layout = QVBoxLayout(self)
        
        # Form layout for inputs
        form_layout = QFormLayout()
        
        # Project name input
        self.project_name_input = QLineEdit()
        self.project_name_input.setObjectName("project_name")
        self.project_name_input.setPlaceholderText("Enter project name...")
        form_layout.addRow("Project Name:", self.project_name_input)
        
        # Template selection
        self.template_combo = QComboBox()
        self.template_combo.setObjectName("template_selector")
        self._load_templates()
        form_layout.addRow("Template:", self.template_combo)
        
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
    
    def _load_templates(self):
        """Load available templates from the templates directory."""
        templates_dir = os.path.join("data", "templates")
        
        if os.path.exists(templates_dir):
            for filename in os.listdir(templates_dir):
                if filename.endswith('.yaml') or filename.endswith('.yml'):
                    # Store the full path as data, display name without extension
                    template_path = os.path.join(templates_dir, filename)
                    display_name = os.path.splitext(filename)[0].replace('_', ' ').title()
                    self.template_combo.addItem(display_name, template_path)
        
        # If no templates found, add a default option
        if self.template_combo.count() == 0:
            self.template_combo.addItem("Default", None)
    
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
        """Handle dialog acceptance - store template and project name."""
        project_name = self.project_name_input.text().strip()
        
        if not self.wizard_logic.validate_project_name(project_name):
            return
        
        # Store the results (view will use these to create commands)
        self.result_project_name = project_name
        self.result_template_path = self.template_combo.currentData()
        
        # Call parent accept to close dialog
        super().accept()
    
    def get_result(self) -> Tuple[Optional[str], Optional[str]]:
        """
        Get the template path and project name selected by user.
        
        Returns:
            Tuple of (template_path, project_name) or (None, None) if cancelled
        """
        return self.result_template_path, self.result_project_name
