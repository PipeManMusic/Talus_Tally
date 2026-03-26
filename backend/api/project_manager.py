"""Project Manager - API layer for project persistence and template management."""
import logging
import time
from pathlib import Path
from typing import Optional, List, Tuple
from backend.core.graph import ProjectGraph
from backend.core.node import Node
from backend.core.file_watcher import SharedDriveWatcher
from backend.infra.persistence import PersistenceManager
from backend.infra.schema_loader import SchemaLoader

logger = logging.getLogger(__name__)


class ProjectManager:
    """Manages project loading/saving and template resolution."""
    
    def __init__(self):
        """Initialize the project manager."""
        # Don't initialize persistence yet - it's set during load/save
        self.persistence = None
        self.schema_loader = SchemaLoader()
        self.graph: Optional[ProjectGraph] = None
        self.template_paths: List[str] = []
        self.current_project_path: Optional[str] = None
        self.file_watcher: Optional[SharedDriveWatcher] = None
        self.session_id: Optional[str] = None  # Track session for event emission
    
    def create_new_project(self, template_id: str = None, project_name: str = None) -> ProjectGraph:
        """
        Create a new empty project graph with a root node (UUID-based).
        Args:
            template_id: Optional template ID (e.g., 'restomod')
            project_name: Optional project name
        Returns:
            A new ProjectGraph with a root node
        """
        from uuid import uuid4
        self.graph = ProjectGraph()
        self.template_paths = []
        blueprint = None
        if template_id:
            try:
                blueprint = self.schema_loader.load(f'{template_id}.yaml')
                self.add_template(f'{template_id}.yaml')
            except Exception as e:
                raise Exception(f"Failed to load template '{template_id}': {str(e)}")

        # Create a root node with first node type from blueprint
        if blueprint and blueprint.node_types:
            print("[DEBUG] blueprint.node_types just before use:")
            for idx, nt in enumerate(blueprint.node_types):
                print(f"  idx={idx} type={type(nt)} value={nt}")
            # Defensive: ensure node_types is a list of NodeTypeDef, not UUIDs or other types
            node_types = [nt for nt in blueprint.node_types if hasattr(nt, 'id') and hasattr(nt, 'name')]
            if not node_types:
                raise Exception("Blueprint node_types malformed: no valid node type definitions found.")
            first_node_type = node_types[0]
            root_node = Node(
                blueprint_type_id=first_node_type.uuid,
                name=project_name or first_node_type.name,
                id=uuid4()
            )
            # Assign default status if available
            properties = getattr(first_node_type, '_extra_props', {}).get('properties', [])
            for prop in properties:
                if prop.get('id') == 'status' and 'options' in prop and prop['options']:
                    # Use the first option as default
                    default_status_uuid = prop['options'][0].get('id')
                    if default_status_uuid:
                        root_node.properties['status'] = default_status_uuid
                    break
        else:
            # Fallback: create generic root node
            root_node = Node(
                blueprint_type_id='root',
                name=project_name or 'Project',
                id=uuid4()
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
        self.current_project_path = str(Path(file_path).resolve())
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
        # Notify file watcher to ignore the next event (self-echo protection)
        if self.file_watcher:
            self.file_watcher.ignore_next_event(file_path)
        
        self.persistence = PersistenceManager(file_path)
        self.persistence.save(graph, self.template_paths)
        self.current_project_path = str(Path(file_path).resolve())
    
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
    
    def start_file_watching(self, session_id: str) -> None:
        """
        Start watching project and template files for external changes.
        
        Args:
            session_id: Session ID for emitting Socket.IO events
        """
        if self.file_watcher:
            # Already watching, stop old watcher first
            self.stop_file_watching()
        
        self.session_id = session_id
        self.file_watcher = SharedDriveWatcher(
            on_project_changed=self._on_project_file_changed,
            on_template_changed=self._on_template_file_changed,
            debounce_ms=500
        )
        
        # Watch the current project file
        if self.current_project_path:
            self.file_watcher.watch_project(self.current_project_path)
        
        # Watch all template files
        for template_path in self.template_paths:
            # Resolve template path relative to templates directory when needed
            from backend.infra.template_persistence import get_templates_directory
            templates_dir = Path(get_templates_directory())
            template_path_obj = Path(template_path)
            full_path = template_path_obj if template_path_obj.is_absolute() else templates_dir / template_path_obj
            if full_path.exists():
                self.file_watcher.watch_template(str(full_path))
        
        logger.info(f"File watching started for session {session_id}")
    
    def stop_file_watching(self) -> None:
        """Stop watching files and clean up resources."""
        if self.file_watcher:
            self.file_watcher.stop()
            self.file_watcher = None
        logger.info("File watching stopped")
    
    def _on_project_file_changed(self, file_path: str) -> None:
        """
        Handle external changes to the project file.
        
        Reloads the project and emits a Socket.IO event to connected clients.
        
        Args:
            file_path: Path to the changed project file
        """
        logger.info(f"External project file change detected: {file_path}")
        
        try:
            # Reload the project from disk
            self.graph, self.template_paths = self.load_project(file_path)
            try:
                timestamp = Path(file_path).stat().st_mtime
            except OSError:
                timestamp = time.time()
            
            # Emit event to frontend
            from backend.api.broadcaster import emit_event
            emit_event('external_project_update', {
                'session_id': self.session_id,
                'message': 'Project synced with external changes',
                'timestamp': timestamp,
            }, room=self.session_id)
            
            logger.info("Project reloaded and external_project_update event emitted")
        except Exception as e:
            logger.error(f"Failed to reload project after external change: {e}", exc_info=True)
    
    def _on_template_file_changed(self, file_path: str) -> None:
        """
        Handle external changes to a template file.
        
        Reloads the template and emits a Socket.IO event to connected clients.
        
        Args:
            file_path: Path to the changed template file
        """
        logger.info(f"External template file change detected: {file_path}")
        
        try:
            try:
                timestamp = Path(file_path).stat().st_mtime
            except OSError:
                timestamp = time.time()

            # For now, just emit the event - frontend will handle template reload
            # In the future, we could reload schema_loader cache here
            from backend.api.broadcaster import emit_event
            emit_event('external_template_update', {
                'session_id': self.session_id,
                'template_path': file_path,
                'message': 'Template synced with external changes',
                'timestamp': timestamp,
            }, room=self.session_id)
            
            logger.info("external_template_update event emitted")
        except Exception as e:
            logger.error(f"Failed to handle template change: {e}", exc_info=True)
