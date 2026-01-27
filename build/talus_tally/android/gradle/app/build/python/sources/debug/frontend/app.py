#!/usr/bin/env python3
import sys
import os
import traceback
import json
import uuid
from collections import defaultdict
from PySide6.QtWidgets import (QApplication, QMainWindow, QVBoxLayout, QWidget, 
                               QTreeWidget, QTreeWidgetItem, QHeaderView, QToolBar,
                               QDialog, QFormLayout, QComboBox, QLineEdit, QDoubleSpinBox, 
                               QSpinBox, QDialogButtonBox, QMessageBox, QMenu, QFileDialog, 
                               QInputDialog, QLabel, QStatusBar, QStyle, QProgressBar, QTextEdit,
                               QHBoxLayout, QPushButton, QAbstractItemView)
from PySide6.QtGui import QAction, QColor, QCloseEvent, QDrag
from PySide6.QtCore import Qt, QSize, QMimeData
from backend.models import Project, Task, Status, SubProject, WorkPackage
from backend.manager import TaskManager
from backend.engine import PriorityEngine
from backend.translator import MarkdownGenerator
from backend.injector import DocInjector
from backend.git_manager import GitAutomation

# --- CONSTANTS ---
ROLE_ID = Qt.UserRole
ROLE_TYPE = Qt.UserRole + 1
TYPE_TASK = "TASK"
TYPE_WP = "WP"
TYPE_SUB = "SUB"

# --- CUSTOM TREE WIDGET FOR DRAG & DROP ---
class DragDropTree(QTreeWidget):
    """
    Custom QTreeWidget to handle specific Drag & Drop logic for Talus Tally.
    """
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setDragEnabled(True)
        self.setAcceptDrops(True)
        self.setDropIndicatorShown(True)
        self.setDragDropMode(QAbstractItemView.InternalMove)
        self.main_window = None # Reference to call manager methods

    def dragEnterEvent(self, event):
        # Only accept internal moves
        if event.source() == self:
            event.accept()
        else:
            event.ignore()

    def dragMoveEvent(self, event):
        # 1. Check what we are dragging
        items = self.selectedItems()
        if not items: 
            event.ignore()
            return
        item = items[0]
            
        item_type = item.data(0, ROLE_TYPE)
        
        # 2. Check where we are hovering
        target = self.itemAt(event.position().toPoint())
        if not target:
            event.ignore()
            return
            
        target_type = target.data(0, ROLE_TYPE)
        
        # RULE: Tasks can be dropped onto Work Packages OR other Tasks (siblings)
        if item_type == TYPE_TASK:
            if target_type == TYPE_WP:
                event.accept()
            elif target_type == TYPE_TASK:
                event.accept()
            else:
                event.ignore()
        else:
            event.ignore()

    def dropEvent(self, event):
        if event.source() != self:
            return

        items = self.selectedItems()
        if not items:
            return
        item = items[0]
        
        target = self.itemAt(event.position().toPoint())
        if not target:
            return

        # Get IDs
        task_id = item.data(0, ROLE_ID)
        target_type = target.data(0, ROLE_TYPE)
        
        new_wp_id = None
        
        # Determine Destination WP
        if target_type == TYPE_WP:
            new_wp_id = target.data(0, ROLE_ID)
        elif target_type == TYPE_TASK:
            # Dropped on a task -> Get that task's parent (the WP)
            parent = target.parent()
            if parent:
                new_wp_id = parent.data(0, ROLE_ID)
        
        # Perform the logic move
        if self.main_window and new_wp_id:
            try:
                self.main_window.manager.move_task(self.main_window.project_data, task_id, new_wp_id)
                self.main_window.mark_dirty()
                
                # Visual Refresh (The default implementation of dropEvent does a visual move, 
                # but we want to rebuild from data to be safe and ensure consistency)
                event.ignore() # Prevent default visual behavior
                self.main_window.populate_tree()
                
            except Exception as e:
                print(f"Drop Error: {e}")
                event.ignore()


# --- DIALOGS (Unchanged) ---
class SubProjectDialog(QDialog):
    def __init__(self, parent=None, sub_to_edit=None):
        super().__init__(parent)
        self.setWindowTitle("Edit Sub-Project" if sub_to_edit else "Add Sub-Project")
        self.layout = QVBoxLayout(self)
        self.form = QFormLayout()
        
        self.name_input = QLineEdit()
        self.priority_input = QSpinBox()
        self.priority_input.setRange(1, 10)
        self.priority_input.setValue(5)
        
        self.form.addRow("Name:", self.name_input)
        self.form.addRow("Priority (1-10):", self.priority_input)
        
        self.layout.addLayout(self.form)
        self.buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        self.buttons.accepted.connect(self.accept)
        self.buttons.rejected.connect(self.reject)
        self.layout.addWidget(self.buttons)
        
        if sub_to_edit:
            self.name_input.setText(sub_to_edit.name)
            self.priority_input.setValue(sub_to_edit.priority)

    def get_data(self):
        return {
            "name": self.name_input.text(),
            "priority": self.priority_input.value()
        }

class WorkPackageDialog(QDialog):
    def __init__(self, parent=None, wp_to_edit=None):
        super().__init__(parent)
        self.setWindowTitle("Edit Work Package" if wp_to_edit else "Add Work Package")
        self.layout = QVBoxLayout(self)
        self.form = QFormLayout()
        
        self.name_input = QLineEdit()
        self.importance_input = QSpinBox()
        self.importance_input.setRange(1, 10)
        self.importance_input.setValue(5)
        
        self.form.addRow("Name:", self.name_input)
        self.form.addRow("Importance (1-10):", self.importance_input)
        
        self.layout.addLayout(self.form)
        self.buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        self.buttons.accepted.connect(self.accept)
        self.buttons.rejected.connect(self.reject)
        self.layout.addWidget(self.buttons)
        
        if wp_to_edit:
            self.name_input.setText(wp_to_edit.name)
            self.importance_input.setValue(wp_to_edit.importance)

    def get_data(self):
        return {
            "name": self.name_input.text(),
            "importance": self.importance_input.value()
        }

class TaskDialog(QDialog):
    def __init__(self, project, parent=None, task_to_edit=None, default_sub=None, default_wp=None):
        super().__init__(parent)
        self.setWindowTitle("Edit Task" if task_to_edit else "Add New Task")
        self.project = project
        self.task_to_edit = task_to_edit
        self.layout = QVBoxLayout(self)
        self.form = QFormLayout()
        
        self.sub_input = QComboBox()
        self.wp_input = QComboBox()
        for sub in project.sub_projects:
            self.sub_input.addItem(sub.name, sub.id)
        self.sub_input.currentIndexChanged.connect(self.populate_wps)
        
        self.name_input = QLineEdit()
        self.est_cost_input = QDoubleSpinBox()
        self.est_cost_input.setRange(0, 1000000); self.est_cost_input.setPrefix("$")
        self.act_cost_input = QDoubleSpinBox()
        self.act_cost_input.setRange(0, 1000000); self.act_cost_input.setPrefix("$")
        
        self.status_input = QComboBox()
        for s in Status:
            self.status_input.addItem(s.value.replace("_", " ").title(), s)
        
        self.downtime_input = QComboBox()
        self.downtime_input.addItem("System Enabler (10)", 10)
        self.downtime_input.addItem("Daily-Drive Friendly (8)", 8)
        self.downtime_input.addItem("Weekend Warrior (6)", 6)
        self.downtime_input.addItem("Major Surgery (4)", 4)
        self.downtime_input.addItem("Cosmetic (2)", 2)
        self.downtime_input.setCurrentIndex(1)
        
        self.imp_input = QComboBox()
        self.imp_input.addItem("N/A (Non-Physical/Software)", None)
        self.imp_input.addItem("Reliability Upgrade (6)", 6)
        self.imp_input.addItem("Safety / Critical (10)", 10)
        self.imp_input.addItem("Core Mechanical (8)", 8)
        self.imp_input.addItem("Comfort / Interior (4)", 4)
        self.imp_input.addItem("Cosmetic (2)", 2)

        self.form.addRow("Sub-Project:", self.sub_input)
        self.form.addRow("Work Package:", self.wp_input)
        self.form.addRow("Status:", self.status_input)
        self.form.addRow("Task Description:", self.name_input)
        self.form.addRow("Estimated Cost:", self.est_cost_input)
        self.form.addRow("Actual Cost:", self.act_cost_input)
        self.form.addRow("Build Impact/Downtime:", self.downtime_input)
        self.form.addRow("Tech Importance:", self.imp_input)
        
        self.layout.addLayout(self.form)
        self.buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        self.buttons.accepted.connect(self.accept)
        self.buttons.rejected.connect(self.reject)
        self.layout.addWidget(self.buttons)
        
        self.populate_wps()
        if self.task_to_edit:
            self.prefill_data()
        elif default_sub:
            idx = self.sub_input.findData(default_sub)
            if idx >= 0: 
                self.sub_input.setCurrentIndex(idx)
                self.populate_wps()
                if default_wp:
                    idx_wp = self.wp_input.findData(default_wp)
                    if idx_wp >= 0: self.wp_input.setCurrentIndex(idx_wp)

    def populate_wps(self):
        self.wp_input.clear()
        sub_id = self.sub_input.currentData()
        sub = next((s for s in self.project.sub_projects if s.id == sub_id), None)
        if sub:
            for wp in sub.work_packages:
                self.wp_input.addItem(wp.name, wp.id)

    def prefill_data(self):
        t = self.task_to_edit
        self.name_input.setText(t.text)
        self.est_cost_input.setValue(t.estimated_cost)
        self.act_cost_input.setValue(t.actual_cost)
        idx = self.status_input.findData(t.status)
        if idx >= 0: self.status_input.setCurrentIndex(idx)
        legacy_priority = t.budget_priority
        idx = self.downtime_input.findData(legacy_priority)
        if idx >= 0:
            self.downtime_input.setCurrentIndex(idx)
        elif legacy_priority is not None:
            mapped = self._map_legacy_downtime(legacy_priority)
            idx = self.downtime_input.findData(mapped)
            if idx >= 0:
                self.downtime_input.setCurrentIndex(idx)
        idx = self.imp_input.findData(t.importance)
        if idx >= 0: self.imp_input.setCurrentIndex(idx)

    def get_data(self):
        return {
            "sub_id": self.sub_input.currentData(),
            "wp_id": self.wp_input.currentData(),
            "name": self.name_input.text(),
            "est_cost": self.est_cost_input.value(),
            "act_cost": self.act_cost_input.value(),
            "budget": self.downtime_input.currentData(),
            "importance": self.imp_input.currentData(),
            "status": self.status_input.currentData()
        }

    def _map_legacy_downtime(self, value):
        if value >= 9:
            return 10
        if value >= 7:
            return 8
        if value >= 5:
            return 6
        if value >= 3:
            return 4
        return 2

# --- SHOPPING LIST DIALOG ---
class ShoppingListDialog(QDialog):
    def __init__(self, text, total_cost, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Shopping List")
        self.resize(500, 600)
        layout = QVBoxLayout(self)
        
        info = QLabel(f"<b>Pending Parts & Materials</b><br>Total Estimated: ${total_cost:,.2f}")
        layout.addWidget(info)
        
        self.text_area = QTextEdit()
        self.text_area.setReadOnly(True)
        self.text_area.setPlainText(text)
        layout.addWidget(self.text_area)
        
        btn_layout = QHBoxLayout()
        self.btn_save = QPushButton("💾 Save to File...")
        self.btn_save.clicked.connect(self.save_to_file)
        btn_layout.addWidget(self.btn_save)
        
        self.buttons = QDialogButtonBox(QDialogButtonBox.Close)
        self.buttons.rejected.connect(self.reject)
        btn_layout.addWidget(self.buttons)
        
        layout.addLayout(btn_layout)

    def save_to_file(self):
        fname, _ = QFileDialog.getSaveFileName(self, "Save Shopping List", "shopping_list.txt", "Text Files (*.txt);;All Files (*)")
        if fname:
            try:
                with open(fname, "w") as f:
                    f.write(self.text_area.toPlainText())
                QMessageBox.information(self, "Success", "Shopping list saved successfully!")
            except Exception as e:
                QMessageBox.critical(self, "Error", f"Could not save file:\n{str(e)}")

# --- MAIN WINDOW ---
class TalusWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Talus Tally V1.1")
        self.resize(1100, 700)
        self.data_path = "data/talus_master.json"
        self.git = GitAutomation()
        self.manager = TaskManager()
        self.engine = PriorityEngine()
        self.project_data = None
        self.is_dirty = False
        
        self.last_sub_id = None
        self.last_wp_id = None
        
        self.setup_ui()
        self.load_project()

    def setup_ui(self):
        # Menu Bar
        menubar = self.menuBar()
        
        file_menu = menubar.addMenu("File")
        act_new = QAction("New Project", self)
        act_new.triggered.connect(self.new_project)
        file_menu.addAction(act_new)
        
        act_open = QAction("Open...", self)
        act_open.triggered.connect(self.open_project_dialog)
        file_menu.addAction(act_open)
        
        act_save = QAction("Save", self)
        act_save.triggered.connect(self.save_project)
        file_menu.addAction(act_save)
        
        act_save_as = QAction("Save As...", self)
        act_save_as.triggered.connect(self.save_project_as)
        file_menu.addAction(act_save_as)
        
        view_menu = menubar.addMenu("View")
        act_sort_menu = QAction("Sort by Velocity", self)
        act_sort_menu.triggered.connect(self.sort_by_velocity)
        view_menu.addAction(act_sort_menu)
        
        git_menu = menubar.addMenu("Git")
        act_push = QAction("Push Changes", self)
        act_push.triggered.connect(self.manual_push)
        git_menu.addAction(act_push)
        
        # Toolbar
        toolbar = QToolBar("Main Controls")
        toolbar.setIconSize(QSize(32, 32))
        self.addToolBar(toolbar)

        add_sub_icon = self.style().standardIcon(QStyle.SP_FileDialogNewFolder)
        add_task_icon = self.style().standardIcon(QStyle.SP_FileIcon)
        save_icon = self.style().standardIcon(QStyle.SP_DriveFDIcon)
        sort_icon = self.style().standardIcon(QStyle.SP_BrowserReload)
        list_icon = self.style().standardIcon(QStyle.SP_FileDialogInfoView) 
        
        act_add_sub = QAction(add_sub_icon, "Add Sub-Project", self)
        act_add_sub.triggered.connect(self.add_sub_project_dialog)
        toolbar.addAction(act_add_sub)

        act_add_task = QAction(add_task_icon, "Add Task", self)
        act_add_task.triggered.connect(self.open_add_task_dialog)
        toolbar.addAction(act_add_task)
        
        toolbar.addSeparator()
        
        act_list = QAction(list_icon, "Shopping List", self)
        act_list.triggered.connect(self.show_shopping_list)
        toolbar.addAction(act_list)

        act_sort = QAction(sort_icon, "Sort", self)
        act_sort.triggered.connect(self.sort_by_velocity)
        toolbar.addAction(act_sort)

        act_toolbar_save = QAction(save_icon, "Save", self)
        act_toolbar_save.triggered.connect(self.save_project)
        toolbar.addAction(act_toolbar_save)
        
        # Central Widget
        self.central_widget = QWidget()
        self.setCentralWidget(self.central_widget)
        self.layout = QVBoxLayout(self.central_widget)

        # REPLACED: Use DragDropTree instead of standard QTreeWidget
        self.tree = DragDropTree(self.central_widget)
        self.tree.main_window = self # Link back to controller
        
        self.tree.setHeaderLabels(["Item", "Est. Cost / Progress", "Act. Cost", "Priority", "Status"])
        self.tree.setContextMenuPolicy(Qt.CustomContextMenu)
        self.tree.customContextMenuRequested.connect(self.open_context_menu)
        header = self.tree.header()
        header.setSectionResizeMode(0, QHeaderView.Stretch)
        header.setSectionResizeMode(4, QHeaderView.ResizeToContents)
        self.layout.addWidget(self.tree)

        # Status Bar
        self.setStatusBar(QStatusBar())
        self.tally_label = QLabel("Tally: $0.00 / $0.00")
        self.statusBar().addPermanentWidget(self.tally_label)
        
        self.global_pbar = QProgressBar()
        self.global_pbar.setFixedWidth(200)
        self.global_pbar.setRange(0, 100)
        self.global_pbar.setValue(0)
        self.global_pbar.setTextVisible(True)
        self.global_pbar.setStyleSheet("""
            QProgressBar {
                border: 1px solid #999;
                border-radius: 4px;
                text-align: center;
                color: black;
                font-weight: bold;
            }
            QProgressBar::chunk {
                background-color: #4caf50;
                width: 10px;
            }
        """)
        self.statusBar().addPermanentWidget(self.global_pbar)

    # --- STATE MANAGEMENT ---
    def mark_dirty(self):
        self.is_dirty = True
        self.update_title()
        self.update_tally()

    def mark_clean(self):
        self.is_dirty = False
        self.update_title()

    def update_title(self):
        name = os.path.basename(self.data_path) if self.data_path else "New Project"
        dirty_marker = "*" if self.is_dirty else ""
        self.setWindowTitle(f"Talus Tally V1.1 - {name}{dirty_marker}")

    def closeEvent(self, event: QCloseEvent):
        if self.is_dirty:
            reply = QMessageBox.question(
                self, "Unsaved Changes", 
                "You have unsaved changes. Save before closing?",
                QMessageBox.Save | QMessageBox.Discard | QMessageBox.Cancel
            )
            
            if reply == QMessageBox.Save:
                self.save_project()
                event.accept()
            elif reply == QMessageBox.Discard:
                event.accept()
            else:
                event.ignore()
        else:
            event.accept()

    # --- FILE OPERATIONS ---
    def new_project(self):
        if self.is_dirty:
            pass 
        self.project_data = Project(name="Bronco II Restoration")
        self.data_path = None
        self.mark_dirty()
        self.populate_tree()

    def open_project_dialog(self):
        fname, _ = QFileDialog.getOpenFileName(self, "Open Project", "data", "JSON Files (*.json)")
        if fname:
            self.data_path = fname
            self.load_project()

    def save_project_as(self):
        fname, _ = QFileDialog.getSaveFileName(self, "Save Project", "data", "JSON Files (*.json)")
        if fname:
            self.data_path = fname
            self.save_project()

    def load_project(self):
        if not self.data_path or not os.path.exists(self.data_path):
            self.new_project()
            return
        try:
            with open(self.data_path, "r") as f:
                self.project_data = Project.model_validate(json.load(f))
            self.mark_clean()
            self.populate_tree()
            self.update_tally()
        except Exception as e:
            QMessageBox.critical(self, "Load Error", f"Failed to load project file:\n{str(e)}")

    def save_project(self):
        if not self.project_data: return
        
        if not self.data_path:
            self.save_project_as()
            return
            
        try:
            os.makedirs(os.path.dirname(self.data_path), exist_ok=True)
            with open(self.data_path, "w") as f:
                f.write(self.project_data.model_dump_json(indent=4))
            
            gen = MarkdownGenerator()
            try:
                DocInjector("README.md").update_roadmap(gen.render(self.project_data))
            except Exception:
                pass
                
            self.mark_clean()
        except Exception as e:
            QMessageBox.critical(self, "Save Error", str(e))
            
    # --- GIT OPERATIONS ---
    def manual_push(self):
        if self.is_dirty:
            self.save_project()
        
        msg, ok = QInputDialog.getText(self, "Push to Git", "Commit Message:", text="Manual Update")
        if ok and msg:
            try:
                self.git.push_update(msg)
                QMessageBox.information(self, "Success", "Changes pushed to GitHub successfully.")
            except Exception as e:
                QMessageBox.critical(self, "Git Error", str(e))

    # --- CRUD OPERATIONS ---
    def add_sub_project_dialog(self):
        dialog = SubProjectDialog(self)
        if dialog.exec():
            data = dialog.get_data()
            new_sub_id = f"SP-{uuid.uuid4().hex[:6]}"
            new_sub = SubProject(id=new_sub_id, name=data["name"], priority=data["priority"])
            
            default_wp_id = f"WP-{uuid.uuid4().hex[:6]}"
            default_wp = WorkPackage(id=default_wp_id, name="General")
            new_sub.work_packages.append(default_wp)
            
            self.manager.add_sub_project(self.project_data, new_sub)
            self.last_sub_id = new_sub_id
            self.last_wp_id = default_wp_id
            
            self.populate_tree()
            self.mark_dirty()

    def add_work_package_dialog(self, sub_id):
        dialog = WorkPackageDialog(self)
        if dialog.exec():
            data = dialog.get_data()
            new_wp_id = f"WP-{uuid.uuid4().hex[:6]}"
            new_wp = WorkPackage(id=new_wp_id, name=data["name"], importance=data["importance"])
            self.manager.add_work_package(self.project_data, sub_id, new_wp)
            
            self.last_sub_id = sub_id
            self.last_wp_id = new_wp_id
            
            self.populate_tree()
            self.mark_dirty()

    def open_add_task_dialog(self, pre_sub=None, pre_wp=None):
        if not self.project_data: return
        
        target_sub = pre_sub if pre_sub else self.last_sub_id
        target_wp = pre_wp if pre_wp else self.last_wp_id
        
        dlg = TaskDialog(self.project_data, self, default_sub=target_sub, default_wp=target_wp)
        if dlg.exec():
            d = dlg.get_data()
            new_t = Task(id=f"T-{uuid.uuid4().hex[:6]}", text=d["name"], 
                         estimated_cost=d["est_cost"], actual_cost=d["act_cost"],
                         budget_priority=d["budget"], importance=d["importance"], status=d["status"])
            self.manager.add_task(self.project_data, d["sub_id"], d["wp_id"], new_t)
            
            self.last_sub_id = d["sub_id"]
            self.last_wp_id = d["wp_id"]
            
            self.populate_tree()
            self.mark_dirty()

    def edit_sub_project(self, sub_id):
        sub = next((s for s in self.project_data.sub_projects if s.id == sub_id), None)
        if not sub: return
        dialog = SubProjectDialog(self, sub_to_edit=sub)
        if dialog.exec():
            self.manager.update_sub_project(self.project_data, sub_id, dialog.get_data())
            self.populate_tree()
            self.mark_dirty()

    def edit_work_package(self, wp_id):
        wp = None
        for sub in self.project_data.sub_projects:
            for w in sub.work_packages:
                if w.id == wp_id: wp = w; break
        if not wp: return
        
        dialog = WorkPackageDialog(self, wp_to_edit=wp)
        if dialog.exec():
            self.manager.update_work_package(self.project_data, wp_id, dialog.get_data())
            self.populate_tree()
            self.mark_dirty()

    def delete_work_package(self, wp_id):
        confirm = QMessageBox.question(self, "Delete WP?", "Delete this Work Package?", QMessageBox.Yes | QMessageBox.No)
        if confirm == QMessageBox.Yes:
            self.manager.delete_work_package(self.project_data, wp_id)
            self.populate_tree()
            self.mark_dirty()

    def delete_sub_project(self, sub_id):
        confirm = QMessageBox.question(self, "Delete Sub?", "Delete this Sub-Project?", QMessageBox.Yes | QMessageBox.No)
        if confirm == QMessageBox.Yes:
            self.manager.delete_sub_project(self.project_data, sub_id)
            self.populate_tree()
            self.mark_dirty()
    
    def mark_complete(self, tid):
        self.manager.complete_task(self.project_data, tid)
        self.save_project()
        self.populate_tree()
        self.git.push_update(f"Completed {tid}")

    # --- UI HELPERS ---
    def update_tally(self):
        if not self.project_data: return
        total_est = 0.0
        total_act = 0.0
        
        # Global Progress Tracking
        total_tasks_all = 0
        done_tasks_all = 0
        
        for sub in self.project_data.sub_projects:
            for wp in sub.work_packages:
                for t in wp.tasks:
                    total_est += t.estimated_cost
                    total_act += t.actual_cost
                    
                    total_tasks_all += 1
                    if t.status == Status.COMPLETE:
                        done_tasks_all += 1
                        
        self.tally_label.setText(f"Project Total - Est: ${total_est:,.2f} | Act: ${total_act:,.2f}")
        
        # Update Global Bar
        if total_tasks_all > 0:
            percent = int((done_tasks_all / total_tasks_all) * 100)
            self.global_pbar.setValue(percent)
        else:
            self.global_pbar.setValue(0)

    # --- SHOPPING LIST LOGIC ---
    def generate_shopping_report(self):
        if not self.project_data:
            return "", 0.0

        groups = defaultdict(list) 
        grand_total = 0.0

        for sub in self.project_data.sub_projects:
            for wp in sub.work_packages:
                for task in wp.tasks:
                    if task.status != Status.COMPLETE:
                        groups[task.status].append( (task, sub.name, wp.name) )
                        grand_total += task.estimated_cost
        
        lines = []
        # Updated Order to include BACKLOG
        priority_order = [Status.BLOCKED, Status.IN_PROGRESS, Status.BACKLOG, Status.PENDING]
        
        for status in priority_order:
            tasks = groups.get(status, [])
            if not tasks: continue
            
            if status == Status.PENDING:
                status_name = "PENDING (UNASSIGNED)"
            else:
                status_name = status.value.replace("_", " ").upper()

            lines.append(f"=== {status_name} ===")
            
            sub_total = 0.0
            for t, s_name, w_name in tasks:
                lines.append(f"[ ] {t.text} (${t.estimated_cost:,.2f}) - {s_name}/{w_name}")
                sub_total += t.estimated_cost
            
            lines.append(f"   Sub-total: ${sub_total:,.2f}\n")
            
        return "\n".join(lines), grand_total

    def show_shopping_list(self):
        report, total = self.generate_shopping_report()
        if not report:
            QMessageBox.information(self, "Shopping List", "No pending items found.")
            return
            
        dlg = ShoppingListDialog(report, total, self)
        dlg.exec()

    def populate_tree(self):
        self.tree.clear()
        if not self.project_data: return
        
        for sub in self.project_data.sub_projects:
            sub_item = QTreeWidgetItem(self.tree)
            sub_item.setText(0, f"📂 {sub.name.upper()}")
            sub_item.setData(0, ROLE_ID, sub.id); sub_item.setData(0, ROLE_TYPE, TYPE_SUB)
            sub_item.setBackground(0, QColor("#e1f5fe"))
            sub_item.setExpanded(True)
            
            # --- PROGRESS BAR LOGIC ---
            total_tasks = 0
            done_tasks = 0
            for wp in sub.work_packages:
                total_tasks += len(wp.tasks)
                done_tasks += sum(1 for t in wp.tasks if t.status == Status.COMPLETE)
            
            pbar = QProgressBar()
            pbar.setRange(0, 100)
            
            # FIX: Centered Text Alignment
            pbar.setStyleSheet("""
                QProgressBar {
                    border: 1px solid #999;
                    border-radius: 4px;
                    text-align: center;
                    color: black;
                    font-weight: bold;
                }
                QProgressBar::chunk {
                    background-color: #4caf50;
                    width: 10px;
                }
            """)
            
            if total_tasks > 0:
                percent = int((done_tasks / total_tasks) * 100)
                pbar.setValue(percent)
            else:
                pbar.setValue(0)
                
            self.tree.setItemWidget(sub_item, 1, pbar)
            
            for wp in sub.work_packages:
                wp_item = QTreeWidgetItem(sub_item)
                wp_item.setText(0, f"📦 {wp.name}")
                wp_item.setData(0, ROLE_ID, wp.id); wp_item.setData(0, ROLE_TYPE, TYPE_WP)
                wp_item.setExpanded(True)
                
                for task in wp.tasks:
                    t_item = QTreeWidgetItem(wp_item)
                    t_item.setText(0, task.text)
                    t_item.setText(1, f"${task.estimated_cost:,.2f}")
                    t_item.setText(2, f"${task.actual_cost:,.2f}")
                    prio = task.budget_priority if task.budget_priority is not None else "N/A"
                    t_item.setText(3, str(prio))
                    t_item.setText(4, str(task.status).upper().split(".")[-1])
                    t_item.setData(0, ROLE_ID, task.id); t_item.setData(0, ROLE_TYPE, TYPE_TASK)
                    
                    if task.status == Status.COMPLETE: t_item.setForeground(0, Qt.green)
                    elif task.status == Status.BLOCKED: t_item.setForeground(0, Qt.red)

    def open_context_menu(self, pos):
        item = self.tree.itemAt(pos)
        if not item: return
        menu = QMenu()
        tid = item.data(0, ROLE_ID)
        itype = item.data(0, ROLE_TYPE)
        
        if itype == TYPE_TASK:
            menu.addAction("✅ Complete", lambda: self.mark_complete(tid))
            menu.addAction("✏️ Edit Task", lambda: self.edit_task(tid))
            menu.addAction("🗑️ Delete Task", lambda: (self.manager.delete_task(self.project_data, tid), self.populate_tree(), self.mark_dirty()))
        
        elif itype == TYPE_WP:
            parent_item = item.parent()
            sub_id = parent_item.data(0, ROLE_ID)
            menu.addAction("➕ Add Task", lambda: self.open_add_task_dialog(pre_sub=sub_id, pre_wp=tid))
            menu.addAction("✏️ Edit Work Package", lambda: self.edit_work_package(tid))
            menu.addAction("🗑️ Delete Work Package", lambda: self.delete_work_package(tid))
            
        elif itype == TYPE_SUB:
            menu.addAction("➕ Add Work Package", lambda: self.add_work_package_dialog(tid))
            menu.addAction("✏️ Edit Sub-Project", lambda: self.edit_sub_project(tid))
            menu.addAction("🗑️ Delete Sub-Project", lambda: self.delete_sub_project(tid))
            
        menu.exec(self.tree.viewport().mapToGlobal(pos))

    def edit_task(self, tid):
        target = None
        for sub in self.project_data.sub_projects:
            for wp in sub.work_packages:
                for t in wp.tasks:
                    if t.id == tid: target = t; break
        if not target: return
        dlg = TaskDialog(self.project_data, self, task_to_edit=target)
        if dlg.exec():
            d = dlg.get_data()
            self.manager.update_task(self.project_data, tid, {
                "text": d["name"], "estimated_cost": d["est_cost"], "actual_cost": d["act_cost"],
                "budget_priority": d["budget"], "importance": d["importance"], "status": d["status"]
            })
            self.populate_tree()
            self.mark_dirty()

    def sort_by_velocity(self):
        for sub in self.project_data.sub_projects:
            for wp in sub.work_packages:
                wp.tasks.sort(key=lambda t: self.engine.calculate_task_score(sub.priority, wp.importance, t), reverse=True)
        self.populate_tree()
        self.mark_dirty()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = TalusWindow()
    window.show()
    sys.exit(app.exec())