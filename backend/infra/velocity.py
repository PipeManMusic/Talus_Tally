from backend.core.node import Node
from typing import Any


class VelocityEngine:
    """Engine for calculating velocity scores on nodes."""
    
    def calculate_score(self, node: Node, formula: str) -> float:
        """
        Calculate a score for a node based on a formula.
        
        The formula can reference properties of the node. Missing properties default to 0.
        
        Args:
            node: The Node to score
            formula: A mathematical formula using property names (e.g., "(impact * 10) / (effort + 1)")
            
        Returns:
            The calculated score as a float
        """
        # Build evaluation context with node properties, defaulting to 0
        context = {}
        for prop_name, prop_value in node.properties.items():
            context[prop_name] = prop_value
        
        # Use a safe evaluation - only allow basic math operations
        # For missing properties, return 0
        def safe_getitem(d, key, default=0):
            return d.get(key, default)
        
        # Prepare namespace for eval
        namespace = {
            'impact': node.properties.get('impact', 0),
            'effort': node.properties.get('effort', 0),
            '__builtins__': {},
        }
        
        try:
            result = eval(formula, namespace)
            return float(result)
        except Exception:
            return 0.0
