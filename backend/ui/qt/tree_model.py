"""Qt tree model for displaying ProjectGraph in a QTreeView.

This module provides a QAbstractItemModel implementation that wraps
the ProjectGraph to display nodes in a Qt tree widget.
"""
from typing import Any, Optional
from PySide6.QtCore import QAbstractItemModel, QModelIndex, Qt
from backend.core.graph import ProjectGraph
from backend.core.node import Node


class GraphModel(QAbstractItemModel):
    """Qt model for displaying a ProjectGraph in a tree view."""
    
    def __init__(self, graph: ProjectGraph, parent=None):
        """
        Initialize the model with a graph.
        
        Args:
            graph: The ProjectGraph to display
            parent: Optional parent QObject
        """
        super().__init__(parent)
        self.graph = graph
        self._root_nodes = graph.get_orphans()
    
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
        
        if role == Qt.DisplayRole or role == Qt.EditRole:
            return node.name
        
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
