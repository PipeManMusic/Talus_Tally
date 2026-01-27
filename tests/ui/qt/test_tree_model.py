import pytest
try:
    from PySide6.QtCore import QModelIndex, Qt
    from backend.ui.qt.tree_model import GraphModel
except ImportError:
    pytest.skip("PySide6 not installed", allow_module_level=True)

from backend.core.graph import ProjectGraph
from backend.core.node import Node

@pytest.fixture
def populated_graph():
    """Create a graph with 3 generations: Root -> Job -> Task."""
    graph = ProjectGraph()
    root = Node(blueprint_type_id="project_root", name="My Project")
    job = Node(blueprint_type_id="job", name="Engine Job")
    task = Node(blueprint_type_id="task", name="Buy Parts")
    
    # Link them
    root.children.append(job.id)
    job.parent_id = root.id
    
    job.children.append(task.id)
    task.parent_id = job.id
    
    graph.add_node(root)
    graph.add_node(job)
    graph.add_node(task)
    return graph

def test_model_row_count(populated_graph):
    """Verify the model reports the correct number of children."""
    model = GraphModel(populated_graph)
    
    # 1. Root level should have 1 item ("My Project")
    root_index = QModelIndex() # Invalid index = Top Level
    assert model.rowCount(root_index) == 1
    
    # 2. "My Project" should have 1 child ("Engine Job")
    project_idx = model.index(0, 0, root_index)
    assert model.rowCount(project_idx) == 1
    
    # 3. "Engine Job" should have 1 child ("Buy Parts")
    job_idx = model.index(0, 0, project_idx)
    assert model.rowCount(job_idx) == 1
    
    # 4. "Buy Parts" should have 0 children
    task_idx = model.index(0, 0, job_idx)
    assert model.rowCount(task_idx) == 0

def test_model_data_display(populated_graph):
    """Verify the model returns the correct text for the UI."""
    model = GraphModel(populated_graph)
    
    # Get index for the first item
    index = model.index(0, 0, QModelIndex())
    
    # Ask for the "DisplayRole" (Text to show)
    display_text = model.data(index, Qt.DisplayRole)
    
    assert display_text == "My Project"

def test_model_parent_navigation(populated_graph):
    """Verify we can navigate backwards from Child to Parent."""
    model = GraphModel(populated_graph)
    
    # Traverse Down: Root -> Job
    root_idx = model.index(0, 0, QModelIndex())
    job_idx = model.index(0, 0, root_idx)
    
    # Traverse Up: Job -> Parent
    parent_idx = model.parent(job_idx)
    
    assert parent_idx == root_idx
    assert parent_idx.isValid()