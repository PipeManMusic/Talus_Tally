from backend.core.node import Node


class TreeViewModel:
    """View model for tree rendering."""
    
    def get_icon(self, node: Node) -> str:
        """Get icon name for a node based on its type.
        
        Args:
            node: The node to get icon for
            
        Returns:
            Icon name as string
        """
        icon_map = {
            "job": "folder",
            "part": "box",
            "task": "check-square",
            "project_root": "folder-open"
        }
        return icon_map.get(node.blueprint_type_id, "file")
    
    def get_velocity_color(self, score: float) -> str:
        """Get color coding based on velocity score.
        
        Args:
            score: Velocity score
            
        Returns:
            Color name or hex code
        """
        if score >= 75:
            return "green"
        elif score >= 50:
            return "amber"
        else:
            return "red"
