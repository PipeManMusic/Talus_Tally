from jinja2 import Environment, BaseLoader, Template
from typing import Dict, Any


class ReportEngine:
    """Engine for rendering reports using Jinja2 templates."""
    
    def __init__(self):
        """Initialize the report engine."""
        self.env = Environment(loader=BaseLoader())
    
    def render_string(self, template_string: str, context: Dict[str, Any]) -> str:
        """
        Render a template string with the given context.
        
        Args:
            template_string: The Jinja2 template string
            context: Dictionary of variables to use in the template
            
        Returns:
            The rendered string
        """
        template = self.env.from_string(template_string)
        return template.render(**context)
