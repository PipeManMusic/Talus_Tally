from backend.core.budget_engine import BudgetEngine
from backend.core.node import Node


def _node(node_type: str, name: str, estimated=0, actual=0):
    n = Node(blueprint_type_id=node_type, name=name)
    n.properties["estimated_cost"] = estimated
    n.properties["actual_cost"] = actual
    return n


def test_rollup_calculates_estimated_actual_and_variance():
    root = _node("project", "Root", estimated=100, actual=120)
    child_a = _node("task", "Child A", estimated=40, actual=30)
    child_b = _node("task", "Child B", estimated=10, actual=25)

    root.children = [child_a.id, child_b.id]
    child_a.parent_id = root.id
    child_b.parent_id = root.id

    graph_nodes = {
        root.id: root,
        child_a.id: child_a,
        child_b.id: child_b,
    }

    engine = BudgetEngine(graph_nodes)
    trees = engine.calculate()

    assert len(trees) == 1
    tree = trees[0]

    assert tree.estimated_cost == 100.0
    assert tree.actual_cost == 120.0
    assert tree.total_estimated == 150.0
    assert tree.total_actual == 175.0
    assert tree.variance == 25.0


def test_defaults_missing_costs_to_zero():
    root = Node(blueprint_type_id="project", name="Root")
    child = Node(blueprint_type_id="task", name="Child")

    root.children = [child.id]
    child.parent_id = root.id

    graph_nodes = {
        root.id: root,
        child.id: child,
    }

    engine = BudgetEngine(graph_nodes)
    trees = engine.calculate()

    assert len(trees) == 1
    tree = trees[0]

    assert tree.estimated_cost == 0.0
    assert tree.actual_cost == 0.0
    assert tree.total_estimated == 0.0
    assert tree.total_actual == 0.0
    assert tree.variance == 0.0


def test_flat_output_contains_new_fields():
    root = _node("project", "Root", estimated=10, actual=15)
    graph_nodes = {root.id: root}

    engine = BudgetEngine(graph_nodes)
    flat = engine.calculate_flat()

    assert len(flat) == 1
    row = flat[0]
    assert row["estimated_cost"] == 10.0
    assert row["actual_cost"] == 15.0
    assert row["total_estimated"] == 10.0
    assert row["total_actual"] == 15.0
    assert row["variance"] == 5.0


def test_grand_total_is_sum_of_total_estimated():
    root_a = _node("project", "A", estimated=20, actual=50)
    root_b = _node("project", "B", estimated=30, actual=10)

    graph_nodes = {
        root_a.id: root_a,
        root_b.id: root_b,
    }

    engine = BudgetEngine(graph_nodes)
    assert engine.grand_total() == 50.0
