"""
Export Engine for rendering Jinja2 templates with project data.

Provides template discovery and rendering capabilities for exporting
project graphs in various formats (XML, CSV, HTML, etc.).
"""

from pathlib import Path
from typing import Dict, Any, List, Optional, Set
from jinja2 import Environment, FileSystemLoader, TemplateNotFound


def get_export_templates_directory() -> Path:
    from backend.api.routes import _resolve_assets_subpath
    from backend.infra.settings import CUSTOM_EXPORT_TEMPLATES_DIR_KEY, get_setting

    custom_dir = get_setting(CUSTOM_EXPORT_TEMPLATES_DIR_KEY)
    if custom_dir:
        candidate = Path(str(custom_dir))
        if candidate.is_dir():
            return candidate

    return Path(_resolve_assets_subpath('data', 'templates', 'exports'))


class ExportEngine:
    """Engine for rendering export templates with Jinja2."""
    
    def __init__(self, templates_dir: Path = None):
        """
        Initialize the export engine.
        
        Args:
            templates_dir: Path to templates directory. Defaults to data/templates/exports
        """
        if templates_dir is None:
            templates_dir = get_export_templates_directory()
        
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

    def filter_nodes(
        self,
        nodes: List[Dict[str, Any]],
        root_node_id: Optional[str] = None,
        included_node_ids: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Filter export nodes by optional branch root and/or explicit include list.

        Args:
            nodes: Flat list of node dictionaries containing id and children fields.
            root_node_id: Optional node ID. If provided, only this node and descendants are exported.
            included_node_ids: Optional explicit include list. Nodes not in the list are excluded.

        Returns:
            Filtered list of node dictionaries.
        """
        if not nodes:
            return []

        node_by_id: Dict[str, Dict[str, Any]] = {str(node.get('id')): node for node in nodes if node.get('id') is not None}

        allowed_ids: Optional[Set[str]] = None
        if root_node_id:
            allowed_ids = self._collect_descendants(node_by_id, root_node_id)

        if included_node_ids is not None:
            included_set = {str(node_id) for node_id in included_node_ids}
            allowed_ids = included_set if allowed_ids is None else (allowed_ids & included_set)

        if allowed_ids is None:
            return nodes

        return [node for node in nodes if str(node.get('id')) in allowed_ids]

    def _collect_descendants(self, node_by_id: Dict[str, Dict[str, Any]], root_node_id: str) -> Set[str]:
        """Collect root node id + all descendant ids from children links."""
        root_id = str(root_node_id)
        if root_id not in node_by_id:
            return set()

        collected: Set[str] = set()
        stack: List[str] = [root_id]

        while stack:
            current_id = stack.pop()
            if current_id in collected:
                continue
            collected.add(current_id)

            current_node = node_by_id.get(current_id)
            if not current_node:
                continue

            child_ids = current_node.get('children') or []
            for child_id in child_ids:
                child_str = str(child_id)
                if child_str in node_by_id and child_str not in collected:
                    stack.append(child_str)

        return collected
