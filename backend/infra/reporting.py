from jinja2 import Environment, BaseLoader
from typing import Dict, Any
from backend.infra.markup import MarkupRegistry, MarkupParser


class ReportEngine:
    """Engine for rendering reports using Jinja2 templates."""
    
    def __init__(self):
        """Initialize the report engine."""
        self.env = Environment(loader=BaseLoader())
        self._markup_registry = MarkupRegistry()
        self._markup_parser = MarkupParser()
        self.env.filters['parse_markup'] = self._parse_markup
        self.env.globals['parse_markup'] = self._parse_markup

    def _parse_markup(self, text: str, profile_id: str) -> Dict[str, Any]:
        profile = self._markup_registry.load_profile(profile_id)
        return self._markup_parser.parse(text, profile)
    
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
