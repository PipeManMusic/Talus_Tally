#!/usr/bin/env python3
import sys
import os
import traceback
import json
import uuid
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict
from PySide6.QtWidgets import (QApplication, QMainWindow, QVBoxLayout, QWidget, 
                               QTreeWidget, QTreeWidgetItem, QHeaderView, QToolBar,
                               QDialog, QFormLayout, QComboBox, QLineEdit, QDoubleSpinBox, 
                               QSpinBox, QDialogButtonBox, QMessageBox, QMenu, QFileDialog, 
                               QInputDialog, QLabel, QStatusBar, QStyle, QProgressBar, QTextEdit,
                               QHBoxLayout, QPushButton, QAbstractItemView)
from PySide6.QtGui import QAction, QColor, QCloseEvent, QDrag, QIcon
from PySide6.QtCore import Qt, QSize, QMimeData
from backend.models import Project, Task, Status, SubProject, WorkPackage
from backend.manager import TaskManager
from backend.engine import PriorityEngine
from backend.translator import MarkdownGenerator
from backend.injector import DocInjector
from backend.git_manager import GitAutomation
from backend.persistence import PersistenceManager
from backend.dropbox_paths import get_dropbox_data_path
from backend.sync import SyncManager, DropboxSyncConflict

try:
    from .secrets import (
        DROPBOX_APP_KEY as DESKTOP_APP_KEY,
        DROPBOX_APP_SECRET as DESKTOP_APP_SECRET,
        DROPBOX_REFRESH_TOKEN as DESKTOP_REFRESH_TOKEN,
    )
except ImportError:
    DESKTOP_APP_KEY = DESKTOP_APP_SECRET = DESKTOP_REFRESH_TOKEN = None

try:
    from frontend.mobile.secrets import (
        DROPBOX_APP_KEY as MOBILE_APP_KEY,
        DROPBOX_APP_SECRET as MOBILE_APP_SECRET,
        DROPBOX_REFRESH_TOKEN as MOBILE_REFRESH_TOKEN,
    )
except ImportError:
    MOBILE_APP_KEY = MOBILE_APP_SECRET = MOBILE_REFRESH_TOKEN = None

# --- CONSTANTS ---
ROLE_ID = Qt.UserRole
ROLE_TYPE = Qt.UserRole + 1
TYPE_TASK = "TASK"
TYPE_WP = "WP"
TYPE_SUB = "SUB"

DOWNTIME_LABELS = {
    10: "System Enabler",
    8: "Daily-Drive Friendly",
    6: "Weekend Warrior",
    4: "Major Surgery",
    2: "Cosmetic",
}


def _downtime_label(value):
    if value is None:
        return "Unspecified"
    return DOWNTIME_LABELS.get(value, f"Custom ({value})")


def _resolve_dropbox_credentials():
    if os.environ.get("TALUS_TALLY_DISABLE_DROPBOX"):
        return {}

    refresh_token = (
        os.environ.get("DROPBOX_REFRESH_TOKEN")
        or DESKTOP_REFRESH_TOKEN
        or MOBILE_REFRESH_TOKEN
    )
    app_key = (
        os.environ.get("DROPBOX_APP_KEY")
        or DESKTOP_APP_KEY
        or MOBILE_APP_KEY
    )
    app_secret = (
        os.environ.get("DROPBOX_APP_SECRET")
        or DESKTOP_APP_SECRET
        or MOBILE_APP_SECRET
    )
    access_token = os.environ.get("DROPBOX_ACCESS_TOKEN")

    if refresh_token and app_key and app_secret:
        return {
            "refresh_token": refresh_token,
            "app_key": app_key,
            "app_secret": app_secret,
        }

    if access_token:
        return {"access_token": access_token}

    return {}

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
        for value in (10, 8, 6, 4, 2):
            label = DOWNTIME_LABELS[value]
            self.downtime_input.addItem(f"{label} ({value})", value)
        self.downtime_input.setCurrentIndex(1)
        
        self.imp_input = QComboBox()
        self.imp_input.addItem("N/A (Non-Physical/Software)", None)
        self.imp_input.addItem("Reliability Upgrade (6)", 6)
        self.imp_input.addItem("Safety / Critical (10)", 10)
        self.imp_input.addItem("Core Mechanical (8)", 8)
        self.imp_input.addItem("Comfort / Interior (4)", 4)
        self.imp_input.addItem("Cosmetic (2)", 2)

        self.blocking_tree = QTreeWidget()
        self.blocking_tree.setHeaderHidden(True)
        self.blocking_tree.setMinimumHeight(180)
        self._populate_blocking_tree(task_to_edit.id if task_to_edit else None)

        self.form.addRow("Sub-Project:", self.sub_input)
        self.form.addRow("Work Package:", self.wp_input)
        self.form.addRow("Status:", self.status_input)
        self.form.addRow("Task Description:", self.name_input)
        self.form.addRow("Estimated Cost:", self.est_cost_input)
        self.form.addRow("Actual Cost:", self.act_cost_input)
        self.form.addRow("Build Impact/Downtime:", self.downtime_input)
        self.form.addRow("Tech Importance:", self.imp_input)
        self.form.addRow("Blocks Systems:", self.blocking_tree)
        
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
        self._set_blocking_selection(getattr(t, "blocking", None) or [])

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

    def _populate_blocking_tree(self, exclude_task_id=None):
        self.blocking_tree.clear()
        for sub in self.project.sub_projects:
            sub_item = QTreeWidgetItem([sub.name])
            sub_item.setFlags(Qt.ItemIsEnabled)
            self.blocking_tree.addTopLevelItem(sub_item)
            for wp in sub.work_packages:
                wp_item = QTreeWidgetItem([f"{wp.name} (WP)"])
                wp_item.setFlags(Qt.ItemIsEnabled)
                sub_item.addChild(wp_item)
                for task in wp.tasks:
                    if exclude_task_id and task.id == exclude_task_id:
                        continue
                    label = f"{task.text} [{task.id}]"
                    task_item = QTreeWidgetItem([label])
                    task_item.setData(0, ROLE_ID, task.id)
                    task_item.setFlags(task_item.flags() | Qt.ItemIsUserCheckable)
                    task_item.setCheckState(0, Qt.Unchecked)
                    wp_item.addChild(task_item)
        self.blocking_tree.expandAll()

    def _set_blocking_selection(self, blocking_ids):
        if not blocking_ids:
            return
        targets = set(blocking_ids)
        for item in self._iter_task_items():
            if item.data(0, ROLE_ID) in targets:
                item.setCheckState(0, Qt.Checked)

    def _iter_task_items(self):
        for i in range(self.blocking_tree.topLevelItemCount()):
            sub_item = self.blocking_tree.topLevelItem(i)
            for j in range(sub_item.childCount()):
                wp_item = sub_item.child(j)
                for k in range(wp_item.childCount()):
                    yield wp_item.child(k)

    def get_data(self):
        return {
            "sub_id": self.sub_input.currentData(),
            "wp_id": self.wp_input.currentData(),
            "name": self.name_input.text(),
            "est_cost": self.est_cost_input.value(),
            "act_cost": self.act_cost_input.value(),
            "budget": self.downtime_input.currentData(),
            "importance": self.imp_input.currentData(),
            "status": self.status_input.currentData(),
            "blocking": [item.data(0, ROLE_ID) for item in self._iter_task_items() if item.checkState(0) == Qt.Checked],
        }

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
    def __init__(self, data_path=None):
        super().__init__()
        self.setWindowTitle("Talus Tally V1.1")
        self.resize(1100, 700)
        default_path = Path(data_path) if data_path else get_dropbox_data_path()
        self.data_path = str(default_path)
        self.git = GitAutomation()
        self.manager = TaskManager()
        self.engine = PriorityEngine()
        self.project_data = None
        self.is_dirty = False

        self.sync = self._create_sync_manager()
        self._busy = False
        self._interactive_actions = []
        self._progress_snapshot = None
        
        self.last_sub_id = None
        self.last_wp_id = None
        
        self.setup_ui()
        self.load_project()

    def _toolbar_icon(self, theme_name, fallback_pixmap):
        icon = QIcon.fromTheme(theme_name)
        if icon.isNull():
            return self.style().standardIcon(fallback_pixmap)
        return icon

    def setup_ui(self):
        # Menu Bar
        menubar = self.menuBar()
        
        file_menu = menubar.addMenu("File")
        self.act_new = QAction("New Project", self)
        self.act_new.triggered.connect(self.new_project)
        file_menu.addAction(self.act_new)
        
        self.act_open = QAction("Open...", self)
        self.act_open.triggered.connect(self.open_project_dialog)
        file_menu.addAction(self.act_open)
        
        self.act_save = QAction("Save", self)
        self.act_save.triggered.connect(self.save_project)
        file_menu.addAction(self.act_save)
        
        self.act_save_as = QAction("Save As...", self)
        self.act_save_as.triggered.connect(self.save_project_as)
        file_menu.addAction(self.act_save_as)

        self.act_sync = QAction("Sync from Dropbox", self)
        self.act_sync.triggered.connect(self.manual_sync)
        file_menu.addAction(self.act_sync)
        
        view_menu = menubar.addMenu("View")
        self.act_sort_menu = QAction("Sort by Velocity", self)
        self.act_sort_menu.triggered.connect(self.sort_by_velocity)
        view_menu.addAction(self.act_sort_menu)
        
        git_menu = menubar.addMenu("Git")
        self.act_push = QAction("Push Changes", self)
        self.act_push.triggered.connect(self.manual_push)
        git_menu.addAction(self.act_push)
        
        # Toolbar
        toolbar = QToolBar("Main Controls")
        toolbar.setIconSize(QSize(32, 32))
        self.addToolBar(toolbar)

        add_sub_icon = self._toolbar_icon("folder-new", QStyle.SP_FileDialogNewFolder)
        add_task_icon = self._toolbar_icon("list-add", QStyle.SP_FileIcon)
        save_icon = self._toolbar_icon("document-save", QStyle.SP_DriveFDIcon)
        sort_icon = self._toolbar_icon("view-sort-descending", QStyle.SP_ArrowDown)
        sync_icon = self._toolbar_icon("view-refresh", QStyle.SP_BrowserReload)
        list_icon = self._toolbar_icon("view-list", QStyle.SP_FileDialogDetailedView)
        
        self.act_add_sub = QAction(add_sub_icon, "Add Sub-Project", self)
        self.act_add_sub.triggered.connect(self.add_sub_project_dialog)
        toolbar.addAction(self.act_add_sub)

        self.act_add_task = QAction(add_task_icon, "Add Task", self)
        self.act_add_task.triggered.connect(self.open_add_task_dialog)
        toolbar.addAction(self.act_add_task)
        
        toolbar.addSeparator()
        
        self.act_list = QAction(list_icon, "Shopping List", self)
        self.act_list.triggered.connect(self.show_shopping_list)
        toolbar.addAction(self.act_list)

        self.act_sort = QAction(sort_icon, "Sort", self)
        self.act_sort.triggered.connect(self.sort_by_velocity)
        toolbar.addAction(self.act_sort)

        self.act_toolbar_save = QAction(save_icon, "Save", self)
        self.act_toolbar_save.triggered.connect(self.save_project)
        toolbar.addAction(self.act_toolbar_save)

        self.act_toolbar_sync = QAction(sync_icon, "Sync", self)
        self.act_toolbar_sync.triggered.connect(self.manual_sync)
        toolbar.addAction(self.act_toolbar_sync)

        self._interactive_actions = [
            self.act_save,
            self.act_save_as,
            self.act_sync,
            self.act_sort_menu,
            self.act_push,
            self.act_add_sub,
            self.act_add_task,
            self.act_list,
            self.act_sort,
            self.act_toolbar_save,
            self.act_toolbar_sync,
            self.act_new,
            self.act_open,
        ]
        
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
    def _create_sync_manager(self):
        creds = _resolve_dropbox_credentials()
        if not creds:
            return None

        try:
            if {
                "refresh_token",
                "app_key",
                "app_secret",
            }.issubset(creds.keys()):
                return SyncManager(
                    refresh_token=creds["refresh_token"],
                    app_key=creds["app_key"],
                    app_secret=creds["app_secret"],
                )

            if "access_token" in creds:
                return SyncManager(access_token=creds["access_token"])
        except Exception as exc:
            print(f"Dropbox Sync Init Error: {exc}")

        return None

    def _begin_busy(self, message: str):
        if self._busy:
            return

        self._busy = True
        status = self.statusBar()
        if status:
            status.showMessage(message)

        if self.global_pbar:
            self._progress_snapshot = (
                self.global_pbar.minimum(),
                self.global_pbar.maximum(),
                self.global_pbar.value(),
            )
            self.global_pbar.setRange(0, 0)

        self.central_widget.setEnabled(False)
        for action in self._interactive_actions:
            action.setEnabled(False)

        QApplication.processEvents()

    def _end_busy(self, message: str | None = None):
        if not self._busy:
            if message:
                status = self.statusBar()
                if status:
                    status.showMessage(message, 3000)
            return

        self._busy = False

        self.central_widget.setEnabled(True)
        for action in self._interactive_actions:
            action.setEnabled(True)

        if self.global_pbar and self._progress_snapshot:
            minimum, maximum, value = self._progress_snapshot
            self.global_pbar.setRange(minimum, maximum)
            self.global_pbar.setValue(value)
            self._progress_snapshot = None

        status = self.statusBar()
        if status:
            if message:
                status.showMessage(message, 3000)
            else:
                status.clearMessage()

    def sync_from_cloud(self):
        if not self.sync or not self.data_path:
            return False

        try:
            if self.sync.download_db(self.data_path):
                status = self.statusBar()
                if status:
                    status.showMessage("Synced from Dropbox", 5000)
                return True
        except Exception as exc:
            print(f"Dropbox Sync Download Error: {exc}")
        return False

    def sync_to_cloud(self):
        if not self.sync or not self.data_path:
            return True

        try:
            if self.sync.upload_db(self.data_path):
                status = self.statusBar()
                if status:
                    status.showMessage("Synced to Dropbox", 5000)
                return True
            return False
        except DropboxSyncConflict:
            QMessageBox.warning(
                self,
                "Sync Conflict",
                "Dropbox has a newer copy of this project. Reload before saving again.",
            )
            return False
        except Exception as exc:
            print(f"Dropbox Sync Upload Error: {exc}")
            QMessageBox.warning(
                self,
                "Sync Error",
                "Failed to upload the project to Dropbox. Changes remain saved locally.",
            )
            return False

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
        if not self.data_path:
            self.data_path = str(get_dropbox_data_path())
        os.makedirs(os.path.dirname(self.data_path), exist_ok=True)
        self.mark_dirty()
        self.populate_tree()

    def open_project_dialog(self):
        start_dir = os.path.dirname(self.data_path) if self.data_path else os.getcwd()
        fname, _ = QFileDialog.getOpenFileName(self, "Open Project", start_dir, "JSON Files (*.json)")
        if fname:
            self.data_path = fname
            self.load_project()

    def save_project_as(self):
        start_dir = os.path.dirname(self.data_path) if self.data_path else os.getcwd()
        fname, _ = QFileDialog.getSaveFileName(self, "Save Project", start_dir, "JSON Files (*.json)")
        if fname:
            self.data_path = fname
            self.save_project()

    def load_project(self, *, skip_remote=False):
        if not self.data_path:
            self.new_project()
            return

        if not skip_remote:
            self.sync_from_cloud()

        if not os.path.exists(self.data_path):
            self.project_data = Project(name="Bronco II Restoration")
            os.makedirs(os.path.dirname(self.data_path), exist_ok=True)
            self.mark_dirty()
            self.populate_tree()
            self.update_tally()
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
            
        self._begin_busy("Saving project...")
        status_message = "Save failed"
        try:
            os.makedirs(os.path.dirname(self.data_path), exist_ok=True)
            
            self.project_data.last_updated = datetime.now(timezone.utc).isoformat()

            # Use PersistenceManager for safe saving and backups
            pm = PersistenceManager(self.data_path)
            pm.save(self.project_data)
            
            gen = MarkdownGenerator()
            try:
                DocInjector("README.md").update_roadmap(gen.render(self.project_data))
            except Exception:
                pass

            if self.sync_to_cloud():
                self.mark_clean()
                status_message = "Save complete"
            else:
                self.mark_dirty()
                status_message = "Saved locally (Dropbox pending)"
        except Exception as e:
            QMessageBox.critical(self, "Save Error", str(e))
        finally:
            self._end_busy(status_message)
            
    # --- GIT OPERATIONS ---
    def manual_sync(self):
        if not self.sync:
            QMessageBox.information(
                self,
                "Sync Unavailable",
                "Dropbox sync is not configured for this desktop app.",
            )
            return

        if self.is_dirty:
            reply = QMessageBox.question(
                self,
                "Unsaved Changes",
                "Syncing will replace unsaved local edits with the Dropbox copy. Continue?",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No,
            )
            if reply != QMessageBox.Yes:
                return

        self._begin_busy("Syncing from Dropbox...")
        sync_message = "Sync skipped"
        try:
            if self.sync_from_cloud():
                sync_message = "Sync complete"
                self.load_project(skip_remote=True)
            else:
                QMessageBox.information(
                    self,
                    "Sync",
                    "No updates were downloaded from Dropbox.",
                )
        finally:
            self._end_busy(sync_message)

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
            new_t = Task(
                id=f"T-{uuid.uuid4().hex[:6]}",
                text=d["name"],
                estimated_cost=d["est_cost"],
                actual_cost=d["act_cost"],
                budget_priority=d["budget"],
                importance=d["importance"],
                status=d["status"],
                blocking=d["blocking"],
            )
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

    def _runtime_blocked_ids(self):
        if not self.project_data:
            return set()

        task_lookup = {}
        for sub in self.project_data.sub_projects:
            for wp in sub.work_packages:
                for task in wp.tasks:
                    task_lookup[task.id] = task

        blocked_ids = set()
        for task in task_lookup.values():
            if getattr(task, "blocking", None) and task.status != Status.COMPLETE:
                for blocked_id in task.blocking:
                    if blocked_id in task_lookup:
                        blocked_ids.add(blocked_id)
        return blocked_ids

    def _is_runtime_blocked(self, task, blocked_ids):
        return task.id in blocked_ids and task.status != Status.COMPLETE

    def populate_tree(self):
        self.tree.clear()
        if not self.project_data: return
        
        blocked_ids = self._runtime_blocked_ids()

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
                    forced_blocked = self._is_runtime_blocked(task, blocked_ids)
                    t_item = QTreeWidgetItem(wp_item)
                    t_item.setText(0, task.text)
                    t_item.setText(1, f"${task.estimated_cost:,.2f}")
                    t_item.setText(2, f"${task.actual_cost:,.2f}")
                    downtime_value = task.budget_priority
                    velocity_score = self.engine.calculate_task_score(
                        sub.priority,
                        wp.importance,
                        task,
                        forced_blocked=forced_blocked,
                    )
                    combined_score = self.engine.calculate_combined_priority(
                        sub.priority,
                        wp.importance,
                        task,
                        base_score=velocity_score,
                        forced_blocked=forced_blocked,
                    )
                    downtime_text = _downtime_label(downtime_value)

                    t_item.setText(3, f"{combined_score:.1f} ({downtime_text})")
                    t_item.setData(3, Qt.UserRole, combined_score)
                    tooltip_bits = [
                        f"Velocity score: {velocity_score:.1f}",
                        f"Downtime: {downtime_text}{f' ({downtime_value})' if downtime_value is not None else ''}",
                        f"Blocks: {len(getattr(task, 'blocking', []))}",
                    ]
                    t_item.setToolTip(3, "\n".join(tooltip_bits))
                    status_text = (
                        "BLOCKED"
                        if forced_blocked
                        else str(task.status).upper().split(".")[-1]
                    )
                    t_item.setText(4, status_text)
                    t_item.setData(0, ROLE_ID, task.id); t_item.setData(0, ROLE_TYPE, TYPE_TASK)
                    
                    if task.status == Status.COMPLETE:
                        t_item.setForeground(0, Qt.green)
                    elif forced_blocked or task.status == Status.BLOCKED:
                        t_item.setForeground(0, Qt.red)

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
            self.manager.update_task(
                self.project_data,
                tid,
                {
                    "text": d["name"],
                    "estimated_cost": d["est_cost"],
                    "actual_cost": d["act_cost"],
                    "budget_priority": d["budget"],
                    "importance": d["importance"],
                    "status": d["status"],
                    "blocking": d["blocking"],
                },
            )
            self.populate_tree()
            self.mark_dirty()

    def sort_by_velocity(self):
        blocked_ids = self._runtime_blocked_ids()

        for sub in self.project_data.sub_projects:
            for wp in sub.work_packages:
                wp.tasks.sort(
                    key=lambda t: self.engine.calculate_combined_priority(
                        sub.priority,
                        wp.importance,
                        t,
                        forced_blocked=self._is_runtime_blocked(t, blocked_ids),
                    ),
                    reverse=True,
                )
        self.populate_tree()
        self.mark_dirty()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = TalusWindow()
    window.show()
    sys.exit(app.exec())