import pytest
from backend.infra.velocity import VelocityEngine
from backend.core.node import Node

def test_score_calculation():
    """Phase 3.3: Verify the formula calculates correct ROI."""
    # Formula: (impact * 10) / (effort + 1)
    
    node = Node(blueprint_type_id="task", name="Quick Win")
    node.properties = {"impact": 5, "effort": 1} # (5*10)/2 = 25
    
    engine = VelocityEngine()
    score = engine.calculate_score(node, formula="(impact * 10) / (effort + 1)")
    
    assert score == 25.0

def test_missing_properties_default_to_zero():
    """Phase 3.3: Verify engine handles missing data safely."""
    node = Node(blueprint_type_id="task", name="Incomplete Task")
    # Missing 'impact' and 'effort'
    
    engine = VelocityEngine()
    score = engine.calculate_score(node, formula="(impact * 10) / (effort + 1)")
    
    # (0 * 10) / (0 + 1) = 0
    assert score == 0.0