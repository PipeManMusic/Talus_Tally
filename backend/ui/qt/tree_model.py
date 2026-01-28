"""Qt tree model for displaying ProjectGraph in a QTreeView.

This module provides a QAbstractItemModel implementation that wraps
the ProjectGraph to display nodes in a Qt tree widget.
"""
from typing import Any, Optional
from PySide6.QtCore import QAbstractItemModel, QModelIndex, Qt, QSize
from PySide6.QtGui import QFont
from PySide6.QtWidgets import QApplication, QStyle, QStyledItemDelegate
from PySide6.QtGui import QTextDocument
from backend.core.graph import ProjectGraph
from backend.core.node import Node
from backend.ui.viewmodels.renderer import TreeViewModel
from backend.infra.schema_loader import SchemaLoader


class HtmlDelegate(QStyledItemDelegate):
    """Delegate for rendering HTML content with SVG support in tree view items."""
    
    def paint(self, painter, option, index):
        """Paint the item with HTML/SVG support."""
        from PySide6.QtSvg import QSvgRenderer
        from PySide6.QtCore import QByteArray, QRectF
        import re
        
        # Get the HTML text from the model
        html_text = index.model().data(index, Qt.DisplayRole)
        
        if not html_text:
            super().paint(painter, option, index)
            return
        
        # Check for SVG content
        svg_match = re.search(r'<svg[^>]*>.*?</svg>', html_text, re.DOTALL)
        
        if svg_match:
            # Extract SVG and remaining text
            svg_markup = svg_match.group(0)
            # Get text after the </span> that wraps the SVG
            text_match = re.search(r'</span>\s*(.+)', html_text)
            text_content = text_match.group(1) if text_match else ""
            
            painter.save()
            
            # Draw background if selected
            if option.state & QStyle.State_Selected:
                painter.fillRect(option.rect, option.palette.highlight())
                painter.setPen(option.palette.highlightedText().color())
            else:
                painter.setPen(option.palette.text().color())
            
            # Render SVG icon
            svg_renderer = QSvgRenderer(QByteArray(svg_markup.encode('utf-8')))
            icon_size = 16  # Icon size in pixels
            icon_rect = QRectF(option.rect.left() + 2, option.rect.top() + (option.rect.height() - icon_size) / 2, icon_size, icon_size)
            svg_renderer.render(painter, icon_rect)
            
            # Render text after icon
            if text_content:
                text_rect = option.rect.adjusted(icon_size + 6, 0, 0, 0)
                
                # Parse and render styled text
                doc = QTextDocument()
                doc.setHtml(text_content)
                doc.setDefaultFont(option.font)
                
                painter.translate(text_rect.left(), text_rect.top())
                doc.drawContents(painter)
            
            painter.restore()
        elif '<' in html_text:
            # HTML without SVG - use QTextDocument
            doc = QTextDocument()
            doc.setHtml(html_text)
            doc.setDefaultFont(option.font)
            
            painter.save()
            if option.state & QStyle.State_Selected:
                painter.fillRect(option.rect, option.palette.highlight())
            
            painter.translate(option.rect.left(), option.rect.top())
            doc.drawContents(painter)
            painter.restore()
        else:
            # Plain text - use default rendering
            super().paint(painter, option, index)
    
    def sizeHint(self, option, index):
        """Calculate size needed to display HTML."""
        html_text = index.model().data(index, Qt.DisplayRole)
        
        if html_text and '<' in html_text:
            doc = QTextDocument()
            doc.setHtml(html_text)
            return QSize(doc.idealWidth(), doc.size().height())
        else:
            return super().sizeHint(option, index)


class GraphModel(QAbstractItemModel):
    """Qt model for displaying a ProjectGraph in a tree view."""
    
    def __init__(self, graph: ProjectGraph, parent=None, blueprint=None):
        """
        Initialize the model with a graph.
        
        Args:
            graph: The ProjectGraph to display
            parent: Optional parent QObject
            blueprint: Optional blueprint object for resolving node type definitions
        """
        super().__init__(parent)
        self.graph = graph
        self.blueprint = blueprint
        self._root_nodes = graph.get_orphans()
        
        # Create schema loader and pass its indicator catalog to renderer
        schema_loader = SchemaLoader()
        self.renderer = TreeViewModel(indicator_catalog=schema_loader.indicator_catalog)
    
    def index(self, row: int, column: int, parent: QModelIndex = QModelIndex()) -> QModelIndex:
        """
        Create an index for a given row, column, and parent.
        
        Args:
            row: The row number
            column: The column number
            parent: The parent index
            
        Returns:
            A QModelIndex for the specified location
        """
        if not self.hasIndex(row, column, parent):
            return QModelIndex()
        
        if not parent.isValid():
            # Root level - get from orphans
            if row < len(self._root_nodes):
                return self.createIndex(row, column, self._root_nodes[row])
            return QModelIndex()
        
        # Child level - get from parent's children
        parent_node = parent.internalPointer()
        if parent_node and row < len(parent_node.children):
            child_id = parent_node.children[row]
            child_node = self.graph.get_node(child_id)
            if child_node:
                return self.createIndex(row, column, child_node)
        
        return QModelIndex()
    
    def parent(self, index: QModelIndex) -> QModelIndex:
        """
        Get the parent index of a given index.
        
        Args:
            index: The child index
            
        Returns:
            The parent QModelIndex
        """
        if not index.isValid():
            return QModelIndex()
        
        node = index.internalPointer()
        if not node or not node.parent_id:
            return QModelIndex()
        
        parent_node = self.graph.get_node(node.parent_id)
        if not parent_node:
            return QModelIndex()
        
        # Find the row of the parent node
        if parent_node.parent_id is None:
            # Parent is a root node
            row = self._root_nodes.index(parent_node) if parent_node in self._root_nodes else 0
        else:
            # Parent has a grandparent
            grandparent = self.graph.get_node(parent_node.parent_id)
            if grandparent:
                row = grandparent.children.index(parent_node.id) if parent_node.id in grandparent.children else 0
            else:
                row = 0
        
        return self.createIndex(row, 0, parent_node)
    
    def rowCount(self, parent: QModelIndex = QModelIndex()) -> int:
        """
        Get the number of rows (children) under a parent.
        
        Args:
            parent: The parent index
            
        Returns:
            Number of child rows
        """
        if parent.column() > 0:
            return 0
        
        if not parent.isValid():
            # Root level
            return len(self._root_nodes)
        
        node = parent.internalPointer()
        if node:
            return len(node.children)
        
        return 0
    
    def columnCount(self, parent: QModelIndex = QModelIndex()) -> int:
        """
        Get the number of columns.
        
        Args:
            parent: The parent index
            
        Returns:
            Number of columns (always 1 for simple tree)
        """
        return 1
    
    def data(self, index: QModelIndex, role: int = Qt.DisplayRole) -> Any:
        """
        Get data for a given index and role.
        
        Args:
            index: The model index
            role: The data role (DisplayRole, EditRole, etc.)
            
        Returns:
            The data for the given role
        """
        if not index.isValid():
            return None
        
        node = index.internalPointer()
        if not node:
            return None
        
        if role == Qt.DisplayRole:
            # Get blueprint definition for this node type
            blueprint_def = None
            if self.blueprint and hasattr(self.blueprint, '_node_type_map'):
                blueprint_def = self.blueprint._node_type_map.get(node.blueprint_type_id)
            
            # Use renderer to get display name with status bullet indicator
            display_name = self.renderer.get_display_name(node, blueprint_def)
            print(f"DEBUG TreeModel.data(DisplayRole): node_id={node.id}, display_name={display_name}, status={node.properties.get('status')}")
            return display_name
        
        elif role == Qt.EditRole:
            return node.name
        
        elif role == Qt.ForegroundRole:
            # Ensure text is always visible with foreground color
            from PySide6.QtGui import QColor
            return QColor("#e0e0e0")  # Off-white text
        
        elif role == Qt.FontRole:
            # Use system font for all nodes
            return None
        
        elif role == Qt.DecorationRole:
            # Return None - let bullet points in display text be the only indicator
            return None
        
        return None
    
    def headerData(self, section: int, orientation: Qt.Orientation, role: int = Qt.DisplayRole) -> Any:
        """
        Get header data.
        
        Args:
            section: The section number
            orientation: Horizontal or Vertical
            role: The data role
            
        Returns:
            Header data
        """
        if orientation == Qt.Horizontal and role == Qt.DisplayRole:
            return "Name"
        return None
    
    def get_index_from_node_id(self, node_id: str) -> QModelIndex:
        """
        Find the QModelIndex for a node with the given ID.
        
        Args:
            node_id: The node ID to find (can be string or UUID)
            
        Returns:
            QModelIndex for the node, or invalid index if not found
        """
        # Convert string ID to UUID if needed
        from uuid import UUID
        if isinstance(node_id, str):
            try:
                node_id = UUID(node_id)
            except (ValueError, TypeError):
                return QModelIndex()
        
        node = self.graph.get_node(node_id)
        if not node:
            return QModelIndex()
        
        # If this is a root node, search in root nodes
        for row, root_node in enumerate(self._root_nodes):
            if root_node.id == node_id:
                return self.createIndex(row, 0, root_node)
        
        # Otherwise, search through all nodes via parent-child traversal
        return self._find_index_recursive(node_id, QModelIndex())
    
    def _find_index_recursive(self, node_id: str, parent_index: QModelIndex) -> QModelIndex:
        """Recursively search for a node index by traversing the tree."""
        row_count = self.rowCount(parent_index)
        
        for row in range(row_count):
            index = self.index(row, 0, parent_index)
            node = index.internalPointer()
            
            if node and node.id == node_id:
                return index
            
            # Recurse into children
            result = self._find_index_recursive(node_id, index)
            if result.isValid():
                return result
        
        return QModelIndex()
