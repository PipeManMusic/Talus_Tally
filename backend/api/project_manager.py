"""Project Manager - API layer for project persistence and template management."""
from typing import Optional, List, Tuple
from backend.core.graph import ProjectGraph
from backend.core.node import Node
from backend.infra.persistence import PersistenceManager
from backend.infra.schema_loader import SchemaLoader


class ProjectManager:
    """Manages project loading/saving and template resolution."""
    
    def __init__(self):
        """Initialize the project manager."""
        # Don't initialize persistence yet - it's set during load/save
        self.persistence = None
        self.schema_loader = SchemaLoader()
        self.graph: Optional[ProjectGraph] = None
        self.template_paths: List[str] = []
    
    def create_new_project(self, template_id: str = None, project_name: str = None) -> ProjectGraph:
        """
        Create a new empty project graph with a root node.
        
        Args:
            template_id: Optional template ID (e.g., 'restomod')
            project_name: Optional project name
            
        Returns:
            A new ProjectGraph with a root node
        """
        self.graph = ProjectGraph()
        self.template_paths = []
        
        # Load blueprint if template_id provided
        blueprint = None
        if template_id:
            try:
                blueprint = self.schema_loader.load(f'{template_id}.yaml')
                self.add_template(f'{template_id}.yaml')
            except Exception as e:
                raise Exception(f"Failed to load template '{template_id}': {str(e)}")
        
        # Create a root node with first node type from blueprint
        if blueprint and blueprint.node_types:
            first_node_type = blueprint.node_types[0]
            root_node = Node(
                blueprint_type_id=first_node_type.id,
                name=project_name or first_node_type.name
            )
        else:
            # Fallback: create generic root node
            root_node = Node(
                blueprint_type_id='root',
                name=project_name or 'Project'
            )
        
        self.graph.add_node(root_node)
        return self.graph
    
    def load_project(self, file_path: str) -> Tuple[ProjectGraph, List[str]]:
        """
        Load a project from file, resolving all templates.
        
        Args:
            file_path: Path to the project JSON file
            
        Returns:
            Tuple of (ProjectGraph, list of template paths)
            
        Raises:
            FileNotFoundError: If file doesn't exist
            Exception: If graph loading fails
        """
        self.persistence = PersistenceManager(file_path)
        self.graph, self.template_paths = self.persistence.load()
        return self.graph, self.template_paths
    
    def save_project(self, file_path: str, graph: ProjectGraph) -> None:
        """
        Save a project to file with template metadata.
        
        Args:
            file_path: Path to save to
            graph: The ProjectGraph to save
            
        Raises:
            Exception: If save fails
        """
        self.persistence = PersistenceManager(file_path)
        self.persistence.save(graph, self.template_paths)
    
    def add_template(self, template_path: str) -> None:
        """
        Add a template to the project's template list.
        
        Args:
            template_path: Path to template YAML file
        """
        if template_path not in self.template_paths:
            self.template_paths.append(template_path)
    
    def get_templates(self) -> List[str]:
        """
        Get all templates used in the current project.
        
        Returns:
            List of template paths
        """
        return self.template_paths.copy()
    
    def load_blueprint(self, template_path: str):
        """
        Load a blueprint from a template file.
        
        Args:
            template_path: Path to template YAML file
            
        Returns:
            The loaded Blueprint object
            
        Raises:
            FileNotFoundError: If template doesn't exist
            Exception: If loading fails
        """
        return self.schema_loader.load(template_path)
