"""
Tests for VelocityEngine - Velocity Calculation System

Tests all aspects of velocity calculations:
- Base scores
- Inherited scores from parent nodes
- Status-based scores
- Numerical field multipliers (normal and penalty mode)
- Blocking relationships (direct and cascading)
- Combined scenarios and edge cases
"""

import pytest
from backend.core.velocity_engine import VelocityEngine, VelocityCalculation, ScoreMode
import json
import os


@pytest.fixture
def basic_schema():
    """Basic schema with velocity configurations"""
    return {
        "node_types": [
            {
                "id": "epic",
                "name": "Epic",
                "velocityConfig": {
                    "baseScore": 10,
                    "scoreMode": "fixed"
                },
                "properties": []
            },
            {
                "id": "story",
                "name": "Story",
                "velocityConfig": {
                    "baseScore": 5,
                    "scoreMode": "inherit"
                },
                "properties": []
            },
            {
                "id": "task",
                "name": "Task",
                "velocityConfig": {
                    "baseScore": 1,
                    "scoreMode": "inherit"
                },
                "properties": []
            },
            {
                "id": "no_velocity",
                "name": "No Velocity",
                "properties": []
            }
        ]
    }


@pytest.fixture
def status_schema():
    """Schema with status-based velocity scoring"""
    return {
        "node_types": [
            {
                "id": "task",
                "name": "Task",
                "velocityConfig": {
                    "baseScore": 5,
                    "scoreMode": "fixed"
                },
                "properties": [
                    {
                        "id": "status",
                        "name": "Status",
                        "type": "select",
                        "options": [
                            {"id": "todo-id", "name": "To Do"},
                            {"id": "in-progress-id", "name": "In Progress"},
                            {"id": "done-id", "name": "Done"}
                        ],
                        "velocityConfig": {
                            "enabled": True,
                            "mode": "status",
                            "statusScores": {
                                "To Do": 10,
                                "In Progress": 5,
                                "Done": 0
                            }
                        }
                    }
                ]
            }
        ]
    }


@pytest.fixture
def numerical_schema():
    """Schema with numerical field multipliers"""
    return {
        "node_types": [
            {
                "id": "task",
                "name": "Task",
                "velocityConfig": {
                    "baseScore": 5,
                    "scoreMode": "fixed"
                },
                "properties": [
                    {
                        "id": "priority",
                        "name": "Priority",
                        "type": "number",
                        "velocityConfig": {
                            "enabled": True,
                            "mode": "multiplier",
                            "multiplierFactor": 2,
                            "penaltyMode": False
                        }
                    },
                    {
                        "id": "complexity",
                        "name": "Complexity",
                        "type": "number",
                        "velocityConfig": {
                            "enabled": True,
                            "mode": "multiplier",
                            "multiplierFactor": 0.5,
                            "penaltyMode": True
                        }
                    }
                ]
            }
        ]
    }


class TestBasicVelocityCalculations:
    """Test basic velocity calculations without inheritance or extra features"""
    
    def test_base_score_only(self, basic_schema):
        """Test simple base score calculation"""
        graph = {
            "epic-1": {
                "type": "epic",
                "parent_id": None,
                "properties": {}
            }
        }
        
        engine = VelocityEngine(graph, basic_schema)
        calc = engine.calculate_velocity("epic-1")
        
        assert calc.base_score == 10
        assert calc.inherited_score == 0
        assert calc.total_velocity == 10
    
    def test_node_without_velocity_config(self, basic_schema):
        """Test that nodes without velocity config get total_velocity = -1"""
        graph = {
            "no-vel-1": {
                "type": "no_velocity",
                "parent_id": None,
                "properties": {}
            }
        }
        
        engine = VelocityEngine(graph, basic_schema)
        calc = engine.calculate_velocity("no-vel-1")
        
        assert calc.total_velocity == -1
    
    def test_no_velocity_node_inherits_parent_total(self, basic_schema):
        """Test that nodes without velocity config inherit parent total with self=-1"""
        graph = {
            "epic-1": {
                "type": "epic",
                "parent_id": None,
                "properties": {}
            },
            "no-vel-1": {
                "type": "no_velocity",
                "parent_id": "epic-1",
                "properties": {}
            }
        }
        
        engine = VelocityEngine(graph, basic_schema)
        
        parent_calc = engine.calculate_velocity("epic-1")
        assert parent_calc.total_velocity == 10
        
        child_calc = engine.calculate_velocity("no-vel-1")
        assert child_calc.base_score == -1
        assert child_calc.inherited_score == 10
        assert child_calc.total_velocity == 9
    
    def test_missing_node(self, basic_schema):
        """Test calculation for non-existent node"""
        graph = {}
        
        engine = VelocityEngine(graph, basic_schema)
        calc = engine.calculate_velocity("missing-1")
        
        assert calc.total_velocity == 0
        assert calc.base_score == 0


def test_complex_blocking_fixture():
    """Validate blocking bonuses with a complex parent-child fixture."""
    base_path = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    fixture_path = os.path.join(base_path, "tests", "fixtures", "velocity_complex.json")

    with open(fixture_path, "r") as f:
        fixture = json.load(f)

    schema = fixture["schema"]
    blocking_graph = {"relationships": fixture["blocking_relationships"]}

    graph = {}
    for node in fixture["graph"]["nodes"]:
        graph[node["id"]] = {
            "type": node["type"],
            "parent_id": node.get("parent_id"),
            "properties": node.get("properties", {})
        }

    engine = VelocityEngine(graph, schema, blocking_graph)

    for node_id, expected in fixture["expectations"].items():
        calc = engine.calculate_velocity(node_id)
        for field, expected_value in expected.items():
            actual_value = getattr(calc, field)
            assert actual_value == expected_value, (
                f"{node_id}.{field} expected {expected_value}, got {actual_value}"
            )


class TestInheritedScores:
    """Test inherited score calculations from parent nodes"""
    
    def test_inherit_from_single_parent(self, basic_schema):
        """Test inheriting score from one parent"""
        graph = {
            "epic-1": {
                "type": "epic",
                "parent_id": None,
                "properties": {}
            },
            "story-1": {
                "type": "story",
                "parent_id": "epic-1",
                "properties": {}
            }
        }
        
        engine = VelocityEngine(graph, basic_schema)
        calc = engine.calculate_velocity("story-1")
        
        assert calc.base_score == 5
        assert calc.inherited_score == 10  # From epic parent
        assert calc.total_velocity == 15
    
    def test_inherit_from_multiple_ancestors(self, basic_schema):
        """Test inheriting scores from multiple levels of parents"""
        graph = {
            "epic-1": {
                "type": "epic",
                "parent_id": None,
                "properties": {}
            },
            "story-1": {
                "type": "story",
                "parent_id": "epic-1",
                "properties": {}
            },
            "task-1": {
                "type": "task",
                "parent_id": "story-1",
                "properties": {}
            }
        }
        
        engine = VelocityEngine(graph, basic_schema)
        calc = engine.calculate_velocity("task-1")
        
        assert calc.base_score == 1
        assert calc.inherited_score == 15  # 10 from epic + 5 from story
        assert calc.total_velocity == 16
    
    def test_fixed_score_mode_no_inheritance(self, basic_schema):
        """Test that fixed score mode doesn't inherit"""
        graph = {
            "epic-1": {
                "type": "epic",
                "parent_id": None,
                "properties": {}
            },
            "epic-2": {
                "type": "epic",  # Epic uses fixed mode
                "parent_id": "epic-1",
                "properties": {}
            }
        }
        
        engine = VelocityEngine(graph, basic_schema)
        calc = engine.calculate_velocity("epic-2")
        
        assert calc.base_score == 10
        assert calc.inherited_score == 0  # Fixed mode - no inheritance
        assert calc.total_velocity == 10
    
    def test_velocity_pushed_down_node_stack(self):
        """Test that velocity is pushed down the node stack
        
        When parent has 5 points and child has 5 points:
        - Parent total should be 5
        - Child total should be 10 (own 5 + inherited 5 from parent)
        """
        schema = {
            "node_types": [
                {
                    "id": "parent_type",
                    "name": "Parent",
                    "velocityConfig": {
                        "baseScore": 5,
                        "scoreMode": "fixed"  # Parent doesn't inherit
                    },
                    "properties": []
                },
                {
                    "id": "child_type",
                    "name": "Child",
                    "velocityConfig": {
                        "baseScore": 5,
                        "scoreMode": "inherit"  # Child inherits from parents
                    },
                    "properties": []
                }
            ]
        }
        
        graph = {
            "parent-1": {
                "type": "parent_type",
                "parent_id": None,
                "properties": {}
            },
            "child-1": {
                "type": "child_type",
                "parent_id": "parent-1",
                "properties": {}
            }
        }
        
        engine = VelocityEngine(graph, schema)
        
        # Parent total = 5 (just its base score)
        parent_calc = engine.calculate_velocity("parent-1")
        assert parent_calc.base_score == 5
        assert parent_calc.inherited_score == 0
        assert parent_calc.total_velocity == 5
        
        # Child total = 10 (5 own + 5 inherited from parent)
        child_calc = engine.calculate_velocity("child-1")
        assert child_calc.base_score == 5
        assert child_calc.inherited_score == 5
        assert child_calc.total_velocity == 10


class TestStatusScores:
    """Test status-based score calculations"""
    
    def test_status_score_todo(self, status_schema):
        """Test status score for 'To Do' status"""
        graph = {
            "task-1": {
                "type": "task",
                "parent_id": None,
                "properties": {
                    "status": "todo-id"
                }
            }
        }
        
        engine = VelocityEngine(graph, status_schema)
        calc = engine.calculate_velocity("task-1")
        
        assert calc.base_score == 5
        assert calc.status_score == 10
        assert calc.total_velocity == 15
    
    def test_status_score_in_progress(self, status_schema):
        """Test status score for 'In Progress' status"""
        graph = {
            "task-1": {
                "type": "task",
                "parent_id": None,
                "properties": {
                    "status": "in-progress-id"
                }
            }
        }
        
        engine = VelocityEngine(graph, status_schema)
        calc = engine.calculate_velocity("task-1")
        
        assert calc.base_score == 5
        assert calc.status_score == 5
        assert calc.total_velocity == 10
    
    def test_status_score_done(self, status_schema):
        """Test status score for 'Done' status"""
        graph = {
            "task-1": {
                "type": "task",
                "parent_id": None,
                "properties": {
                    "status": "done-id"
                }
            }
        }
        
        engine = VelocityEngine(graph, status_schema)
        calc = engine.calculate_velocity("task-1")
        
        assert calc.base_score == 5
        assert calc.status_score == 0
        assert calc.total_velocity == 5

    def test_inherit_with_children_only(self):
        """Test inheritance when only children arrays define relationships"""
        schema = {
            "node_types": [
                {
                    "id": "season",
                    "name": "Season",
                    "velocityConfig": {
                        "baseScore": 1,
                        "scoreMode": "inherit"
                    },
                    "properties": []
                },
                {
                    "id": "episode",
                    "name": "Episode",
                    "properties": [
                        {
                            "id": "status",
                            "name": "Status",
                            "type": "select",
                            "options": [
                                {"id": "shooting-id", "name": "Shooting"}
                            ],
                            "velocityConfig": {
                                "enabled": True,
                                "mode": "status",
                                "statusScores": {
                                    "Shooting": 1
                                }
                            }
                        }
                    ]
                }
            ]
        }

        graph = {
            "season-1": {
                "type": "season",
                "children": ["episode-1"],
                "properties": {}
            },
            "episode-1": {
                "type": "episode",
                "properties": {
                    "status": "shooting-id"
                }
            }
        }

        engine = VelocityEngine(graph, schema)
        calc = engine.calculate_velocity("episode-1")

        assert calc.inherited_score == 1
        assert calc.status_score == 1
        assert calc.total_velocity == 2
    
    def test_status_score_missing_property(self, status_schema):
        """Test status score when property is not set"""
        graph = {
            "task-1": {
                "type": "task",
                "parent_id": None,
                "properties": {}
            }
        }
        
        engine = VelocityEngine(graph, status_schema)
        calc = engine.calculate_velocity("task-1")
        
        assert calc.status_score == 0
    
    def test_status_scores_push_down_with_different_options(self):
        """Test that different status option values add independently to children
        
        Parent with "To Do" status = 10 points
        Child with "In Progress" status = 5 points
        
        Parent total = 5 (base) + 10 (status) = 15
        Child total = 5 (base) + 5 (own status) + 15 (inherited from parent) = 25
        """
        schema = {
            "node_types": [
                {
                    "id": "parent_task",
                    "name": "Parent Task",
                    "velocityConfig": {
                        "baseScore": 5,
                        "scoreMode": "fixed"
                    },
                    "properties": [
                        {
                            "id": "status",
                            "name": "Status",
                            "type": "select",
                            "options": [
                                {"id": "todo-id", "name": "To Do"},
                                {"id": "in-progress-id", "name": "In Progress"},
                                {"id": "done-id", "name": "Done"}
                            ],
                            "velocityConfig": {
                                "enabled": True,
                                "mode": "status",
                                "statusScores": {
                                    "To Do": 10,
                                    "In Progress": 5,
                                    "Done": 0
                                }
                            }
                        }
                    ]
                },
                {
                    "id": "child_task",
                    "name": "Child Task",
                    "velocityConfig": {
                        "baseScore": 5,
                        "scoreMode": "inherit"
                    },
                    "properties": [
                        {
                            "id": "status",
                            "name": "Status",
                            "type": "select",
                            "options": [
                                {"id": "todo-id", "name": "To Do"},
                                {"id": "in-progress-id", "name": "In Progress"},
                                {"id": "done-id", "name": "Done"}
                            ],
                            "velocityConfig": {
                                "enabled": True,
                                "mode": "status",
                                "statusScores": {
                                    "To Do": 10,
                                    "In Progress": 5,
                                    "Done": 0
                                }
                            }
                        }
                    ]
                }
            ]
        }
        
        graph = {
            "parent-1": {
                "type": "parent_task",
                "parent_id": None,
                "properties": {
                    "status": "todo-id"  # To Do = 10
                }
            },
            "child-1": {
                "type": "child_task",
                "parent_id": "parent-1",
                "properties": {
                    "status": "in-progress-id"  # In Progress = 5
                }
            }
        }
        
        engine = VelocityEngine(graph, schema)
        
        # Parent: 5 (base) + 10 (status "To Do") = 15
        parent_calc = engine.calculate_velocity("parent-1")
        assert parent_calc.base_score == 5
        assert parent_calc.status_score == 10
        assert parent_calc.total_velocity == 15
        
        # Child: 5 (base) + 5 (status "In Progress") + 15 (inherited from parent) = 25
        child_calc = engine.calculate_velocity("child-1")
        assert child_calc.base_score == 5
        assert child_calc.status_score == 5
        assert child_calc.inherited_score == 15  # Parent base + status
        assert child_calc.total_velocity == 25


class TestNumericalScores:
    """Test numerical field multiplier calculations"""
    
    def test_basic_multiplier(self, numerical_schema):
        """Test basic numerical multiplier"""
        graph = {
            "task-1": {
                "type": "task",
                "parent_id": None,
                "properties": {
                    "priority": 10,
                    "complexity": 0
                }
            }
        }
        
        engine = VelocityEngine(graph, numerical_schema)
        calc = engine.calculate_velocity("task-1")
        
        assert calc.base_score == 5
        # priority: 10 * 2 = 20
        # complexity (penalty): (100 - 0) * 0.5 = 50
        # total numerical: 20 + 50 = 70
        assert calc.numerical_score == 70
        assert calc.total_velocity == 75
    
    def test_penalty_mode_multiplier(self, numerical_schema):
        """Test penalty mode (inverted) multiplier"""
        graph = {
            "task-1": {
                "type": "task",
                "parent_id": None,
                "properties": {
                    "complexity": 20
                }
            }
        }
        
        engine = VelocityEngine(graph, numerical_schema)
        calc = engine.calculate_velocity("task-1")
        
        assert calc.base_score == 5
        # Penalty mode: (100 - 20) * 0.5 = 40
        assert calc.numerical_score == 40
        assert calc.total_velocity == 45
    
    def test_combined_numerical_scores(self, numerical_schema):
        """Test both normal and penalty mode multipliers combined"""
        graph = {
            "task-1": {
                "type": "task",
                "parent_id": None,
                "properties": {
                    "priority": 10,
                    "complexity": 30
                }
            }
        }
        
        engine = VelocityEngine(graph, numerical_schema)
        calc = engine.calculate_velocity("task-1")
        
        assert calc.base_score == 5
        # priority: 10 * 2 = 20
        # complexity: (100 - 30) * 0.5 = 35
        # total numerical: 20 + 35 = 55
        assert calc.numerical_score == 55
        assert calc.total_velocity == 60
    
    def test_zero_value_multiplier(self, numerical_schema):
        """Test multiplier with zero value"""
        graph = {
            "task-1": {
                "type": "task",
                "parent_id": None,
                "properties": {
                    "priority": 0,
                    "complexity": 100
                }
            }
        }
        
        engine = VelocityEngine(graph, numerical_schema)
        calc = engine.calculate_velocity("task-1")
        
        # priority: 0 * 2 = 0
        # complexity (penalty): (100 - 100) * 0.5 = 0
        assert calc.numerical_score == 0


class TestBlockingRelationships:
    """Test blocking relationship effects on velocity"""
    
    def test_direct_blocking(self, basic_schema):
        """Test that blocked node gets zero velocity"""
        graph = {
            "task-1": {
                "type": "task",
                "parent_id": None,
                "properties": {}
            },
            "task-2": {
                "type": "task",
                "parent_id": None,
                "properties": {}
            }
        }
        
        blocking = {
            "relationships": [
                {
                    "blockingNodeId": "task-1",
                    "blockedNodeId": "task-2"
                }
            ]
        }
        
        engine = VelocityEngine(graph, basic_schema, blocking)
        
        # task-2 is blocked, should have zero velocity
        calc_blocked = engine.calculate_velocity("task-2")
        assert calc_blocked.is_blocked is True
        assert calc_blocked.total_velocity == 0
        assert calc_blocked.blocking_penalty == 1  # Would have been 1 if not blocked
        
        # task-1 is blocking, should have its score + blocked node's score
        calc_blocker = engine.calculate_velocity("task-1")
        assert calc_blocker.is_blocked is False
        assert calc_blocker.total_velocity == 2  # 1 (own) + 1 (blocked task)
        assert calc_blocker.blocking_bonus == 1
    
    def test_cascading_blocking(self, basic_schema):
        """Test that blocking cascades to children of blocked nodes"""
        graph = {
            "epic-1": {
                "type": "epic",
                "parent_id": None,
                "properties": {}
            },
            "story-1": {
                "type": "story",
                "parent_id": "epic-1",
                "properties": {}
            },
            "task-1": {
                "type": "task",
                "parent_id": "story-1",
                "properties": {}
            },
            "blocker": {
                "type": "task",
                "parent_id": None,
                "properties": {}
            }
        }
        
        blocking = {
            "relationships": [
                {
                    "blockingNodeId": "blocker",
                    "blockedNodeId": "story-1"
                }
            ]
        }
        
        engine = VelocityEngine(graph, basic_schema, blocking)
        
        # story-1 is directly blocked
        calc_story = engine.calculate_velocity("story-1")
        assert calc_story.is_blocked is True
        assert calc_story.total_velocity == 0
        
        # task-1 inherits blocking from parent story-1
        calc_task = engine.calculate_velocity("task-1")
        assert calc_task.is_blocked is True
        assert calc_task.total_velocity == 0
    
    def test_multiple_blocking_relationships(self, basic_schema):
        """Test node blocking multiple other nodes"""
        graph = {
            "blocker": {
                "type": "task",
                "parent_id": None,
                "properties": {}
            },
            "blocked-1": {
                "type": "task",
                "parent_id": None,
                "properties": {}
            },
            "blocked-2": {
                "type": "task",
                "parent_id": None,
                "properties": {}
            }
        }
        
        blocking = {
            "relationships": [
                {
                    "blockingNodeId": "blocker",
                    "blockedNodeId": "blocked-1"
                },
                {
                    "blockingNodeId": "blocker",
                    "blockedNodeId": "blocked-2"
                }
            ]
        }
        
        engine = VelocityEngine(graph, basic_schema, blocking)
        
        calc_blocker = engine.calculate_velocity("blocker")
        # blocker gets: 1 (own) + 1 (blocked-1) + 1 (blocked-2) = 3
        assert calc_blocker.total_velocity == 3
        assert calc_blocker.blocking_bonus == 2
        assert len(calc_blocker.blocks_node_ids) == 2


class TestComplexScenarios:
    """Test complex combined scenarios"""
    
    def test_full_calculation_chain(self):
        """Test all score components together"""
        schema = {
            "node_types": [
                {
                    "id": "epic",
                    "name": "Epic",
                    "velocityConfig": {
                        "baseScore": 10,
                        "scoreMode": "fixed"
                    },
                    "properties": []
                },
                {
                    "id": "task",
                    "name": "Task",
                    "velocityConfig": {
                        "baseScore": 5,
                        "scoreMode": "inherit"
                    },
                    "properties": [
                        {
                            "id": "status",
                            "name": "Status",
                            "type": "select",
                            "options": [
                                {"id": "todo-id", "name": "To Do"}
                            ],
                            "velocityConfig": {
                                "enabled": True,
                                "mode": "status",
                                "statusScores": {
                                    "To Do": 8
                                }
                            }
                        },
                        {
                            "id": "priority",
                            "name": "Priority",
                            "type": "number",
                            "velocityConfig": {
                                "enabled": True,
                                "mode": "multiplier",
                                "multiplierFactor": 2,
                                "penaltyMode": False
                            }
                        }
                    ]
                }
            ]
        }
        
        graph = {
            "epic-1": {
                "type": "epic",
                "parent_id": None,
                "properties": {}
            },
            "task-1": {
                "type": "task",
                "parent_id": "epic-1",
                "properties": {
                    "status": "todo-id",
                    "priority": 7
                }
            }
        }
        
        engine = VelocityEngine(graph, schema)
        calc = engine.calculate_velocity("task-1")
        
        assert calc.base_score == 5
        assert calc.inherited_score == 10  # From epic
        assert calc.status_score == 8  # To Do status
        assert calc.numerical_score == 14  # 7 * 2
        assert calc.total_velocity == 37  # 5 + 10 + 8 + 14
    
    def test_ranking_multiple_nodes(self, basic_schema):
        """Test ranking of multiple nodes by velocity"""
        graph = {
            "epic-1": {
                "type": "epic",
                "parent_id": None,
                "properties": {}
            },
            "story-1": {
                "type": "story",
                "parent_id": "epic-1",
                "properties": {}
            },
            "task-1": {
                "type": "task",
                "parent_id": "story-1",
                "properties": {}
            }
        }
        
        engine = VelocityEngine(graph, basic_schema)
        ranking = engine.get_ranking()
        
        # Should be sorted by velocity: task-1 (16) > story-1 (15) > epic-1 (10)
        assert len(ranking) == 3
        assert ranking[0][0] == "task-1"
        assert ranking[0][1].total_velocity == 16
        assert ranking[1][0] == "story-1"
        assert ranking[1][1].total_velocity == 15
        assert ranking[2][0] == "epic-1"
        assert ranking[2][1].total_velocity == 10


class TestEdgeCases:
    """Test edge cases and error handling"""
    
    def test_circular_parent_reference_protection(self, basic_schema):
        """Test that circular parent references don't cause infinite loops"""
        # Create a circular reference (shouldn't happen in practice)
        graph = {
            "task-1": {
                "type": "task",
                "parent_id": "task-2",
                "properties": {}
            },
            "task-2": {
                "type": "task",
                "parent_id": "task-1",
                "properties": {}
            }
        }
        
        engine = VelocityEngine(graph, basic_schema)
        # Should not hang or crash
        calc = engine.calculate_velocity("task-1")
        assert calc.node_id == "task-1"
    
    def test_empty_schema(self):
        """Test with empty schema"""
        graph = {
            "task-1": {
                "type": "task",
                "parent_id": None,
                "properties": {}
            }
        }
        
        engine = VelocityEngine(graph, {})
        calc = engine.calculate_velocity("task-1")
        
        # Nodes without velocity config get -1
        assert calc.total_velocity == -1
    
    def test_empty_blocking_graph(self, basic_schema):
        """Test with no blocking relationships"""
        graph = {
            "task-1": {
                "type": "task",
                "parent_id": None,
                "properties": {}
            }
        }
        
        engine = VelocityEngine(graph, basic_schema, {})
        calc = engine.calculate_velocity("task-1")
        
        assert calc.is_blocked is False
        assert calc.total_velocity == 1
    
    def test_non_numeric_value_in_multiplier_field(self, numerical_schema):
        """Test handling of non-numeric values in numerical fields"""
        graph = {
            "task-1": {
                "type": "task",
                "parent_id": None,
                "properties": {
                    "priority": "high",  # String instead of number
                    "complexity": 100
                }
            }
        }
        
        engine = VelocityEngine(graph, numerical_schema)
        calc = engine.calculate_velocity("task-1")
        
        # Should ignore invalid priority value
        # Only complexity contributes: (100 - 100) * 0.5 = 0
        assert calc.numerical_score == 0
        assert calc.total_velocity == 5  # Just base score
