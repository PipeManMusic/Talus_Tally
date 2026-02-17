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
    blocking_bonus: float = 0
    total_velocity: float = 0
    is_blocked: bool = False
    blocked_by_nodes: List[str] = None
    blocks_node_ids: List[str] = None
    
    def __post_init__(self):
        if self.blocked_by_nodes is None:
            self.blocked_by_nodes = []
        if self.blocks_node_ids is None:
            self.blocks_node_ids = []
        # Limit all float fields to two decimal places
        for attr in [
            'base_score', 'inherited_score', 'status_score', 'numerical_score',
            'blocking_penalty', 'blocking_bonus', 'total_velocity']:
            val = getattr(self, attr, None)
            if isinstance(val, float):
                setattr(self, attr, round(val, 2))


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
        self._parent_map: Dict[str, str] = {}
        self._in_progress_totals: Dict[str, float] = {}
        self._build_parent_map()

    def _normalize_id(self, node_id: Optional[object]) -> Optional[str]:
        if node_id is None:
            return None
        return str(node_id)

    def _build_parent_map(self) -> None:
        """Build a child->parent map from node children arrays."""
        self._parent_map = {}
        for node_id, node in self.nodes.items():
            if hasattr(node, 'children'):
                children = node.children or []
            else:
                children = node.get("children") or []

            parent_id = self._normalize_id(node_id)
            for child_id in children:
                child_key = self._normalize_id(child_id)
                if child_key and child_key not in self._parent_map:
                    self._parent_map[child_key] = parent_id
    
    def calculate_all_velocities(self) -> Dict[str, VelocityCalculation]:
        """Calculate velocity for all nodes"""
        self._velocity_cache = {}
        self._building = set()
        self._in_progress_totals = {}
        
        for node_id in self.nodes.keys():
            self.calculate_velocity(str(node_id))
        
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
        # Normalize node_id to string (graph may use UUID objects as keys)
        node_id = str(node_id)
        
        # Return cached if already calculated
        if node_id in self._velocity_cache:
            return self._velocity_cache[node_id]
        
        # Detect cycles
        if node_id in self._building:
            return VelocityCalculation(node_id=node_id)
        
        self._building.add(node_id)
        
        # Try both string and UUID keys for node lookup
        node = self.nodes.get(node_id)
        if not node:
            # Try UUID key
            try:
                from uuid import UUID
                node = self.nodes.get(UUID(node_id))
            except (ValueError, KeyError):
                pass
        if not node:
            self._building.remove(node_id)
            return VelocityCalculation(node_id=node_id)
        
        calc = VelocityCalculation(node_id=node_id)
        
        # 1. Calculate base score from node type
        # Handle both Node objects and dicts
        if hasattr(node, 'blueprint_type_id'):
            node_type = node.blueprint_type_id
        else:
            node_type = node.get("type")
        
        node_level_config = self._get_node_level_velocity_config(node_type)
        has_velocity_config = self._has_velocity_config(node_type)

        if not has_velocity_config:
            # Nodes without velocity config contribute a self value of -1
            calc.base_score = -1
        elif node_level_config and node_level_config.get("baseScore"):
            calc.base_score = node_level_config["baseScore"]
        
        # 2. Calculate inherited score from parents
        if not has_velocity_config:
            calc.inherited_score = self._calculate_inherited_score(node_id)
        elif not node_level_config or node_level_config.get("scoreMode") == "inherit":
            calc.inherited_score = self._calculate_inherited_score(node_id)
        
        # 3. Calculate status score
        calc.status_score = self._calculate_status_score(node_id, node_type)
        
        # 4. Calculate numerical multiplier scores
        calc.numerical_score = self._calculate_numerical_scores(node_id, node_type)
        
        # Track the unblocked total so children can inherit during cycle detection.
        self._in_progress_totals[node_id] = (
            calc.base_score
            + calc.inherited_score
            + calc.status_score
            + calc.numerical_score
        )

        # 5. Check blocking status
        is_blocked = self._is_node_blocked(node_id)
        calc.is_blocked = is_blocked
        calc.blocked_by_nodes = self._get_blocking_nodes(node_id)
        
        # 6. Apply blocking penalty - blocked nodes get zero
        if is_blocked:
            calc.blocking_penalty = calc.base_score + calc.inherited_score + calc.status_score + calc.numerical_score

        # 7. Calculate bonus from blocked nodes (always tracked for breakdowns)
        blocked_score = self._get_blocked_nodes_score(node_id)
        calc.blocks_node_ids = self._get_blocked_node_ids(node_id)
        calc.blocking_bonus = blocked_score

        # 8. Calculate total (zero if blocked, otherwise sum)
        if is_blocked:
            calc.total_velocity = 0
        else:
            calc.total_velocity = (
                calc.base_score
                + calc.inherited_score
                + calc.status_score
                + calc.numerical_score
                + blocked_score
            )
        
        # Debug log for nodes with positive totals or episodes
        if calc.total_velocity >= 0 or node_type == "episode":
            import logging
            logger = logging.getLogger(__name__)
            node_name = self._get_node_properties(node_id).get('name', 'unnamed')
            parent_id = self._get_parent_id(node_id)
            logger.info(f'[VelocityEngine] node={node_name} type={node_type} parent_id={parent_id} base={calc.base_score} inherited={calc.inherited_score} status={calc.status_score} numerical={calc.numerical_score} total={calc.total_velocity}')
        
        self._velocity_cache[node_id] = calc
        self._in_progress_totals.pop(node_id, None)
        self._building.remove(node_id)
        
        return calc
    
    def _get_node_level_velocity_config(self, node_type: str) -> Optional[Dict]:
        """Get node-level velocity configuration for a node type from schema."""
        if not self.schema or "node_types" not in self.schema:
            return None
        
        for nt in self.schema["node_types"]:
            if nt["id"] == node_type:
                return nt.get("velocityConfig")
        
        return None
    
    def _has_velocity_config(self, node_type: str) -> bool:
        """Check if a node type has any velocity configuration (node or property level)."""
        if not self.schema or "node_types" not in self.schema:
            return False

        for nt in self.schema["node_types"]:
            if nt["id"] != node_type:
                continue

            if nt.get("velocityConfig"):
                return True

            for prop in nt.get("properties", []):
                velocity_config = prop.get("velocityConfig")
                if velocity_config and velocity_config.get("enabled"):
                    return True

            return False

        return False
    
    def _calculate_inherited_score(self, node_id: str) -> float:
        """Return the immediate parent's total velocity.

        This ensures child total = self value + parent total.
        """
        parent_id = self._get_parent_id(node_id)
        if not parent_id:
            return 0

        if parent_id in self._building:
            return self._in_progress_totals.get(parent_id, 0)

        if parent_id in self._velocity_cache:
            parent_calc = self._velocity_cache[parent_id]
            return (
                parent_calc.base_score
                + parent_calc.inherited_score
                + parent_calc.status_score
                + parent_calc.numerical_score
            )

        parent_calc = self.calculate_velocity(parent_id)
        return (
            parent_calc.base_score
            + parent_calc.inherited_score
            + parent_calc.status_score
            + parent_calc.numerical_score
        )
    
    def _get_parent_id(self, node_id: str) -> Optional[str]:
        """Get parent node ID"""
        parent_id = self._parent_map.get(str(node_id))
        if parent_id:
            return parent_id

        # Try both string and UUID keys for node lookup
        node = self.nodes.get(node_id)
        if not node:
            try:
                from uuid import UUID
                node = self.nodes.get(UUID(node_id))
            except (ValueError, KeyError):
                pass
        
        if not node:
            return None
        
        # Handle both Node objects and dicts
        if hasattr(node, 'parent_id'):
            return str(node.parent_id) if node.parent_id else None
        else:
            parent_id = node.get("parent_id")
            return str(parent_id) if parent_id else None
    
    def _get_node_properties(self, node_id: str) -> dict:
        """Get properties dict from a node (handles both Node objects and dicts)"""
        # Try both string and UUID keys for node lookup
        node = self.nodes.get(node_id)
        if not node:
            try:
                from uuid import UUID
                node = self.nodes.get(UUID(node_id))
            except (ValueError, KeyError):
                pass
        
        if not node:
            return {}
        
        if hasattr(node, 'properties'):
            return node.properties or {}
        else:
            return node.get("properties", {})
    
    def _calculate_status_score(self, node_id: str, node_type: str) -> float:
        """Calculate score based on current status"""
        properties = self._get_node_properties(node_id)
        
        # Look for status property in schema
        if not self.schema or "node_types" not in self.schema:
            return 0
        
        for nt in self.schema["node_types"]:
            if nt["id"] != node_type:
                continue
            
            for prop in nt.get("properties", []):
                prop_id = prop.get("id")
                current_value = properties.get(prop_id)

                velocity_config = prop.get("velocityConfig")
                if not velocity_config or not velocity_config.get("enabled"):
                    continue

                if velocity_config.get("mode") == "status":
                    status_scores = velocity_config.get("statusScores", {})
                    lookup_value = current_value

                    # If select options are UUID-backed, resolve to option name for scoring.
                    if current_value and prop.get("type") == "select":
                        for option in prop.get("options", []):
                            if isinstance(option, dict) and option.get("id") == current_value:
                                lookup_value = option.get("name")
                                break

                    return status_scores.get(lookup_value, 0)
        
        return 0
    
    def _calculate_numerical_scores(self, node_id: str, node_type: str) -> float:
        """Calculate scores from numerical field multipliers"""
        score = 0
        properties = self._get_node_properties(node_id)
        
        if not self.schema or "node_types" not in self.schema:
            return 0
        
        for nt in self.schema["node_types"]:
            if nt["id"] != node_type:
                continue
            
            for prop in nt.get("properties", []):
                if prop.get("type") not in ["number", "numeric", "currency"]:
                    continue
                
                velocity_config = prop.get("velocityConfig")
                if not velocity_config or not velocity_config.get("enabled"):
                    continue
                
                if velocity_config.get("mode") != "multiplier":
                    continue
                
                prop_id = prop["id"]
                value = properties.get(prop_id, 0)
                # Accept int, float, or numeric string for currency
                if isinstance(value, str):
                    try:
                        value = float(value.replace("$", "").replace(",", "").strip())
                    except Exception:
                        continue
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
        """Check if a node has any blocking nodes (direct or ancestor)"""
        # Check direct blocking relationships
        if "relationships" not in self.blocking_relationships:
            return False
        
        node_key = self._normalize_id(node_id)
        for rel in self.blocking_relationships["relationships"]:
            if self._normalize_id(rel.get("blockedNodeId")) == node_key:
                return True
        
        # Check if any ancestor node is blocked (cascading block)
        current = node_id
        for _ in range(100):  # Prevent infinite loops
            parent_id = self._get_parent_id(current)
            if not parent_id:
                break
            
            # Check if parent is blocked
            for rel in self.blocking_relationships["relationships"]:
                if self._normalize_id(rel.get("blockedNodeId")) == self._normalize_id(parent_id):
                    # Parent is blocked, so children are also blocked
                    return True
            
            current = parent_id
        
        return False
    
    def _get_blocking_nodes(self, node_id: str) -> List[str]:
        """Get list of nodes blocking this node (direct or via ancestor)"""
        if "relationships" not in self.blocking_relationships:
            return []
        
        blocking = []
        
        # Direct blocking relationships
        node_key = self._normalize_id(node_id)
        for rel in self.blocking_relationships["relationships"]:
            if self._normalize_id(rel.get("blockedNodeId")) == node_key:
                blocking.append(self._normalize_id(rel.get("blockingNodeId")))
        
        # Blocking via ancestor
        current = node_id
        for _ in range(100):  # Prevent infinite loops
            parent_id = self._get_parent_id(current)
            if not parent_id:
                break
            
            # Check if parent is blocked
            for rel in self.blocking_relationships["relationships"]:
                if self._normalize_id(rel.get("blockedNodeId")) == self._normalize_id(parent_id):
                    blocking.append(self._normalize_id(rel.get("blockingNodeId")))
            
            current = parent_id
        
        return blocking
    
    def _get_blocked_node_ids(self, node_id: str) -> List[str]:
        """Get list of nodes this node blocks"""
        if "relationships" not in self.blocking_relationships:
            return []
        
        blocked = []
        node_key = self._normalize_id(node_id)
        for rel in self.blocking_relationships["relationships"]:
            if self._normalize_id(rel.get("blockingNodeId")) == node_key:
                blocked.append(self._normalize_id(rel.get("blockedNodeId")))
        
        return blocked
    
    def _get_blocked_nodes_score(self, node_id: str) -> float:
        """Sum velocity scores of all nodes blocked by this node"""
        score = 0
        
        for blocked_id in self._get_blocked_node_ids(node_id):
            blocked_calc = self.calculate_velocity(blocked_id)
            # Add the blocked node's would-be score (ignoring the blocking penalty itself).
            # Include its blocking bonus so a chain of blockers still accrues full unpenalized value.
            blocked_score = (
                blocked_calc.base_score
                + blocked_calc.inherited_score
                + blocked_calc.status_score
                + blocked_calc.numerical_score
                + blocked_calc.blocking_bonus
            )
            score += blocked_score
        
        return score
    
    def get_ranking(self) -> List[Tuple[str, VelocityCalculation]]:
        """Get all nodes ranked by velocity (highest first). Nodes without velocity config contribute 0."""
        self.calculate_all_velocities()
        
        # Include all nodes - those without velocity config simply have 0 velocity
        ranked = list(self._velocity_cache.items())
        
        # Sort by total velocity descending
        ranked.sort(key=lambda x: x[1].total_velocity, reverse=True)
        
        return ranked
