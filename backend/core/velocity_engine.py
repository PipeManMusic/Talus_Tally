"""
Velocity Calculation Engine

Handles calculation of task velocity scores based on:
- Base scores from node types
- Inherited scores from parent nodes
- Status-based scores
- Numerical field multipliers
- Blocking relationships
"""

from typing import Dict, List, Optional, Tuple, Set
from dataclasses import dataclass
from enum import Enum


class ScoreMode(Enum):
    """Score inheritance mode"""
    INHERIT = "inherit"      # Sum with parent scores
    FIXED = "fixed"          # Only count own score


@dataclass
class VelocityCalculation:
    """Velocity score breakdown for a node"""
    node_id: str
    base_score: float = 0
    inherited_score: float = 0
    status_score: float = 0
    numerical_score: float = 0
    blocking_penalty: float = 0
    total_velocity: float = 0
    is_blocked: bool = False
    blocked_by_nodes: List[str] = None
    blocks_node_ids: List[str] = None
    
    def __post_init__(self):
        if self.blocked_by_nodes is None:
            self.blocked_by_nodes = []
        if self.blocks_node_ids is None:
            self.blocks_node_ids = []


class VelocityEngine:
    """Core velocity calculation engine"""
    
    def __init__(self, graph: Dict, schema: Dict, blocking_graph: Dict = None):
        """
        Initialize velocity engine
        
        Args:
            graph: Node graph with id->node mapping
            schema: Template schema with velocity configs
            blocking_graph: Optional dict with blocking relationships
        """
        self.nodes = graph
        self.schema = schema
        self.blocking_relationships = blocking_graph or {"relationships": []}
        self._velocity_cache: Dict[str, VelocityCalculation] = {}
        self._building: Set[str] = set()  # For cycle detection
    
    def calculate_all_velocities(self) -> Dict[str, VelocityCalculation]:
        """Calculate velocity for all nodes"""
        self._velocity_cache = {}
        self._building = set()
        
        for node_id in self.nodes.keys():
            self.calculate_velocity(node_id)
        
        return self._velocity_cache
    
    def calculate_velocity(self, node_id: str) -> VelocityCalculation:
        """
        Calculate velocity score for a node
        
        Handles:
        - Base scores from node type
        - Inherited scores from parent nodes
        - Status-based scores
        - Numerical field multipliers
        - Blocking relationships and penalties
        """
        # Return cached if already calculated
        if node_id in self._velocity_cache:
            return self._velocity_cache[node_id]
        
        # Detect cycles
        if node_id in self._building:
            return VelocityCalculation(node_id=node_id)
        
        self._building.add(node_id)
        
        node = self.nodes.get(node_id)
        if not node:
            self._building.remove(node_id)
            return VelocityCalculation(node_id=node_id)
        
        calc = VelocityCalculation(node_id=node_id)
        
        # 1. Calculate base score from node type
        node_type = node.get("type")
        velocity_config = self._get_velocity_config(node_type)
        
        if velocity_config and velocity_config.get("baseScore"):
            calc.base_score = velocity_config["baseScore"]
        
        # 2. Calculate inherited score from parents
        if velocity_config and velocity_config.get("scoreMode") == "inherit":
            calc.inherited_score = self._calculate_inherited_score(node_id)
        
        # 3. Calculate status score
        calc.status_score = self._calculate_status_score(node_id, node_type)
        
        # 4. Calculate numerical multiplier scores
        calc.numerical_score = self._calculate_numerical_scores(node_id, node_type)
        
        # 5. Check blocking status
        is_blocked = self._is_node_blocked(node_id)
        calc.is_blocked = is_blocked
        calc.blocked_by_nodes = self._get_blocking_nodes(node_id)
        
        # 6. Apply blocking penalty - blocked nodes get zero
        if is_blocked:
            calc.blocking_penalty = calc.base_score + calc.inherited_score + calc.status_score + calc.numerical_score
        
        # 7. Calculate total (zero if blocked, otherwise sum)
        if is_blocked:
            calc.total_velocity = 0
        else:
            calc.total_velocity = calc.base_score + calc.inherited_score + calc.status_score + calc.numerical_score
            
            # Add scores of blocked nodes to this node
            blocked_score = self._get_blocked_nodes_score(node_id)
            calc.blocks_node_ids = self._get_blocked_node_ids(node_id)
            calc.total_velocity += blocked_score
        
        self._velocity_cache[node_id] = calc
        self._building.remove(node_id)
        
        return calc
    
    def _get_velocity_config(self, node_type: str) -> Optional[Dict]:
        """Get velocity configuration for a node type from schema"""
        if not self.schema or "node_types" not in self.schema:
            return None
        
        for nt in self.schema["node_types"]:
            if nt["id"] == node_type:
                return nt.get("velocityConfig", {})
        
        return None
    
    def _calculate_inherited_score(self, node_id: str) -> float:
        """Sum base scores from all parent nodes"""
        score = 0
        current = node_id
        
        # Walk up the tree
        for _ in range(100):  # Prevent infinite loops
            parent_id = self._get_parent_id(current)
            if not parent_id:
                break
            
            parent = self.nodes.get(parent_id)
            if not parent:
                break
            
            parent_type = parent.get("type")
            parent_config = self._get_velocity_config(parent_type)
            
            if parent_config and parent_config.get("baseScore"):
                score += parent_config["baseScore"]
            
            current = parent_id
        
        return score
    
    def _get_parent_id(self, node_id: str) -> Optional[str]:
        """Get parent node ID"""
        node = self.nodes.get(node_id)
        if not node:
            return None
        return node.get("parent_id")
    
    def _calculate_status_score(self, node_id: str, node_type: str) -> float:
        """Calculate score based on current status"""
        node = self.nodes.get(node_id)
        if not node:
            return 0
        
        properties = node.get("properties", {})
        
        # Look for status property in schema
        if not self.schema or "node_types" not in self.schema:
            return 0
        
        for nt in self.schema["node_types"]:
            if nt["id"] != node_type:
                continue
            
            for prop in nt.get("properties", []):
                if prop.get("type") != "status":
                    continue
                
                prop_id = prop["id"]
                current_value = properties.get(prop_id)
                
                velocity_config = prop.get("velocityConfig")
                if not velocity_config or not velocity_config.get("enabled"):
                    continue
                
                if velocity_config.get("mode") == "status":
                    status_scores = velocity_config.get("statusScores", {})
                    return status_scores.get(current_value, 0)
        
        return 0
    
    def _calculate_numerical_scores(self, node_id: str, node_type: str) -> float:
        """Calculate scores from numerical field multipliers"""
        node = self.nodes.get(node_id)
        if not node:
            return 0
        
        score = 0
        properties = node.get("properties", {})
        
        if not self.schema or "node_types" not in self.schema:
            return 0
        
        for nt in self.schema["node_types"]:
            if nt["id"] != node_type:
                continue
            
            for prop in nt.get("properties", []):
                if prop.get("type") not in ["number", "numeric"]:
                    continue
                
                velocity_config = prop.get("velocityConfig")
                if not velocity_config or not velocity_config.get("enabled"):
                    continue
                
                if velocity_config.get("mode") != "multiplier":
                    continue
                
                prop_id = prop["id"]
                value = properties.get(prop_id, 0)
                
                if not isinstance(value, (int, float)):
                    continue
                
                multiplier = velocity_config.get("multiplierFactor", 1)
                penalty_mode = velocity_config.get("penaltyMode", False)
                
                if penalty_mode:
                    # For penalties, lower values = higher score
                    # Invert: 100 - value = score contribution
                    score += max(0, (100 - value) * multiplier)
                else:
                    # Normal mode: value * multiplier
                    score += value * multiplier
        
        return score
    
    def _is_node_blocked(self, node_id: str) -> bool:
        """Check if a node has any blocking nodes"""
        if "relationships" not in self.blocking_relationships:
            return False
        
        for rel in self.blocking_relationships["relationships"]:
            if rel["blockedNodeId"] == node_id:
                return True
        
        return False
    
    def _get_blocking_nodes(self, node_id: str) -> List[str]:
        """Get list of nodes blocking this node"""
        if "relationships" not in self.blocking_relationships:
            return []
        
        blocking = []
        for rel in self.blocking_relationships["relationships"]:
            if rel["blockedNodeId"] == node_id:
                blocking.append(rel["blockingNodeId"])
        
        return blocking
    
    def _get_blocked_node_ids(self, node_id: str) -> List[str]:
        """Get list of nodes this node blocks"""
        if "relationships" not in self.blocking_relationships:
            return []
        
        blocked = []
        for rel in self.blocking_relationships["relationships"]:
            if rel["blockingNodeId"] == node_id:
                blocked.append(rel["blockedNodeId"])
        
        return blocked
    
    def _get_blocked_nodes_score(self, node_id: str) -> float:
        """Sum velocity scores of all nodes blocked by this node"""
        score = 0
        
        for blocked_id in self._get_blocked_node_ids(node_id):
            blocked_calc = self.calculate_velocity(blocked_id)
            # Add the blocked node's would-be score (ignoring the blocking penalty itself)
            blocked_score = (
                blocked_calc.base_score +
                blocked_calc.inherited_score +
                blocked_calc.status_score +
                blocked_calc.numerical_score
            )
            score += blocked_score
        
        return score
    
    def get_ranking(self) -> List[Tuple[str, VelocityCalculation]]:
        """Get all nodes ranked by velocity (highest first)"""
        self.calculate_all_velocities()
        
        ranked = []
        for node_id, calc in self._velocity_cache.items():
            ranked.append((node_id, calc))
        
        # Sort by total velocity descending
        ranked.sort(key=lambda x: x[1].total_velocity, reverse=True)
        
        return ranked
