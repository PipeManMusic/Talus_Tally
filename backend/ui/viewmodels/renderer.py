from backend.core.node import Node
from backend.infra.schema_loader import IndicatorCatalog
import os


class TreeViewModel:
    """View model for tree rendering."""
    
    # Node type display names and order
    NODE_TYPE_LABELS = {
        "project_root": "Project",
        "phase": "Phase",
        "job": "Job",
        "task": "Task",
        "part": "Part"
    }
    
    def __init__(self, indicator_catalog: IndicatorCatalog = None):
        """Initialize renderer with optional indicator catalog.
        
        Args:
            indicator_catalog: IndicatorCatalog instance for loading SVG indicators
        """
        self.indicator_catalog = indicator_catalog
    
    def _load_svg_indicator(self, svg_path: str, indicator_color: str) -> str:
        """Load SVG file and apply color to stroke.
        
        Args:
            svg_path: Path to SVG file
            indicator_color: Color to apply to stroke (e.g., "#4A90E2")
            
        Returns:
            SVG content with color applied, or empty string if not found
        """
        if not os.path.exists(svg_path):
            return ""
        
        try:
            with open(svg_path, 'r') as f:
                svg_content = f.read()
            
            # Replace currentColor with the actual color value
            svg_content = svg_content.replace('currentColor', indicator_color)
            
            # Make SVG inline and small (24px)
            svg_content = svg_content.replace('<svg', '<svg style="width: 1em; height: 1em; display: inline;"')
            
            return svg_content
        except Exception:
            return ""
    
    def get_status_indicator(self, node: Node, blueprint_def=None) -> str:
        """Get a status bullet point for a node from the blueprint definition.
        
        Uses UUID-based lookup to get the option definition, then returns the
        bullet character associated with that option. If indicator catalog is
        available, loads SVG indicator instead.
        
        Args:
            node: The node to get indicator for
            blueprint_def: Optional blueprint definition to get status options
            
        Returns:
            Status indicator character or SVG, or "" if no status
        """
        status_uuid = node.properties.get("status", None)
        
        if not status_uuid:
            return ""  # No status property
        
        # If we have blueprint def, look up the option by UUID
        if blueprint_def and hasattr(blueprint_def, '_extra_props'):
            properties = blueprint_def._extra_props.get('properties', [])
            if properties:
                for prop in properties:
                    if prop.get("id") == "status" and "options" in prop:
                        # Look up the option by UUID
                        for option in prop["options"]:
                            if option.get("id") == status_uuid:
                                # If we have a catalog, try to load SVG indicator
                                if self.indicator_catalog:
                                    indicator_set = prop.get("indicator_set", "status")
                                    indicator_id = option.get("indicator_id")
                                    
                                    if indicator_id:
                                        svg_path = self.indicator_catalog.get_indicator_file(
                                            indicator_set, indicator_id
                                        )
                                        theme = self.indicator_catalog.get_indicator_theme(
                                            indicator_set, indicator_id
                                        )
                                        
                                        if svg_path and theme:
                                            indicator_color = theme.get('indicator_color', '#888888')
                                            svg = self._load_svg_indicator(svg_path, indicator_color)
                                            if svg:
                                                return svg
                                
                                # Fallback: use bullet from option definition
                                return option.get("bullet", "•")
        
        # Fallback: use generic bullet if UUID not found
        return "•"
    
    def get_display_name(self, node: Node, blueprint_def=None) -> str:
        """Get the display name for a node, including status indicator if applicable.
        
        Applies text styling based on indicator theme (bold for active, strikethrough
        for done).
        
        Args:
            node: The node to get display name for
            blueprint_def: Optional blueprint definition for status options
            
        Returns:
            Display name with optional status indicator and styling
        """
        # Get status indicator
        indicator = self.get_status_indicator(node, blueprint_def)
        
        # Check if we need to apply text styling
        text_style = ""
        status_uuid = node.properties.get("status", None)
        
        if status_uuid and blueprint_def and hasattr(blueprint_def, '_extra_props'):
            properties = blueprint_def._extra_props.get('properties', [])
            for prop in properties:
                if prop.get("id") == "status" and "options" in prop:
                    for option in prop["options"]:
                        if option.get("id") == status_uuid:
                            if self.indicator_catalog:
                                indicator_set = prop.get("indicator_set", "status")
                                indicator_id = option.get("indicator_id")
                                
                                if indicator_id:
                                    theme = self.indicator_catalog.get_indicator_theme(
                                        indicator_set, indicator_id
                                    )
                                    if theme:
                                        style = theme.get('text_style', '')
                                        if style == 'bold':
                                            text_style = "font-weight: bold;"
                                        elif style == 'strikethrough':
                                            text_style = "text-decoration: line-through;"
        
        # Build display text with optional styling
        if indicator:
            styled_name = f"<span style='{text_style}'>{node.name}</span>" if text_style else node.name
            return f"<span style='font-size: 200%;'>{indicator}</span> {styled_name}"

        # Node has no status property - return plain name without placeholder bullet
        return f"<span style='{text_style}'>{node.name}</span>" if text_style else node.name
    
    def get_icon(self, node: Node) -> str:
        """Get icon name for a node based on its type.
        
        Args:
            node: The node to get icon for
            
        Returns:
            Icon name as string
        """
        icon_map = {
            "job": "briefcase",
            "part": "cube",
            "task": "clipboard-document-check",
            "project_root": "rocket-launch"
        }
        return icon_map.get(node.blueprint_type_id, "document")
    
    def get_node_type_label(self, node: Node) -> str:
        """Get the display label for a node type.
        
        Args:
            node: The node to get type label for
            
        Returns:
            Display label for the node type
        """
        return self.NODE_TYPE_LABELS.get(node.blueprint_type_id, node.blueprint_type_id)
    
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

