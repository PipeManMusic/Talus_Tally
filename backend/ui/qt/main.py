"""Qt/PySide6-based GUI application for Talus Tally (Desktop)."""
import sys
import logging
import os
import re
from typing import Optional

try:
    from PySide6.QtWidgets import (
        QApplication, QMainWindow, QWidget, QVBoxLayout,
        QDockWidget, QTreeView, QFileDialog, QLabel, QMenu, QMenuBar, QToolBar,
        QInputDialog, QMessageBox, QStyle, QComboBox
    )
    from PySide6.QtGui import QAction, QIcon, QPixmap, QPainter, QColor, QFont, QFontDatabase
    from PySide6.QtCore import Qt, QPoint, QSize
    from backend.ui.qt.tree_model import GraphModel
    from backend.ui.qt.wizard import ProjectWizardDialog
    from backend.ui.qt.inspector import InspectorWidget
    from backend.ui.qt.theme import get_bronco_stylesheet
    from backend.infra.persistence import PersistenceManager
    from backend.infra.reporting import ReportEngine
    from backend.infra.schema_loader import SchemaLoader
    from backend.handlers.commands.node_commands import (
        CreateNodeCommand, DeleteNodeCommand, LinkNodeCommand, UpdatePropertyCommand
    )
    PYSIDE6_AVAILABLE = True
except ImportError:
    PYSIDE6_AVAILABLE = False
    # Fallbacks to prevent syntax errors in headless checks
    QApplication = QMainWindow = QWidget = object

logger = logging.getLogger(__name__)

# Cache the loaded font to avoid loading it multiple times
_loaded_font = None


def load_bronco_font():
    """Load the custom Bronco font (Michroma)."""
    global _loaded_font
    
    # Return cached font if already loaded
    if _loaded_font is not None:
        logger.debug(f"Returning cached font: {_loaded_font.family()}")
        return _loaded_font
    
    # backend/ui/qt/main.py -> go up to project root
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    font_path = os.path.join(project_root, "assets", "fonts", "bronco.ttf")
    logger.debug(f"Looking for font at: {font_path}")
    if os.path.exists(font_path):
        font_id = QFontDatabase.addApplicationFont(font_path)
        logger.debug(f"Font loaded with ID: {font_id}")
        if font_id != -1:
            font_family = QFontDatabase.applicationFontFamilies(font_id)
            logger.debug(f"Font family: {font_family}")
            if font_family:
                font = QFont(font_family[0])
                logger.debug(f"Successfully loaded font: {font.family()}")
                _loaded_font = font
                return font
    else:
        logger.debug(f"Font file not found at {font_path}")
    return None


def get_bronco_font(point_size: int = 10, bold: bool = False) -> Optional[QFont]:
    """Get a Bronco font with specified properties."""
    base_font = load_bronco_font()
    if base_font:
        font = QFont(base_font)  # Create a copy
        font.setPointSize(point_size)
        if bold:
            font.setBold(True)
        return font
    return None


class TitleBarButton(QWidget):
    """Custom button for title bar that passes mouse events to parent for dragging."""
    clicked = None  # Will be overridden in initialization
    
    def __init__(self, text: str):
        super().__init__()
        from PySide6.QtWidgets import QPushButton as QBuiltinPushButton
        self.button = QBuiltinPushButton(text)
        self.button.setStyleSheet("""
            QPushButton {
                background-color: transparent;
                color: #e0e0e0;
                border: none;
                padding: 0px;
                font-size: 16px;
                min-width: 40px;
                max-width: 40px;
            }
            QPushButton:hover {
                background-color: #2d2d2d;
            }
        """)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.button)
        self.parent_titlebar = None
        self.clicked = self.button.clicked
    
    def mousePressEvent(self, event):
        """Pass mouse events to title bar for dragging."""
        if self.parent_titlebar:
            self.parent_titlebar.mousePressEvent(event)
        else:
            super().mousePressEvent(event)
    
    def mouseMoveEvent(self, event):
        """Pass mouse events to title bar for dragging."""
        if self.parent_titlebar:
            self.parent_titlebar.mouseMoveEvent(event)
        else:
            super().mouseMoveEvent(event)
    
    def setStyleSheet(self, style: str):
        """Update button stylesheet."""
        self.button.setStyleSheet(style)
    
    def setText(self, text: str):
        """Set button text."""
        self.button.setText(text)


class CustomTitleBar(QWidget):
    """Custom title bar for frameless window with dark theme."""
    
    def __init__(self, parent, title: str):
        super().__init__(parent)
        self.parent_window = parent
        self.drag_position = None
        
        # Set fixed height and styling
        self.setFixedHeight(40)
        self.setStyleSheet("""
            CustomTitleBar {
                background-color: #1e1e1e;
                border-bottom: 1px solid #D94E1F;
            }
        """)
        
        # Enable mouse tracking and focus
        self.setMouseTracking(True)
        self.setFocusPolicy(Qt.StrongFocus)
        
        # Prevent children from blocking mouse events
        self.setAttribute(Qt.WA_TransparentForMouseEvents, False)
        
        # Ensure title bar stays on top
        self.raise_()
        
        # Layout
        from PySide6.QtWidgets import QHBoxLayout, QLabel, QPushButton
        layout = QHBoxLayout(self)
        layout.setContentsMargins(10, 0, 10, 0)
        layout.setSpacing(0)
        
        # Add left stretch for centering
        left_stretch = QWidget()
        left_stretch.setMouseTracking(True)
        left_stretch.setAttribute(Qt.WA_TransparentForMouseEvents)  # Let clicks through
        layout.addWidget(left_stretch, 1)  # Stretch factor of 1 to balance right side
        
        # Title label with Michroma font
        self.title_label = QLabel(title)
        self.title_label.setObjectName("titleLabel")  # For CSS selector
        self.title_label.setAlignment(Qt.AlignCenter)
        self.title_label.setMouseTracking(True)
        self.title_label.setAttribute(Qt.WA_TransparentForMouseEvents)  # Let clicks through
        
        # Load font and apply programmatically
        title_font = get_bronco_font(point_size=12, bold=True)
        if title_font:
            self.title_label.setFont(title_font)
            logger.debug(f"Font applied to title: {title_font.family()} at {title_font.pointSize()}pt")
            # ALSO set it via stylesheet to ensure it sticks
            font_name = title_font.family()
            self.title_label.setStyleSheet(f"QLabel {{ color: #e0e0e0; font-family: '{font_name}'; font-size: 12pt; font-weight: bold; }}")
        else:
            self.title_label.setStyleSheet("QLabel { color: #e0e0e0; font-size: 12pt; }")
        
        # Give title label minimum width to allow for centering
        self.title_label.setMinimumWidth(200)
        layout.addWidget(self.title_label, 0, Qt.AlignCenter)
        
        # Add stretch to push buttons to the right
        right_stretch = QWidget()
        right_stretch.setMouseTracking(True)
        right_stretch.setAttribute(Qt.WA_TransparentForMouseEvents)  # Let clicks through
        layout.addWidget(right_stretch, 1)  # Stretch factor of 1 to fill available space
        
        # Window control buttons - create a container to keep them grouped
        from PySide6.QtWidgets import QPushButton as QBuiltinPushButton
        button_container = QWidget()
        button_layout = QHBoxLayout(button_container)
        button_layout.setContentsMargins(0, 0, 0, 0)
        button_layout.setSpacing(0)  # No spacing between buttons
        
        button_style = """
            QPushButton {
                background-color: transparent;
                color: #e0e0e0;
                border: none;
                padding: 0px;
                margin: 0px;
                font-size: 16px;
                min-width: 40px;
                max-width: 40px;
                min-height: 40px;
                max-height: 40px;
            }
            QPushButton:hover {
                background-color: #2d2d2d;
            }
        """
        
        # Minimize button
        self.min_btn = QBuiltinPushButton("−")
        self.min_btn.setFixedSize(40, 40)
        self.min_btn.setStyleSheet(button_style)
        self.min_btn.clicked.connect(self.parent_window.showMinimized)
        button_layout.addWidget(self.min_btn)
        
        # Maximize/Restore button
        self.max_btn = QBuiltinPushButton("□")
        self.max_btn.setFixedSize(40, 40)
        self.max_btn.setStyleSheet(button_style)
        self.max_btn.clicked.connect(self.toggle_maximize)
        button_layout.addWidget(self.max_btn)
        
        # Close button
        self.close_btn = QBuiltinPushButton("✕")
        self.close_btn.setFixedSize(40, 40)
        close_style = button_style + """
            QPushButton:hover {
                background-color: #dc3545;
            }
        """
        self.close_btn.setStyleSheet(close_style)
        self.close_btn.clicked.connect(self.parent_window.close)
        button_layout.addWidget(self.close_btn)
        
        # Add button container to right edge of layout
        layout.addWidget(button_container)
        
        # Store button area width for drag detection
        self.button_area_width = 40 * 3  # 3 buttons, 40px each
    
    def toggle_maximize(self):
        """Toggle between maximized and normal window state."""
        if self.parent_window.isMaximized():
            self.parent_window.showNormal()
            self.max_btn.setText("□")
        else:
            self.parent_window.showMaximized()
            self.max_btn.setText("❐")
    
    def mousePressEvent(self, event):
        """Start dragging the window using system move (Wayland/X11 compatible)."""
        if event.button() == Qt.LeftButton:
            # Allow dragging from anywhere except the buttons (right ~130px)
            if event.position().x() < self.width() - 130:
                logger.debug(f"MousePress: Drag started at x={event.position().x()}")
                # Try platform-native system move first (works on Wayland and X11)
                if self.parent_window.windowHandle().startSystemMove():
                    logger.debug("MousePress: Using system move (platform-native)")
                    event.accept()
                    return
                else:
                    # Fallback to manual tracking if system move not available
                    logger.debug("MousePress: System move not available, using manual tracking")
                    self.drag_position = event.globalPosition().toPoint() - self.parent_window.frameGeometry().topLeft()
                    self.grabMouse()
                    event.accept()
                    return
            else:
                logger.debug(f"MousePress: Click on button area at x={event.position().x()}")
        super().mousePressEvent(event)
    
    def mouseMoveEvent(self, event):
        """Drag the window (only called if system move not available)."""
        if event.buttons() == Qt.LeftButton and self.drag_position is not None:
            new_pos = event.globalPosition().toPoint() - self.drag_position
            self.parent_window.move(new_pos)
            logger.debug(f"MouseMove: Manual drag to {new_pos}")
            event.accept()
            return
        super().mouseMoveEvent(event)
    
    def mouseReleaseEvent(self, event):
        """Stop dragging."""
        if event.button() == Qt.LeftButton:
            if self.drag_position is not None:
                self.drag_position = None
                logger.debug("MouseRelease: Drag stopped")
                self.releaseMouse()
            event.accept()
            return
        super().mouseReleaseEvent(event)
    
    def mouseDoubleClickEvent(self, event):
        """Double-click to maximize/restore."""
        if event.button() == Qt.LeftButton:
            # Only maximize on double-click if not over buttons
            if event.position().x() < self.width() - self.button_area_width:
                self.toggle_maximize()


class TalusQtMainWindow(QMainWindow if PYSIDE6_AVAILABLE else object):
    """Main window for the Qt-based Talus Tally desktop application."""
    
    def __init__(self, app_title: str = "Talus Tally", window_size: tuple = (1200, 800)):
        if not PYSIDE6_AVAILABLE:
            raise RuntimeError("PySide6 is not installed.")
        
        super().__init__()
        
        from backend.core.graph import ProjectGraph
        from backend.handlers.dispatcher import CommandDispatcher
        from backend.api.graph_service import GraphService
        
        # 1. Initialize Backend
        self.graph = ProjectGraph()
        self.dispatcher = CommandDispatcher(self.graph)
        self.service = GraphService(self.graph)
        
        # 2. Initialize Project Manager (API for project persistence)
        from backend.api.project_manager import ProjectManager
        self.project_manager = ProjectManager()
        self.project_manager.graph = self.graph
        
        # 3. Load default blueprint
        self.loader = SchemaLoader()
        default_template = os.path.join("data", "templates", "restomod.yaml")
        try:
            self.blueprint = self.loader.load(default_template)
            self.project_manager.add_template(default_template)
        except Exception as e:
            logger.error(f"Failed to load blueprint: {e}")
            self.blueprint = None
        
        # Create model with blueprint for status indicator resolution
        self.model = GraphModel(self.graph, blueprint=self.blueprint)

        # 3. Configure Window
        self.setWindowTitle(app_title)
        self.resize(*window_size)
        
        # Make window frameless for custom title bar
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.Window)
        
        # Add custom title bar (as direct child, positioned absolutely)
        self.title_bar = CustomTitleBar(self, app_title)
        
        # Don't use setContentsMargins - instead, manage all content positioning manually
        # Setup the rest of the window using standard QMainWindow features
        self._setup_menu()      # <--- Menu bar (will be at y=40)
        self._setup_toolbar()   # <--- Toolbar
        self._setup_central_widget()
        self._setup_dock_widgets()
        
        # Now that menu bar and toolbar are created, we need to offset them
        # to account for the title bar. We do this by adjusting the layout.
        self.setContentsMargins(0, 40, 0, 0)
        
        logger.info("Qt main window initialized successfully")
    
    def resizeEvent(self, event):
        """Handle window resize to reposition title bar."""
        super().resizeEvent(event)
        # Position title bar at the very top, spanning full width, and keep it on top layer
        if hasattr(self, 'title_bar'):
            self.title_bar.setGeometry(0, 0, self.width(), 40)
            self.title_bar.raise_()  # Ensure it's on top
            self.title_bar.show()
    
    def showEvent(self, event):
        """Ensure title bar is visible when window is shown."""
        super().showEvent(event)
        if hasattr(self, 'title_bar'):
            self.title_bar.show()
            self.title_bar.raise_()
            self.title_bar.setGeometry(0, 0, self.width(), 40)
            logger.debug(f"Title bar shown at geometry: {self.title_bar.geometry()}")
    
    def moveEvent(self, event):
        """Reposition title bar when window moves."""
        super().moveEvent(event)
        if hasattr(self, 'title_bar'):
            self.title_bar.raise_()
    
    def _set_dark_titlebar(self):
        """Set dark title bar hint for Ubuntu/GNOME (Wayland and X11)."""
        # Not needed anymore - using frameless window with custom title bar
        pass
    
    def _setup_menu(self):
        """Setup menu bar with File and Edit menus."""
        menu_bar = self.menuBar()
        menu_font = get_bronco_font(point_size=10, bold=False)
        if menu_font:
            menu_bar.setFont(menu_font)
        
        # File Menu
        file_menu = menu_bar.addMenu("File")
        
        new_action = QAction(self._get_icon("document-plus.svg"), "New Project...", self)
        new_action.triggered.connect(self.new_project)
        file_menu.addAction(new_action)
        
        open_action = QAction(self._get_icon("folder-open.svg"), "Open Project...", self)
        open_action.triggered.connect(self.open_project)
        file_menu.addAction(open_action)
        
        save_action = QAction(self._get_icon("arrow-down-tray.svg"), "Save Project...", self)
        save_action.triggered.connect(self.save_project)
        file_menu.addAction(save_action)
        
        file_menu.addSeparator()
        
        export_action = QAction(self._get_icon("document-chart-bar.svg"), "Export Report...", self)
        export_action.triggered.connect(self.export_report)
        file_menu.addAction(export_action)
        
        file_menu.addSeparator()
        file_menu.addAction("Exit", self.close)
        
        # Edit Menu
        edit_menu = menu_bar.addMenu("Edit")
        
        undo_action = QAction(self._get_icon("arrow-uturn-left.svg"), "Undo", self)
        undo_action.triggered.connect(self.undo)
        edit_menu.addAction(undo_action)
        
        redo_action = QAction(self._get_icon("arrow-uturn-right.svg"), "Redo", self)
        redo_action.triggered.connect(self.redo)
        edit_menu.addAction(redo_action)
    
    def _setup_toolbar(self):
        """Setup toolbar with icon buttons."""
        toolbar = QToolBar("Main Toolbar")
        toolbar.setIconSize(QSize(24, 24))
        toolbar_font = get_bronco_font(point_size=9, bold=False)
        if toolbar_font:
            toolbar.setFont(toolbar_font)
        self.addToolBar(toolbar)
        
        # New
        new_act = QAction(self._get_icon("document-plus.svg"), "New Project", self)
        new_act.triggered.connect(self.new_project)
        toolbar.addAction(new_act)
        
        # Open
        open_act = QAction(self._get_icon("folder-open.svg"), "Open", self)
        open_act.triggered.connect(self.open_project)
        toolbar.addAction(open_act)
        
        # Save
        save_act = QAction(self._get_icon("arrow-down-tray.svg"), "Save", self)
        save_act.triggered.connect(self.save_project)
        toolbar.addAction(save_act)

        toolbar.addSeparator()
        
        # Undo
        undo_act = QAction(self._get_icon("arrow-uturn-left.svg"), "Undo", self)
        undo_act.triggered.connect(self.undo)
        toolbar.addAction(undo_act)
        
        # Redo
        redo_act = QAction(self._get_icon("arrow-uturn-right.svg"), "Redo", self)
        redo_act.triggered.connect(self.redo)
        toolbar.addAction(redo_act)

        toolbar.addSeparator()

        # Export
        report_act = QAction(self._get_icon("document-chart-bar.svg"), "Export Report", self)
        report_act.triggered.connect(self.export_report)
        toolbar.addAction(report_act)

    def _set_dark_titlebar(self):
        """Set dark title bar hint for Ubuntu/GNOME (Wayland and X11)."""
        # Not needed anymore - using frameless window with custom title bar
        pass

    def _setup_central_widget(self):
        """Setup the central widget (project tree view)."""
        # Create tree view as central widget
        self.tree_view = QTreeView()
        self.tree_view.setModel(self.model)
        
        # Set delegate to support HTML rendering for bullet sizing
        from backend.ui.qt.tree_model import HtmlDelegate
        self.tree_view.setItemDelegate(HtmlDelegate())
        
        self.tree_view.setHeaderHidden(True)
        self.tree_view.expandAll()
        
        # Enable Right-Click Context Menu
        self.tree_view.setContextMenuPolicy(Qt.CustomContextMenu)
        self.tree_view.customContextMenuRequested.connect(self._show_context_menu)
        
        # Connect Selection
        self.tree_view.selectionModel().currentChanged.connect(self.on_selection_changed)
        
        self.setCentralWidget(self.tree_view)
    
    def _setup_dock_widgets(self):
        """Setup right dock widget for Properties."""
        # Get fresh font copy for dock title
        right_dock_font = get_bronco_font(point_size=10, bold=False)
        
        # --- Right Dock: Properties ---
        right_dock = QDockWidget("Properties", self)
        if right_dock_font:
            right_dock.setFont(right_dock_font)
            # Also apply to title bar explicitly
            title_bar = right_dock.titleBarWidget()
            if title_bar:
                title_bar.setFont(right_dock_font)
        right_dock.setAllowedAreas(Qt.LeftDockWidgetArea | Qt.RightDockWidgetArea)
        
        # Create widget with minimal margins
        right_widget = QWidget()
        right_layout = QVBoxLayout(right_widget)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(0)
        
        self.inspector = InspectorWidget()
        # Pass the blueprint so Inspector knows what fields a "Part" has
        if self.blueprint:
            self.inspector.set_blueprint(self.blueprint)
            
        # Wire Inspector changes to the Undo System
        self.inspector.property_changed.connect(self.handle_property_change)
        
        # Subscribe to GraphService for property change notifications
        if self.service:
            self.service.subscribe_to_property_changes(self._on_property_changed)
        
        right_layout.addWidget(self.inspector)
        right_dock.setWidget(right_widget)
        self.addDockWidget(Qt.RightDockWidgetArea, right_dock)

    def _get_icon(self, icon_name: str) -> QIcon:
        """Load an SVG icon from the assets/icons folder and make it white."""
        icon_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
            "assets", "icons", icon_name
        )
        if os.path.exists(icon_path):
            # Read the SVG and replace stroke/fill colors with white for dark theme
            with open(icon_path, 'r') as f:
                svg_content = f.read()
            
            # Replace stroke attribute colors (any hex color or named color)
            svg_content = re.sub(r'stroke="[^"]*"', 'stroke="#e0e0e0"', svg_content)
            
            # Replace fill attribute colors (except "none")
            svg_content = re.sub(r'fill="(?!none)[^"]*"', 'fill="#e0e0e0"', svg_content)
            
            # Write to a temporary in-memory buffer and load as SVG
            from PySide6.QtCore import QByteArray
            svg_bytes = QByteArray(svg_content.encode('utf-8'))
            
            # Create icon from the modified SVG data
            pixmap = QPixmap()
            pixmap.loadFromData(svg_bytes, 'SVG')
            return QIcon(pixmap)
        return QIcon()  # Return empty icon if not found

    def _show_context_menu(self, position: QPoint):
        """Build a smart menu based on the Blueprint rules."""
        index = self.tree_view.indexAt(position)
        menu = QMenu()
        
        if not index.isValid():
            # Empty space: Use wizard to add root to current graph
            menu.addAction("New Project Root...", self.add_project_root)
        else:
            # Existing Node: Check Blueprint for allowed children
            parent_node = index.internalPointer()
            
            if self.blueprint:
                # Find the definition (e.g., "task" definition)
                parent_def = self.blueprint._node_type_map.get(parent_node.blueprint_type_id)
                
                if parent_def and parent_def.allowed_children:
                    add_menu = menu.addMenu("Add...")
                    for child_type in parent_def.allowed_children:
                        # e.g., "part" -> "Part"
                        label = child_type.replace("_", " ").title()
                        
                        # Create specific action
                        action = add_menu.addAction(f"Add {label}")
                        # Capture the specific type string
                        action.triggered.connect(lambda checked=False, t=child_type: self.add_child_node(index, t))
                else:
                    menu.addAction("No allowed children").setEnabled(False)
            else:
                # Fallback if no blueprint loaded
                menu.addAction("Add Child Node", lambda: self.add_child_node(index, "task"))

            menu.addSeparator()
            menu.addAction("Delete Node", lambda: self.delete_node(index))
            
        menu.exec(self.tree_view.viewport().mapToGlobal(position))

    def add_child_node(self, parent_index, node_type_id):
        """Add a node of the SPECIFIC type selected (e.g., 'part')."""
        type_label = node_type_id.replace("_", " ").title()
        
        name, ok = QInputDialog.getText(self, f"Add {type_label}", f"{type_label} Name:")
        if not ok or not name: return
            
        # 1. Create Node with correct type (Command handles default property initialization)
        create_cmd = CreateNodeCommand(
            blueprint_type_id=node_type_id,
            name=name,
            graph=self.graph,
            blueprint=self.blueprint
        )
        new_id = self.dispatcher.execute(create_cmd)
        
        # 2. Link to Parent
        if parent_index.isValid():
            parent_node = parent_index.internalPointer()
            link_cmd = LinkNodeCommand(parent_id=parent_node.id, child_id=new_id, graph=self.graph)
            self.dispatcher.execute(link_cmd)
        
        self._refresh_view()

    def handle_property_change(self, node_id, field_id, new_value):
        """Execute Undo-able command when Inspector changes."""
        print(f"DEBUG handle_property_change: node_id={node_id}, field_id={field_id}, new_value={new_value}")
        node = self.graph.get_node(node_id)
        if not node:
            print(f"DEBUG: Node not found!")
            return
        
        old_value = node.properties.get(field_id) if hasattr(node, 'properties') else None
        print(f"DEBUG: Creating UpdatePropertyCommand with old_value={old_value}")
        cmd = UpdatePropertyCommand(node_id, field_id, old_value, new_value, self.graph, self.service)
        print(f"DEBUG: Executing command via dispatcher")
        self.dispatcher.execute(cmd)
    
    def _on_property_changed(self, node_id, property_id, new_value):
        """Callback from GraphService when a property changes."""
        print(f"DEBUG: _on_property_changed called with node_id={node_id}, property_id={property_id}, new_value={new_value}")
        # Refresh the tree display for the changed node
        self._refresh_tree_node_display(node_id)
    
    def _refresh_tree_node_display(self, node_id):
        """Emit dataChanged signal to refresh tree view for a specific node."""
        print(f"DEBUG: _refresh_tree_node_display called with node_id={node_id}, type={type(node_id)}")
        index = self.model.get_index_from_node_id(node_id)
        print(f"DEBUG: Got index {index}, isValid={index.isValid()}")
        if index.isValid():
            print(f"DEBUG: Emitting dataChanged for index with all roles")
            # Emit with all roles that could affect the display
            from PySide6.QtCore import Qt
            self.model.dataChanged.emit(index, index, [Qt.DisplayRole, Qt.EditRole, Qt.ForegroundRole])

    def export_report(self):
        if QFileDialog is None: return
        file_path, _ = QFileDialog.getSaveFileName(self, "Export Report", "report.html", "HTML Files (*.html)")
        if not file_path: return
        
        # Basic Template
        nodes = list(self.graph.nodes.values())
        # Sum costs safely
        total_cost = 0.0
        for n in nodes:
            try:
                val = float(str(n.properties.get('cost', 0)).replace('$','').replace(',',''))
                total_cost += val
            except (ValueError, TypeError):
                pass
        
        template_str = """
        <html>
        <head><style>body{font-family:sans-serif;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ddd;padding:8px;}</style></head>
        <body>
            <h1>Project Report</h1>
            <h3>Total Nodes: {{ nodes|length }} | Total Cost: ${{ total_cost }}</h3>
            <table>
                <tr><th>Name</th><th>Type</th><th>Status</th><th>Cost</th></tr>
                {% for node in nodes %}
                <tr>
                    <td>{{ node.name }}</td>
                    <td>{{ node.blueprint_type_id }}</td>
                    <td>{{ node.properties.status }}</td>
                    <td>{{ node.properties.cost }}</td>
                </tr>
                {% endfor %}
            </table>
        </body></html>
        """
        
        engine = ReportEngine()
        try:
            html = engine.render_string(template_str, {"nodes": nodes, "total_cost": f"{total_cost:,.2f}"})
            with open(file_path, 'w') as f:
                f.write(html)
            QMessageBox.information(self, "Success", "Report exported successfully.")
        except Exception as e:
            QMessageBox.critical(self, "Error", str(e))

    # --- Standard Methods ---
    def delete_node(self, index):
        if not index.isValid(): return
        node = index.internalPointer()
        if QMessageBox.question(self, "Confirm", f"Delete '{node.name}'?", QMessageBox.Yes|QMessageBox.No) == QMessageBox.Yes:
            self.dispatcher.execute(DeleteNodeCommand(node_id=node.id, graph=self.graph))
            self._refresh_view()

    def undo(self):
        self.dispatcher.undo()
        self._refresh_view()
        # Refresh inspector if current node was modified
        current = self.tree_view.currentIndex()
        if current.isValid():
            self.on_selection_changed(current, None)

    def redo(self):
        self.dispatcher.redo()
        self._refresh_view()
        current = self.tree_view.currentIndex()
        if current.isValid():
            self.on_selection_changed(current, None)

    def _refresh_view(self):
        """Refresh the tree view after graph changes."""
        self.model = GraphModel(self.graph, blueprint=self.blueprint)
        self.tree_view.setModel(self.model)
        self.tree_view.selectionModel().currentChanged.connect(self.on_selection_changed)
        self.tree_view.expandAll()

    def on_selection_changed(self, current, previous):
        if not current.isValid():
            self.inspector.set_node(None)
            return
        self.inspector.set_node(current.internalPointer())

    def new_project(self):
        """Create a new project file (replaces current graph)."""
        if ProjectWizardDialog is None: return
        wizard = ProjectWizardDialog(self)
        if wizard.exec() == 1:
            template_path, project_name = wizard.get_result()
            if not project_name:
                return
            
            # Reset the graph and templates for new project
            self.graph = ProjectGraph()
            self.dispatcher = CommandDispatcher(self.graph)
            self.service = GraphService(self.graph)
            self.project_manager = ProjectManager()
            self.project_manager.graph = self.graph
            
            # Load template if provided
            if template_path:
                self.project_manager.add_template(template_path)
                try:
                    self.blueprint = self.loader.load(template_path)
                except Exception as e:
                    logger.error(f"Failed to load template {template_path}: {e}")
                    self.blueprint = None
            else:
                self.blueprint = None
            
            # Create root node via command (through dispatcher for undo/redo)
            create_cmd = CreateNodeCommand(
                blueprint_type_id="project_root",
                name=project_name,
                graph=self.graph,
                blueprint=self.blueprint
            )
            self.dispatcher.execute(create_cmd)
            
            # Refresh the view
            self._refresh_view()

    def add_project_root(self):
        """Add a new project root to the current graph using the template wizard."""
        if ProjectWizardDialog is None: return
        wizard = ProjectWizardDialog(self)
        if wizard.exec() == 1:
            template_path, project_name = wizard.get_result()
            
            if not project_name:
                return
            
            # Track which template was used (via ProjectManager API)
            if template_path:
                self.project_manager.add_template(template_path)
                # Load blueprint if not already loaded
                try:
                    if self.blueprint is None:
                        self.blueprint = self.loader.load(template_path)
                except Exception as e:
                    logger.error(f"Failed to load template {template_path}: {e}")
            
            # Create root node via command (use "project_root" type)
            create_cmd = CreateNodeCommand(
                blueprint_type_id="project_root",
                name=project_name,
                graph=self.graph,
                blueprint=self.blueprint
            )
            self.dispatcher.execute(create_cmd)
            
            # Refresh the tree view
            self._refresh_view()

    def open_project(self):
        if QFileDialog is None: return
        file_path, _ = QFileDialog.getOpenFileName(self, "Open Project", "", "JSON Files (*.json)")
        if file_path:
            try:
                # Use ProjectManager API to load project
                graph, template_paths = self.project_manager.load_project(file_path)
                
                # Load all blueprints for the project
                for template_path in template_paths:
                    try:
                        self.blueprint = self.project_manager.load_blueprint(template_path)
                        break  # Use first blueprint as primary
                    except Exception as e:
                        logger.warning(f"Failed to load template {template_path}: {e}")
                
                # Update graph and wire services
                self.graph = graph
                self.project_manager.graph = graph
                self.dispatcher = CommandDispatcher(graph)
                self.service = GraphService(graph)
                self.service.subscribe_to_property_changes(self._on_property_changed)
                
                # Refresh the view
                self._refresh_view()
            except Exception as e:
                logger.error(f"Failed to open project: {e}")

    def save_project(self):
        if QFileDialog is None: return
        file_path, _ = QFileDialog.getSaveFileName(self, "Save Project", "", "JSON Files (*.json)")
        if file_path:
            try:
                # Use ProjectManager API to save project
                self.project_manager.save_project(file_path, self.graph)
            except Exception as e:
                logger.error(f"Failed to save project: {e}")

    def _update_graph(self, new_graph):
        if not new_graph: return
        self.graph = new_graph
        self.dispatcher.graph = new_graph
        self.service.graph = new_graph
        self.model = GraphModel(self.graph, blueprint=self.blueprint)
        self.tree_view.setModel(self.model)
        self.tree_view.expandAll()
        self.tree_view.selectionModel().currentChanged.connect(self.on_selection_changed)

def create_qt_app(app_title: str = "Talus Tally") -> Optional[QApplication]:
    """Create and configure a Qt application.
    
    Args:
        app_title: Title for the application
        
    Returns:
        QApplication instance or None if PySide6 is not available
    """
    if not PYSIDE6_AVAILABLE: return None
    app = QApplication.instance()
    if app is None: app = QApplication(sys.argv)
    return app

def run_qt_app(app_title: str = "Talus Tally", window_size: tuple = (1200, 800)) -> int:
    """Run the Qt-based Talus Tally application.
    
    Args:
        app_title: Title for the window
        window_size: Tuple of (width, height) for the window
        
    Returns:
        Application exit code
    """
    if not PYSIDE6_AVAILABLE: return 1
    try:
        # Set environment variable for Qt to use dark decorations (Wayland/GNOME)
        os.environ['QT_QPA_PLATFORMTHEME'] = 'gtk3'
        os.environ['GTK_THEME'] = 'Adwaita:dark'
        
        qt_app = create_qt_app(app_title)
        if qt_app is None: return 1
        
        # Apply Bronco II Restomod theme
        qt_app.setStyle("Fusion")  # Critical for dark themes
        qt_app.setStyleSheet(get_bronco_stylesheet())
        
        # Set application-wide palette for dark title bars (platform hint)
        from PySide6.QtGui import QPalette, QColor
        palette = qt_app.palette()
        palette.setColor(QPalette.Window, QColor("#1e1e1e"))
        palette.setColor(QPalette.WindowText, QColor("#e0e0e0"))
        palette.setColor(QPalette.Base, QColor("#121212"))
        palette.setColor(QPalette.AlternateBase, QColor("#1e1e1e"))
        palette.setColor(QPalette.Text, QColor("#e0e0e0"))
        palette.setColor(QPalette.Button, QColor("#1e1e1e"))
        palette.setColor(QPalette.ButtonText, QColor("#e0e0e0"))
        qt_app.setPalette(palette)
        
        main_window = TalusQtMainWindow(app_title, window_size)
        main_window.show()
        
        return qt_app.exec()
    except Exception as e:
        logger.exception(f"Qt application failed: {e}")
        return 1

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    sys.exit(run_qt_app())