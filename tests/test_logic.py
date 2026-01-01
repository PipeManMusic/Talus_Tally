import pytest
from backend.models import Task
from backend.engine import PriorityEngine

def test_financial_velocity_logic():
    """
    TDD: Prove that a cheap, high-need item outranks an expensive high-need item.
    """
    engine = PriorityEngine()
    
    # Task A: Budget Priority 10 (Critical), Cost $1500 (Transfer Case)
    # Velocity = 10 / 1501 = ~0.006
    expensive_task = Task(
        id="A", text="Buy Transfer Case", 
        budget_priority=10, estimated_cost=1500.0, importance=5
    )
    
    # Task B: Budget Priority 10 (Critical), Cost $5 (Relay)
    # Velocity = 10 / 6 = 1.66
    cheap_task = Task(
        id="B", text="Buy Relay", 
        budget_priority=10, estimated_cost=5.0, importance=5
    )
    
    # Calculate scores (assuming they are in the same Work Package/SubProject)
    score_expensive = engine.calculate_task_score(10, 5, expensive_task)
    score_cheap = engine.calculate_task_score(10, 5, cheap_task)
    
    # The cheap task should have a higher score because it keeps project momentum
    assert score_cheap > score_expensive
