import pytest
from backend.models import Task
from backend.engine import PriorityEngine

def test_v11_software_task_logic():
    """Verify that software/admin tasks get a predictable score."""
    engine = PriorityEngine()
    t_soft = Task(id="S1", text="Write Code", estimated_cost=0.0)
    
    score = engine.calculate_task_score(5, 5, t_soft)
    assert score == 500.0

def test_v11_actual_cost_field():
    """Verify actual_cost is present but doesn't affect velocity sorting."""
    engine = PriorityEngine()
    t1 = Task(id="T1", text="Buy Pump", estimated_cost=100.0, actual_cost=120.0, importance=10)
    t2 = Task(id="T2", text="Buy Pump", estimated_cost=100.0, actual_cost=80.0, importance=10)
    
    # Scores should be identical because sorting is based on ESTIMATES
    assert engine.calculate_task_score(5, 5, t1) == engine.calculate_task_score(5, 5, t2)

def test_v11_free_improvement():
    """Free physical improvements should be top priority."""
    engine = PriorityEngine()
    t_free = Task(id="F1", text="Adjust Belt", estimated_cost=0.0, importance=10)
    
    assert engine.calculate_task_score(5, 5, t_free) == 9999.0


def test_blocked_items_zero_priority():
    """Blocked items should have no immediate priority until blockers clear."""
    engine = PriorityEngine()
    t_blocked = Task(id="B1", text="Install Engine", estimated_cost=1000.0, blocking=[], status="blocked")

    assert engine.calculate_task_score(5, 5, t_blocked) == 0.0


def test_forced_block_override_without_status():
    """Tasks treated as blocked by dependencies get zero score even when status isn't set."""
    engine = PriorityEngine()
    t_pending = Task(id="B2", text="Install Engine", estimated_cost=1000.0)

    score = engine.calculate_task_score(5, 5, t_pending, forced_blocked=True)
    assert score == 0.0
    combined = engine.calculate_combined_priority(5, 5, t_pending, base_score=score, forced_blocked=True)
    assert combined == 0.0