"""
Export Engine for rendering Jinja2 templates with project data.

Provides template discovery and rendering capabilities for exporting
project graphs in various formats (XML, CSV, HTML, etc.).
"""

import os
from pathlib import Path
from typing import Dict, Any, List
from jinja2 import Environment, FileSystemLoader, TemplateNotFound


class ExportEngine:
    """Engine for rendering export templates with Jinja2."""
    
    def __init__(self, templates_dir: Path = None):
        """
        Initialize the export engine.
        
        Args:
            templates_dir: Path to templates directory. Defaults to data/templates/exports
        """
        if templates_dir is None:
            # Use _resolve_assets_subpath logic similar to routes.py
            from backend.api.routes import _resolve_assets_subpath
            templates_dir = _resolve_assets_subpath('data', 'templates', 'exports')
        
        self.templates_dir = Path(templates_dir)
        
        # Ensure templates directory exists
        self.templates_dir.mkdir(parents=True, exist_ok=True)
        
        # Set up Jinja2 environment
        self.env = Environment(
            loader=FileSystemLoader(str(self.templates_dir)),
            autoescape=False,  # Don't escape output for XML/CSV/etc.
            trim_blocks=True,
            lstrip_blocks=True
        )
    
    def get_templates(self) -> List[Dict[str, str]]:
        """
        Scan the templates directory for .j2 files.
        
        Returns:
            List of dicts with template metadata:
            - id: filename (e.g., "kdenlive_session.xml.j2")
            - name: formatted display name (e.g., "Kdenlive Session XML")
            - extension: output file extension (e.g., "xml")
        """
        templates = []
        
        if not self.templates_dir.exists():
            return templates
        
        for file_path in self.templates_dir.glob('*.j2'):
            filename = file_path.name
            
            # Extract the output extension (remove .j2 suffix)
            name_without_j2 = filename[:-3] if filename.endswith('.j2') else filename
            parts = name_without_j2.split('.')
            
            # Get extension (last part after removing .j2)
            extension = parts[-1] if len(parts) > 1 else 'txt'
            
            # Format display name: convert underscores to spaces, title case
            # e.g., "kdenlive_session.xml" -> "Kdenlive Session XML"
            base_name = '.'.join(parts[:-1]) if len(parts) > 1 else parts[0]
            display_name = base_name.replace('_', ' ').title()
            # Add extension in uppercase
            display_name = f"{display_name} {extension.upper()}"
            
            templates.append({
                'id': filename,
                'name': display_name,
                'extension': extension
            })
        
        # Sort by name for consistent ordering
        templates.sort(key=lambda t: t['name'])
        
        return templates
    
    def render(self, template_id: str, context: Dict[str, Any]) -> str:
        """
        Render a template with the given context data.
        
        Args:
            template_id: Template filename (e.g., "kdenlive_session.xml.j2")
            context: Dictionary of data to pass to the template
            
        Returns:
            Rendered template as a string
            
        Raises:
            TemplateNotFound: If template_id doesn't exist
            Exception: If template rendering fails
        """
        try:
            template = self.env.get_template(template_id)
            return template.render(**context)
        except TemplateNotFound:
            raise TemplateNotFound(f"Template '{template_id}' not found in {self.templates_dir}")
        except Exception as e:
            raise Exception(f"Failed to render template '{template_id}': {str(e)}")
    
    def get_output_filename(self, template_id: str, project_id: str = None) -> str:
        """
        Generate an appropriate output filename for a template.
        
        Args:
            template_id: Template filename (e.g., "kdenlive_session.xml.j2")
            project_id: Optional project ID to include in filename
            
        Returns:
            Output filename (e.g., "project_abc123_kdenlive_session.xml")
        """
        # Remove .j2 extension
        base_name = template_id[:-3] if template_id.endswith('.j2') else template_id
        
        if project_id:
            # Extract just the base name without extension
            parts = base_name.split('.')
            name_part = parts[0]
            ext_part = '.' + '.'.join(parts[1:]) if len(parts) > 1 else ''
            return f"project_{project_id}_{name_part}{ext_part}"
        else:
            return base_name
