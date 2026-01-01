import sys
import os
from PySide6.QtWidgets import QApplication, QMainWindow, QLabel, QVBoxLayout, QWidget
from PySide6.QtCore import Qt
from backend.models import Project
import json

class TalusWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Talus Tally - Bronco II Manager")
        self.setGeometry(100, 100, 600, 400)
        
        # 1. Setup UI Layout
        self.central_widget = QWidget()
        self.setCentralWidget(self.central_widget)
        self.layout = QVBoxLayout(self.central_widget)
        
        # 2. Add a Label (Placeholder)
        self.label = QLabel("Loading Project...")
        self.label.setAlignment(Qt.AlignCenter)
        self.layout.addWidget(self.label)
        
        # 3. Load Data
        self.load_project()

    def load_project(self):
        data_path = "data/talus_master.json"
        if not os.path.exists(data_path):
            self.label.setText("Error: data/talus_master.json not found!")
            return

        try:
            with open(data_path, "r") as f:
                # Use our Pydantic Model to parse the JSON
                project = Project.model_validate(json.load(f))
                
            # Update the label with real data
            stats = f"Project: {project.name}\n"
            stats += f"SubProjects: {len(project.sub_projects)}\n"
            stats += f"Last Updated: {project.last_updated.strftime("%Y-%m-%d %H:%M")}"
            
            self.label.setText(stats)
            self.label.setStyleSheet("font-size: 18px; font-weight: bold; color: #333;")
            
        except Exception as e:
            self.label.setText(f"Failed to load: {str(e)}")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = TalusWindow()
    window.show()
    sys.exit(app.exec())
