"""
REST API route handlers.

Maps HTTP requests to backend API methods.
All endpoints are prefixed with /api/v1/.
"""

from flask import Blueprint, request, jsonify
import logging
import uuid
from datetime import datetime, timezone
from backend.api.project_manager import ProjectManager
from backend.api.graph_service import GraphService
from backend.core.node import Node
from backend.handlers.dispatcher import CommandDispatcher
from backend.infra.schema_loader import SchemaLoader
from backend.api.broadcaster import emit_node_created
import os

logger = logging.getLogger(__name__)

api_bp = Blueprint('api', __name__, url_prefix='/api/v1')

# Global state: map session_id -> (project_manager, graph_service, dispatcher)
_sessions = {}

# Session metadata: map session_id -> {created_at, last_activity, active_clients}
_session_metadata = {}


def _get_session_data(session_id):
    """Get session data or 404 if not found."""
    if session_id not in _sessions:
        return None
    return _sessions[session_id]


def _create_session():
    """Create new session with fresh state."""
    session_id = str(uuid.uuid4())
    project_manager = ProjectManager()
    
    # Initialize empty state (will be populated by create_project or load_project)
    _sessions[session_id] = {
        'project_manager': project_manager,
        'graph': None,
        'dispatcher': None,
        'graph_service': None,
        'current_project_id': None,
    }
    
    # Track session metadata
    _session_metadata[session_id] = {
        'created_at': datetime.now(timezone.utc).isoformat(),
        'last_activity': datetime.now(timezone.utc).isoformat(),
        'active_clients': 0
    }
    
    return session_id


def _update_session_activity(session_id):
    """Update last activity timestamp for a session."""
    if session_id in _session_metadata:
        _session_metadata[session_id]['last_activity'] = datetime.now(timezone.utc).isoformat()


def _cleanup_inactive_sessions(max_inactive_hours=24):
    """Clean up sessions with no active clients and old last activity."""
    from datetime import timedelta
    
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=max_inactive_hours)
    
    sessions_to_remove = []
    for session_id, metadata in _session_metadata.items():
        if metadata['active_clients'] == 0:
            last_activity = datetime.fromisoformat(metadata['last_activity'])
            if last_activity < cutoff:
                sessions_to_remove.append(session_id)
    
    for session_id in sessions_to_remove:
        logger.info(f"Cleaning up inactive session: {session_id}")
        _sessions.pop(session_id, None)
        _session_metadata.pop(session_id, None)
    
    return len(sessions_to_remove)


# ============================================================================
# Health Check & Session Info
# ============================================================================

@api_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'ok'}), 200


@api_bp.route('/sessions', methods=['GET'])
def list_sessions():
    """List all active sessions."""
    sessions_info = []
    for session_id, metadata in _session_metadata.items():
        sessions_info.append({
            'session_id': session_id,
            'created_at': metadata['created_at'],
            'last_activity': metadata['last_activity'],
            'active_clients': metadata['active_clients'],
            'has_project': _sessions[session_id]['graph'] is not None
        })
    
    return jsonify({
        'sessions': sessions_info,
        'total': len(sessions_info)
    }), 200


@api_bp.route('/sessions/<session_id>/info', methods=['GET'])
def get_session_info(session_id):
    """Get detailed info about a specific session."""
    if session_id not in _sessions:
        return jsonify({
            'error': {
                'code': 'INVALID_SESSION',
                'message': 'Session not found'
            }
        }), 404
    
    session_data = _sessions[session_id]
    metadata = _session_metadata.get(session_id, {})
    
    return jsonify({
        'session_id': session_id,
        'created_at': metadata.get('created_at'),
        'last_activity': metadata.get('last_activity'),
        'active_clients': metadata.get('active_clients', 0),
        'has_project': session_data['graph'] is not None,
        'project_id': session_data.get('current_project_id'),
        'undo_available': len(session_data['dispatcher'].undo_stack) > 0 if session_data['dispatcher'] else False,
        'redo_available': len(session_data['dispatcher'].redo_stack) > 0 if session_data['dispatcher'] else False,
        'node_count': len(session_data['graph'].nodes) if session_data['graph'] else 0
    }), 200


@api_bp.route('/sessions/cleanup', methods=['POST'])
def cleanup_sessions():
    """Manually trigger session cleanup."""
    max_hours = request.get_json().get('max_inactive_hours', 24) if request.get_json() else 24
    removed_count = _cleanup_inactive_sessions(max_hours)
    
    return jsonify({
        'sessions_removed': removed_count,
        'active_sessions': len(_sessions)
    }), 200


# ============================================================================
# Sessions
# ============================================================================

@api_bp.route('/sessions', methods=['POST'])
def create_session():
    """Create new session."""
    session_id = _create_session()
    return jsonify({'session_id': session_id}), 201


# ============================================================================
# Projects
# ============================================================================

@api_bp.route('/projects', methods=['POST'])
def create_project():
    """Create new project."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'error': {
                    'code': 'INVALID_REQUEST',
                    'message': 'No JSON body provided'
                }
            }), 400
        
        template_id = data.get('template_id')
        project_name = data.get('project_name')
        
        if not template_id or not project_name:
            return jsonify({
                'error': {
                    'code': 'INVALID_REQUEST',
                    'message': 'Missing template_id or project_name'
                }
            }), 400
        
        # Create session for this project
        session_id = _create_session()
        session_data = _sessions[session_id]
        
        # Use ProjectManager to create new project
        try:
            project_manager = ProjectManager()
            graph = project_manager.create_new_project(
                template_id,
                project_name
            )
        except Exception as e:
            return jsonify({
                'error': {
                    'code': 'INVALID_TEMPLATE',
                    'message': f'Template not found or invalid: {str(e)}'
                }
            }), 400
        
        # Store graph and create dispatcher with session_id
        session_data['graph'] = graph
        session_data['dispatcher'] = CommandDispatcher(graph, session_id=session_id)
        session_data['graph_service'] = GraphService(graph)
        session_data['current_project_id'] = str(uuid.uuid4())
        
        # Return project data
        return jsonify({
            'project_id': session_data['current_project_id'],
            'session_id': session_id,
            'graph': _serialize_graph(graph)
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating project: {e}")
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Internal server error'
            }
        }), 500


@api_bp.route('/projects/<project_id>', methods=['GET'])
def get_project(project_id):
    """Get project data."""
    # For now, assuming project_id is stored in session
    # In production, would load from disk
    return jsonify({
        'error': {
            'code': 'NOT_IMPLEMENTED',
            'message': 'Endpoint not yet implemented'
        }
    }), 501


@api_bp.route('/projects/<project_id>/save', methods=['POST'])
def save_project(project_id):
    """Save project."""
    return jsonify({
        'error': {
            'code': 'NOT_IMPLEMENTED',
            'message': 'Endpoint not yet implemented'
        }
    }), 501


@api_bp.route('/projects/<project_id>', methods=['DELETE'])
def delete_project(project_id):
    """Delete project."""
    return jsonify({
        'error': {
            'code': 'NOT_IMPLEMENTED',
            'message': 'Endpoint not yet implemented'
        }
    }), 501


# ============================================================================
# Templates
# ============================================================================

@api_bp.route('/templates', methods=['GET'])
def list_templates():
    """List available templates."""
    try:
        schema_loader = SchemaLoader()
        templates_dir = schema_loader.templates_dir
        
        templates = []
        if os.path.exists(templates_dir):
            for fname in os.listdir(templates_dir):
                if fname.endswith('.yaml'):
                    template_id = fname.replace('.yaml', '')
                    templates.append({
                        'id': template_id,
                        'name': template_id.replace('_', ' ').title(),
                        'description': f'Template: {template_id}'
                    })
        
        return jsonify({'templates': templates}), 200
        
    except Exception as e:
        logger.error(f"Error listing templates: {e}")
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Internal server error'
            }
        }), 500


@api_bp.route('/templates/<template_id>/schema', methods=['GET'])
def get_template_schema(template_id):
    """Get template schema."""
    try:
        schema_loader = SchemaLoader()
        blueprint = schema_loader.load(f'{template_id}.yaml')
        
        # Serialize blueprint to JSON-compatible format
        node_types = []
        for node_type in blueprint.node_types:
            properties = []
            
            # Get properties from _extra_props if available
            props_data = node_type._extra_props.get('properties', [])
            for prop_data in props_data:
                prop_id = prop_data.get('id')
                prop_name = prop_data.get('label') or prop_data.get('name')
                prop_type = prop_data.get('type', 'text')
                required = prop_data.get('required', False)
                options = None
                
                # Handle select options
                if prop_type == 'select' and 'options' in prop_data:
                    options = [
                        {
                            'id': opt.get('id'),
                            'name': opt.get('name') or opt.get('label'),
                            'indicator_id': opt.get('indicator_id')
                        }
                        for opt in prop_data.get('options', [])
                    ]
                
                properties.append({
                    'id': prop_id,
                    'name': prop_name,
                    'type': prop_type,
                    'required': required,
                    'options': options
                })
            
            node_types.append({
                'id': node_type.id,
                'name': node_type.name,
                'properties': properties
            })
        
        return jsonify({
            'id': blueprint.id,
            'name': blueprint.name,
            'description': blueprint._extra_props.get('description', ''),
            'node_types': node_types
        }), 200
        
    except FileNotFoundError:
        return jsonify({
            'error': {
                'code': 'TEMPLATE_NOT_FOUND',
                'message': f'Template not found: {template_id}'
            }
        }), 404
    except Exception as e:
        logger.error(f"Error loading template schema: {e}")
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Internal server error'
            }
        }), 500


# ============================================================================
# Commands
# ============================================================================

@api_bp.route('/commands/execute', methods=['POST'])
def execute_command():
    """Execute a command."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'error': {
                    'code': 'INVALID_REQUEST',
                    'message': 'No JSON body provided'
                }
            }), 400
        
        session_id = data.get('session_id')
        command_type = data.get('command_type')
        command_data = data.get('data', {})
        
        if not session_id or not command_type:
            return jsonify({
                'error': {
                    'code': 'INVALID_REQUEST',
                    'message': 'Missing session_id or command_type'
                }
            }), 400
        
        # Get session data
        session_data = _get_session_data(session_id)
        if not session_data:
            return jsonify({
                'error': {
                    'code': 'INVALID_SESSION',
                    'message': 'Session not found'
                }
            }), 400
        
        # Get dispatcher
        dispatcher = session_data['dispatcher']
        if not dispatcher:
            return jsonify({
                'error': {
                    'code': 'INVALID_STATE',
                    'message': 'Dispatcher not initialized for session'
                }
            }), 400
        
        # Execute command through dispatcher
        try:
            # Import command classes
            from backend.handlers.commands.node_commands import CreateNodeCommand, DeleteNodeCommand, LinkNodeCommand, UpdatePropertyCommand
            from backend.handlers.commands.macro_commands import ApplyKitCommand
            from uuid import UUID
            
            # Map command type to class
            command_map = {
                'CreateNode': CreateNodeCommand,
                'DeleteNode': DeleteNodeCommand,
                'LinkNode': LinkNodeCommand,
                'UpdateProperty': UpdatePropertyCommand,
                'ApplyKit': ApplyKitCommand,
            }
            
            if command_type not in command_map:
                return jsonify({
                    'error': {
                        'code': 'INVALID_COMMAND',
                        'message': f'Unknown command type: {command_type}'
                    }
                }), 400
            
            # Handle CreateNode specially - it needs parent linking
            if command_type == 'CreateNode':
                blueprint_type_id = command_data.get('blueprint_type_id')
                parent_id_str = command_data.get('parent_id')
                
                if not blueprint_type_id:
                    return jsonify({
                        'error': {
                            'code': 'INVALID_COMMAND',
                            'message': 'CreateNode requires blueprint_type_id'
                        }
                    }), 400
                
                # Create command with session_id
                node_name = command_data.get('name', 'New Node')
                graph = session_data['graph']
                
                # Create the node
                new_node = Node(
                    blueprint_type_id=blueprint_type_id,
                    name=node_name
                )
                graph.add_node(new_node)
                
                # Link to parent if specified
                if parent_id_str:
                    try:
                        parent_id = UUID(parent_id_str)
                        parent = graph.get_node(parent_id)
                        if parent:
                            parent.children.append(new_node.id)
                            new_node.parent_id = parent_id
                    except (ValueError, TypeError):
                        logger.warning(f"Invalid parent_id: {parent_id_str}")
                
                # Emit node-created event
                emit_node_created(
                    session_id,
                    str(new_node.id),
                    parent_id_str,
                    blueprint_type_id,
                    node_name
                )
                
                # Return success
                return jsonify({
                    'success': True,
                    'graph': _serialize_graph(graph),
                    'undo_available': len(dispatcher.undo_stack) > 0 if dispatcher else False,
                    'redo_available': len(dispatcher.redo_stack) > 0 if dispatcher else False
                }), 200
            
            # For other commands, use standard command execution
            command_class = command_map[command_type]
            command = command_class(**command_data)
            dispatcher.execute(command)
            
            # Return updated graph
            return jsonify({
                'success': True,
                'graph': _serialize_graph(session_data['graph']),
                'undo_available': len(dispatcher.undo_stack) > 0,
                'redo_available': len(dispatcher.redo_stack) > 0
            }), 200
            
        except Exception as e:
            logger.error(f"Error executing command: {e}")
            return jsonify({
                'error': {
                    'code': 'COMMAND_FAILED',
                    'message': f'Command failed: {str(e)}'
                }
            }), 400
        
    except Exception as e:
        logger.error(f"Error in execute_command: {e}")
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Internal server error'
            }
        }), 500


@api_bp.route('/sessions/<session_id>/undo', methods=['POST'])
def undo_command(session_id):
    """Undo last command."""
    try:
        # Get session data
        session_data = _get_session_data(session_id)
        if not session_data:
            return jsonify({
                'error': {
                    'code': 'INVALID_SESSION',
                    'message': 'Session not found'
                }
            }), 400
        
        dispatcher = session_data['dispatcher']
        if not dispatcher or not session_data['dispatcher'].undo_stack:
            return jsonify({
                'success': True,
                'graph': _serialize_graph(session_data['graph']),
                'undo_available': False,
                'redo_available': len(dispatcher.redo_stack) > 0 if dispatcher else False
            }), 200
        
        dispatcher.undo()
        
        return jsonify({
            'success': True,
            'graph': _serialize_graph(session_data['graph']),
            'undo_available': len(dispatcher.undo_stack) > 0,
            'redo_available': len(dispatcher.redo_stack) > 0
        }), 200
        
    except Exception as e:
        logger.error(f"Error in undo: {e}")
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Internal server error'
            }
        }), 500


@api_bp.route('/sessions/<session_id>/redo', methods=['POST'])
def redo_command(session_id):
    """Redo last command."""
    try:
        # Get session data
        session_data = _get_session_data(session_id)
        if not session_data:
            return jsonify({
                'error': {
                    'code': 'INVALID_SESSION',
                    'message': 'Session not found'
                }
            }), 400
        
        dispatcher = session_data['dispatcher']
        if not dispatcher or not session_data['dispatcher'].redo_stack:
            return jsonify({
                'success': True,
                'graph': _serialize_graph(session_data['graph']),
                'undo_available': len(dispatcher.undo_stack) > 0 if dispatcher else False,
                'redo_available': False
            }), 200
        
        dispatcher.redo()
        
        return jsonify({
            'success': True,
            'graph': _serialize_graph(session_data['graph']),
            'undo_available': len(dispatcher.undo_stack) > 0,
            'redo_available': len(dispatcher.redo_stack) > 0
        }), 200
        
    except Exception as e:
        logger.error(f"Error in redo: {e}")
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Internal server error'
            }
        }), 500


# ============================================================================
# Graph Queries
# ============================================================================

@api_bp.route('/sessions/<session_id>/graph/tree', methods=['GET'])
def get_tree(session_id):
    """Get full tree structure."""
    try:
        # Get session data
        session_data = _get_session_data(session_id)
        if not session_data:
            return jsonify({
                'error': {
                    'code': 'INVALID_SESSION',
                    'message': 'Session not found'
                }
            }), 400
        
        graph = session_data['graph']
        return jsonify(_serialize_graph(graph)), 200
        
    except Exception as e:
        logger.error(f"Error in get_tree: {e}")
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Internal server error'
            }
        }), 500


@api_bp.route('/projects/<project_id>/graph/nodes/<node_id>', methods=['GET'])
def get_node(project_id, node_id):
    """Get specific node."""
    return jsonify({
        'error': {
            'code': 'NOT_IMPLEMENTED',
            'message': 'Endpoint not yet implemented'
        }
    }), 501


@api_bp.route('/projects/<project_id>/graph/search', methods=['POST'])
def search_nodes(project_id):
    """Search nodes."""
    return jsonify({
        'error': {
            'code': 'NOT_IMPLEMENTED',
            'message': 'Endpoint not yet implemented'
        }
    }), 501


# ============================================================================
# Helper Functions
# ============================================================================

def _serialize_graph(graph):
    """Convert ProjectGraph to JSON-serializable dict."""
    def serialize_node(node):
        # Get child nodes
        child_nodes = [graph.nodes[child_id] for child_id in node.children if child_id in graph.nodes]
        
        return {
            'id': str(node.id),
            'blueprint_type_id': node.blueprint_type_id,
            'name': node.name,
            'properties': node.properties,
            'children': [serialize_node(child) for child in child_nodes]
        }
    
    return {
        'roots': [serialize_node(root) for root in graph.roots]
    }


def register_routes(app):
    """Register all API routes with Flask app."""
    app.register_blueprint(api_bp)
