import sys
import os
import traceback
import json
import uuid
from PySide6.QtWidgets import (QApplication, QMainWindow, QVBoxLayout, QWidget, 
                               QTreeWidget, QTreeWidgetItem, QHeaderView, QToolBar,
                               QDialog, QFormLayout, QComboBox, QLineEdit, QDoubleSpinBox, 
                               QSpinBox, QDialogButtonBox, QMessageBox, QMenu)
from PySide6.QtGui import QAction, QIcon
from PySide6.QtCore import Qt
from backend.models import Project, Task, Status
from backend.manager import TaskManager

class AddTaskDialog(QDialog):
    def __init__(self, project, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Add New Task")
        self.project = project
        self.layout = QVBoxLayout(self)
        self.form = QFormLayout()
        
        # 1. SubProject & WorkPackage
        self.sub_input = QComboBox()
        for sub in project.sub_projects:
            self.sub_input.addItem(sub.name, sub.id)
        self.sub_input.currentIndexChanged.connect(self.populate_wps)
        
        self.wp_input = QComboBox()
        
        # 2. Basic Info
        self.name_input = QLineEdit()
        self.cost_input = QDoubleSpinBox()
        self.cost_input.setRange(0, 100000)
        self.cost_input.setPrefix("$")
        
        # 3. SEMANTIC DROPDOWNS (Replaces SpinBoxes)
        self.budget_input = QComboBox()
        self.budget_input.addItem("Standard Maintenance", 5) # Default
        self.budget_input.addItem("Immediate Impact (High Value)", 10)
        self.budget_input.addItem("Smart Investment", 7)
        self.budget_input.addItem("Low Return (Money Pit)", 2)
        
        self.imp_input = QComboBox()
        self.imp_input.addItem("Reliability Upgrade", 6) # Default
        self.imp_input.addItem("Safety / Critical", 10)
        self.imp_input.addItem("Core Mechanical", 8)
        self.imp_input.addItem("Comfort / Interior", 4)
        self.imp_input.addItem("Cosmetic / Aesthetic", 2)
        
        # Add Rows
        self.form.addRow("Sub-Project:", self.sub_input)
        self.form.addRow("Work Package:", self.wp_input)
        self.form.addRow("Task Name:", self.name_input)
        self.form.addRow("Est. Cost:", self.cost_input)
        self.form.addRow("Financial Logic:", self.budget_input)
        self.form.addRow("Technical Importance:", self.imp_input)
        
        self.layout.addLayout(self.form)
        
        # Buttons
        self.buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        self.buttons.accepted.connect(self.accept)
        self.buttons.rejected.connect(self.reject)
        self.layout.addWidget(self.buttons)
        
        self.populate_wps()

    def populate_wps(self):
        self.wp_input.clear()
        sub_id = self.sub_input.currentData()
        selected_sub = next((s for s in self.project.sub_projects if s.id == sub_id), None)
        if selected_sub:
            for wp in selected_sub.work_packages:
                self.wp_input.addItem(wp.name, wp.id)

    def get_data(self):
        # We now use currentData() to get the integer value (10, 8, etc.)
        return {
            "sub_id": self.sub_input.currentData(),
            "wp_id": self.wp_input.currentData(),
            "name": self.name_input.text(),
            "cost": self.cost_input.value(),
            "budget": self.budget_input.currentData(),
            "importance": self.imp_input.currentData()
        }

class TalusWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Talus Tally - Bronco II Control Center")
        self.resize(1000, 600)
        
        # ToolBar
        toolbar = QToolBar("Main Toolbar")
        self.addToolBar(toolbar)
        add_action = QAction("Add Task", self)
        add_action.triggered.connect(self.open_add_task_dialog)
        toolbar.addAction(add_action)
        
        # Central Widget
        self.central_widget = QWidget()
        self.setCentralWidget(self.central_widget)
        self.layout = QVBoxLayout(self.central_widget)
        
        # Tree View
        self.tree = QTreeWidget()
        self.tree.setHeaderLabels(["Item / Task", "Cost ($)", "Budget (1-10)", "Importance", "Status"])
        header = self.tree.header()
        header.setSectionResizeMode(0, QHeaderView.Stretch)
        header.setSectionResizeMode(1, QHeaderView.ResizeToContents)
        header.setSectionResizeMode(4, QHeaderView.ResizeToContents)
        
        self.tree.setContextMenuPolicy(Qt.CustomContextMenu)
        self.tree.customContextMenuRequested.connect(self.open_context_menu)
        
        self.layout.addWidget(self.tree)
        
        self.project_data = None
        self.manager = TaskManager()
        self.load_project()

    def load_project(self):
        data_path = "data/talus_master.json"
        if not os.path.exists(data_path): return
        try:
            with open(data_path, "r") as f:
                raw_data = json.load(f)
                self.project_data = Project.model_validate(raw_data)
            self.populate_tree(self.project_data)
        except Exception as e:
            traceback.print_exc()

    def populate_tree(self, project):
        self.tree.clear()
        for sub in project.sub_projects:
            sub_item = QTreeWidgetItem(self.tree)
            sub_item.setText(0, sub.name)
            sub_item.setExpanded(True)
            sub_item.setBackground(0, Qt.lightGray)
            
            for wp in sub.work_packages:
                wp_item = QTreeWidgetItem(sub_item)
                wp_item.setText(0, wp.name)
                wp_item.setExpanded(True)
                
                for task in wp.tasks:
                    task_item = QTreeWidgetItem(wp_item)
                    task_item.setText(0, task.text)
                    task_item.setText(1, f"${task.estimated_cost:,.2f}")
                    task_item.setText(2, str(task.budget_priority))
                    task_item.setText(3, str(task.importance))
                    task_item.setText(4, task.status.value.upper())
                    
                    task_item.setData(0, Qt.UserRole, task.id)
                    
                    if task.status == Status.COMPLETE:
                        task_item.setForeground(0, Qt.green)
                    elif task.status == Status.BLOCKED:
                        task_item.setForeground(0, Qt.red)
                        task_item.setText(0, f"[BLOCKED] {task.text}")

    def open_context_menu(self, position):
        item = self.tree.itemAt(position)
        if not item: return
        task_id = item.data(0, Qt.UserRole)
        if not task_id: return
        
        menu = QMenu()
        complete_action = QAction("Mark Complete", self)
        complete_action.triggered.connect(self.mark_selected_complete)
        menu.addAction(complete_action)
        menu.exec(self.tree.viewport().mapToGlobal(position))

    def mark_selected_complete(self):
        item = self.tree.currentItem()
        if not item: return
        task_id = item.data(0, Qt.UserRole)
        if not task_id: return
        try:
            self.manager.complete_task(self.project_data, task_id)
            item.setForeground(0, Qt.green)
            item.setText(4, "COMPLETE")
            with open("data/talus_master.json", "w") as f:
                f.write(self.project_data.model_dump_json(indent=4))
            print(f"✅ Task {task_id} marked complete.")
        except Exception as e:
            QMessageBox.critical(self, "Error", str(e))

    def open_add_task_dialog(self):
        if not self.project_data: return
        dialog = AddTaskDialog(self.project_data, self)
        if dialog.exec():
            data = dialog.get_data()
            new_id = f"T-{str(uuid.uuid4())[:8]}"
            new_task = Task(
                id=new_id, text=data["name"], estimated_cost=data["cost"],
                budget_priority=data["budget"], importance=data["importance"]
            )
            try:
                self.manager.add_task(self.project_data, data["sub_id"], data["wp_id"], new_task)
                with open("data/talus_master.json", "w") as f:
                    f.write(self.project_data.model_dump_json(indent=4))
                self.populate_tree(self.project_data)
            except Exception as e:
                QMessageBox.critical(self, "Error", str(e))

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = TalusWindow()
    window.show()
    sys.exit(app.exec())
