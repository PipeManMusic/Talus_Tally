def get_indicator_metadata(node, blueprint):
    """Get indicator metadata for any node property with indicator_set defined."""
    if not blueprint:
        return None

    # Find the node type definition
    node_type_def = None
    for nt in blueprint.node_types:
        if hasattr(nt, 'id') and nt.id == node.blueprint_type_id:
            node_type_def = nt
            break

    if not node_type_def or not hasattr(node_type_def, '_extra_props'):
        return None

    # Look through all properties for one with indicator_set
    properties = node_type_def._extra_props.get('properties', [])
    for prop in properties:
        # Check if this property has indicators
        if 'options' not in prop or 'indicator_set' not in prop:
            continue
        
        prop_id = prop.get('id') or prop.get('name')
        prop_value_uuid = node.properties.get(prop_id)
        
        if not prop_value_uuid:
            continue
        
        prop_value_uuid_str = str(prop_value_uuid)
        indicator_set = prop.get('indicator_set', 'status')
        options = prop.get('options', [])
        
        # Find the matching option
        for option in options:
            option_id = str(option.get('id')) if option.get('id') is not None else None
            if isinstance(option, dict) and option_id == prop_value_uuid_str:
                indicator_id = option.get('indicator_id')
                if not indicator_id:
                    indicator_id = option.get('name')
                if indicator_id:
                    return {
                        'indicator_set': indicator_set,
                        'indicator_id': indicator_id,
                        'bullet': option.get('bullet', '•')
                    }
    
    return None


def get_node_icon(node, blueprint):
    """Return the icon_id defined on the node type within the blueprint."""
    if not blueprint:
        return None

    node_type_def = blueprint._node_type_map.get(node.blueprint_type_id)
    if not node_type_def:
        return None

    icon_id = node_type_def._extra_props.get('icon')
    return icon_id
"""
REST API route handlers.

Maps HTTP requests to backend API methods.
All endpoints are prefixed with /api/v1/.
"""

from flask import Blueprint, request, jsonify, send_file, Response
import logging
import uuid
from datetime import datetime, timezone
from backend.api.project_manager import ProjectManager
from backend.api.graph_service import GraphService
from backend.core.node import Node
from backend.handlers.dispatcher import CommandDispatcher
from backend.infra.schema_loader import SchemaLoader
from backend.infra.persistence import string_to_uuid
from backend.api.broadcaster import emit_node_created
import os
import re

logger = logging.getLogger(__name__)

api_bp = Blueprint('api', __name__, url_prefix='/api/v1')

# Global state: map session_id -> (project_manager, graph_service, dispatcher)
_sessions = {}

# Session metadata: map session_id -> {created_at, last_activity, active_clients, is_dirty}
_session_metadata = {}


def _get_session_data(session_id):
    """Get session data or 404 if not found."""
    if session_id not in _sessions:
        return None
    return _sessions[session_id]


def _mark_session_dirty(session_id):
    """Mark a session as having unsaved changes."""
    if session_id in _session_metadata:
        _session_metadata[session_id]['is_dirty'] = True
        logger.debug(f"Session {session_id} marked dirty")


def _mark_session_clean(session_id):
    """Mark a session as clean (no unsaved changes)."""
    if session_id in _session_metadata:
        _session_metadata[session_id]['is_dirty'] = False
        logger.debug(f"Session {session_id} marked clean")


def _is_session_dirty(session_id):
    """Check if a session has unsaved changes."""
    if session_id in _session_metadata:
        return _session_metadata[session_id].get('is_dirty', False)
    return False


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
        'blueprint': None,
    }
    
    # Track session metadata
    _session_metadata[session_id] = {
        'created_at': datetime.now(timezone.utc).isoformat(),
        'last_activity': datetime.now(timezone.utc).isoformat(),
        'active_clients': 0,
        'is_dirty': False  # Track if there are unsaved changes
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
        'template_id': session_data.get('template_id'),
        'undo_available': len(session_data['dispatcher'].undo_stack) > 0 if session_data['dispatcher'] else False,
        'redo_available': len(session_data['dispatcher'].redo_stack) > 0 if session_data['dispatcher'] else False,
        'node_count': len(session_data['graph'].nodes) if session_data['graph'] else 0
    }), 200


@api_bp.route('/sessions/<session_id>/graph', methods=['GET'])
def get_session_graph(session_id):
    """Get the current graph for a session."""
    if session_id not in _sessions:
        return jsonify({
            'error': {
                'code': 'INVALID_SESSION',
                'message': 'Session not found'
            }
        }), 404
    
    session_data = _sessions[session_id]
    
    if not session_data['graph']:
        return jsonify({
            'error': {
                'code': 'NO_PROJECT',
                'message': 'No project loaded in session'
            }
        }), 404
    
    _update_session_activity(session_id)
    
    return jsonify({
        'graph': _serialize_graph(session_data['graph'], session_data.get('blueprint'))
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
# Dirty State Management
# ============================================================================

@api_bp.route('/sessions/<session_id>/dirty', methods=['GET'])
def check_session_dirty(session_id):
    """Check if a session has unsaved changes."""
    if session_id not in _sessions:
        return jsonify({
            'error': {
                'code': 'INVALID_SESSION',
                'message': 'Session not found'
            }
        }), 404
    
    is_dirty = _is_session_dirty(session_id)
    
    return jsonify({
        'session_id': session_id,
        'is_dirty': is_dirty
    }), 200


@api_bp.route('/sessions/<session_id>/save', methods=['POST'])
def save_session(session_id):
    """Save session (mark as clean). This is a UI operation that marks the state as saved."""
    if session_id not in _sessions:
        return jsonify({
            'error': {
                'code': 'INVALID_SESSION',
                'message': 'Session not found'
            }
        }), 404
    
    _mark_session_clean(session_id)
    _update_session_activity(session_id)
    
    return jsonify({
        'success': True,
        'session_id': session_id,
        'is_dirty': False
    }), 200


@api_bp.route('/sessions/<session_id>/reset-dirty', methods=['POST'])
def reset_dirty_state(session_id):
    """Reset dirty state without saving (used when discarding changes)."""
    if session_id not in _sessions:
        return jsonify({
            'error': {
                'code': 'INVALID_SESSION',
                'message': 'Session not found'
            }
        }), 404
    
    _mark_session_clean(session_id)
    _update_session_activity(session_id)
    
    return jsonify({
        'success': True,
        'session_id': session_id,
        'is_dirty': False,
        'message': 'Dirty state reset (changes discarded)'
    }), 200


# ============================================================================
# Indicator System
# ============================================================================

@api_bp.route('/indicators/catalog', methods=['GET'])
def get_indicator_catalog():
    """Get the full indicator catalog with all sets and themes."""
    try:
        loader = SchemaLoader()
        if not loader.indicator_catalog:
            return jsonify({
                'error': {
                    'code': 'NOT_FOUND',
                    'message': 'Indicator catalog not loaded'
                }
            }), 404
        
        return jsonify({
            'indicator_sets': loader.indicator_catalog.indicator_sets
        }), 200
        
    except Exception as e:
        logger.error(f"Error loading indicator catalog: {e}")
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Failed to load indicator catalog'
            }
        }), 500


@api_bp.route('/indicators/<set_id>/<indicator_id>', methods=['GET'])
def get_indicator_svg(set_id, indicator_id):
    """Get SVG file for a specific indicator.
    
    Args:
        set_id: Indicator set (e.g., 'status')
        indicator_id: Indicator ID (e.g., 'empty', 'partial', 'filled', 'alert')
    """
    try:
        loader = SchemaLoader()
        if not loader.indicator_catalog:
            return jsonify({
                'error': {
                    'code': 'NOT_FOUND',
                    'message': 'Indicator catalog not loaded'
                }
            }), 404
        
        # Get SVG file path
        svg_path = loader.indicator_catalog.get_indicator_file(set_id, indicator_id)
        if not svg_path or not os.path.exists(svg_path):
            return jsonify({
                'error': {
                    'code': 'NOT_FOUND',
                    'message': f'Indicator {set_id}/{indicator_id} not found'
                }
            }), 404
        
        # Read and clean SVG (remove Inkscape metadata for smaller payload)
        with open(svg_path, 'r', encoding='utf-8') as f:
            svg_content = f.read()
        
        # Remove XML declaration
        svg_content = re.sub(r'<\?xml[^>]*\?>\s*', '', svg_content, flags=re.MULTILINE)
        
        # Remove Inkscape/Sodipodi namespaces from svg tag
        svg_content = re.sub(r'\s+xmlns:inkscape="[^"]*"', '', svg_content)
        svg_content = re.sub(r'\s+xmlns:sodipodi="[^"]*"', '', svg_content)
        svg_content = re.sub(r'\s+sodipodi:docname="[^"]*"', '', svg_content)
        svg_content = re.sub(r'\s+inkscape:[^=]*="[^"]*"', '', svg_content)
        
        # Remove entire sodipodi:namedview element (handles multi-line)
        svg_content = re.sub(r'<sodipodi:namedview[^>]*(?:/>|>.*?</sodipodi:namedview>)\s*', '', svg_content, flags=re.DOTALL | re.IGNORECASE)
        
        # Remove defs elements (both empty and with content)
        svg_content = re.sub(r'<defs\s*(?:/>|>.*?</defs>)\s*', '', svg_content, flags=re.DOTALL)
        
        # Remove metadata elements
        svg_content = re.sub(r'<metadata\s*(?:/>|>.*?</metadata>)\s*', '', svg_content, flags=re.DOTALL)
        
        # Normalize whitespace - collapse multiple newlines
        svg_content = re.sub(r'\n\s*\n+', '\n', svg_content)
        svg_content = svg_content.strip()
        
        # Return cleaned SVG
        return Response(svg_content, mimetype='image/svg+xml')
        
    except Exception as e:
        logger.error(f"Error serving indicator SVG: {e}")
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Failed to serve indicator'
            }
        }), 500


@api_bp.route('/indicators/<set_id>/<indicator_id>/theme', methods=['GET'])
def get_indicator_theme(set_id, indicator_id):
    """Get theme information for a specific indicator.
    
    Returns colors and text styling for the indicator.
    """
    try:
        loader = SchemaLoader()
        if not loader.indicator_catalog:
            return jsonify({
                'error': {
                    'code': 'NOT_FOUND',
                    'message': 'Indicator catalog not loaded'
                }
            }), 404
        
        theme = loader.indicator_catalog.get_indicator_theme(set_id, indicator_id)
        if not theme:
            return jsonify({
                'error': {
                    'code': 'NOT_FOUND',
                    'message': f'Theme for {set_id}/{indicator_id} not found'
                }
            }), 404
        
        return jsonify(theme), 200
        
    except Exception as e:
        logger.error(f"Error getting indicator theme: {e}")
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Failed to get indicator theme'
            }
        }), 500


@api_bp.route('/icons/catalog', methods=['GET'])
def get_icon_catalog():
    """Return the catalog of named SVG icons."""
    try:
        loader = SchemaLoader()
        if not loader.icon_catalog:
            return jsonify({
                'error': {
                    'code': 'NOT_FOUND',
                    'message': 'Icon catalog not loaded'
                }
            }), 404

        return jsonify({
            'icons': loader.icon_catalog.list_icons()
        }), 200
    except Exception as e:
        logger.error(f"Error loading icon catalog: {e}")
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Failed to load icon catalog'
            }
        }), 500


@api_bp.route('/icons/<icon_id>', methods=['GET'])
def get_icon(icon_id):
    """Serve a configured icon SVG entry."""
    try:
        loader = SchemaLoader()
        if not loader.icon_catalog:
            return jsonify({
                'error': {
                    'code': 'NOT_FOUND',
                    'message': 'Icon catalog not loaded'
                }
            }), 404

        icon_path = loader.icon_catalog.get_icon_file(icon_id)
        if not icon_path or not os.path.isfile(icon_path):
            return jsonify({'error': {'code': 'ICON_NOT_FOUND', 'message': f'Icon {icon_id} not found'}}), 404

        return send_file(icon_path, mimetype='image/svg+xml')
    except Exception as e:
        logger.error(f"Error serving icon {icon_id}: {e}")
        return jsonify({'error': {'code': 'INTERNAL_ERROR', 'message': 'Failed to serve icon'}}), 500


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
        logger.info(f"[API] Creating new project: template_id={template_id}, project_name={project_name}, session_id={session_id}")
        # Use ProjectManager to create new project
        try:
            project_manager = ProjectManager()
            graph = project_manager.create_new_project(
                template_id,
                project_name
            )
            logger.info(f"[API] Project graph created for session {session_id} with root node(s): {[n.id for n in graph.nodes.values()]}")
            # Load blueprint for indicator metadata
            loader = SchemaLoader()
            blueprint = loader.load(f'{template_id}.yaml')
            logger.info(f"[API] Loaded blueprint for template_id={template_id}")
        except Exception as e:
            return jsonify({
                'error': {
                    'code': 'INVALID_TEMPLATE',
                    'message': f'Template not found or invalid: {str(e)}'
                }
            }), 400
        
        # Store graph, blueprint, and create dispatcher with session_id
        session_data['graph'] = graph
        session_data['blueprint'] = blueprint
        session_data['template_id'] = template_id
        session_data['dispatcher'] = CommandDispatcher(graph, session_id=session_id)
        session_data['graph_service'] = GraphService(graph)
        session_data['current_project_id'] = str(uuid.uuid4())
        
        # Return project data
        return jsonify({
            'project_id': session_data['current_project_id'],
            'session_id': session_id,
            'graph': _serialize_graph(graph, blueprint)
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


@api_bp.route('/sessions/<session_id>/load-graph', methods=['POST'])
def load_graph_into_session(session_id):
    """Load a graph from saved data into an existing session.
    
    This restores a saved project state into the backend session,
    re-associating nodes with their template/blueprint.
    """
    if session_id not in _sessions:
        return jsonify({
            'error': {
                'code': 'SESSION_NOT_FOUND',
                'message': f'Session {session_id} not found'
            }
        }), 404
    
    try:
        data = request.get_json()
        if not data or 'graph' not in data:
            return jsonify({
                'error': {
                    'code': 'INVALID_REQUEST',
                    'message': 'Missing graph data'
                }
            }), 400
        
        graph_data = data['graph']
        template_id = data.get('template_id')

        # Create new graph from saved data
        from backend.core.graph import ProjectGraph
        graph = ProjectGraph()

        node_entries = graph_data.get('nodes', []) or []
        link_pairs: list[tuple[str, str]] = []

        def _extract_properties(node_data: dict) -> dict:
            props = {}
            if isinstance(node_data.get('properties'), dict):
                props.update(node_data['properties'])
            fallback = node_data.get('data', {}).get('nodeData', {}).get('properties')
            if isinstance(fallback, dict):
                props = {**fallback, **props}
            return props

        for node_data in node_entries:
            node_id = node_data.get('id')
            if not node_id:
                continue
            node_uuid = string_to_uuid(node_id)
            node_type = node_data.get('type') or node_data.get('blueprint_type_id') or node_data.get('blueprintType')
            properties = _extract_properties(node_data)
            default_name = node_data.get('name') or properties.get('name') or node_data.get('label') or 'Unnamed'
            node = Node(
                blueprint_type_id=node_type or 'unknown',
                name=default_name,
                id=node_uuid
            )
            node.properties = dict(properties)
            graph.add_node(node)

            children = node_data.get('children') or node_data.get('child_ids') or node_data.get('childIds') or []
            for child_id in children:
                if not child_id:
                    continue
                link_pairs.append((node_id, child_id))

            parent_id = node_data.get('parent_id') or node_data.get('parentId')
            if parent_id:
                link_pairs.append((parent_id, node_id))

        # Rebuild parent-child relationships from explicit links
        for parent_str, child_str in link_pairs:
            try:
                parent_uuid = string_to_uuid(parent_str)
                child_uuid = string_to_uuid(child_str)
            except Exception:
                continue
            parent_node = graph.get_node(parent_uuid)
            child_node = graph.get_node(child_uuid)
            if not parent_node or not child_node:
                continue
            if child_uuid not in parent_node.children:
                parent_node.children.append(child_uuid)
            child_node.parent_id = parent_uuid

        # Rebuild parent-child relationships from edge list (fallback)
        for edge in graph_data.get('edges', []):
            source_val = edge.get('source') or edge.get('parent_id') or edge.get('parent')
            target_val = edge.get('target') or edge.get('child_id') or edge.get('child')
            if not source_val or not target_val:
                continue
            try:
                source_uuid = string_to_uuid(source_val)
                target_uuid = string_to_uuid(target_val)
            except Exception:
                continue
            parent_node = graph.get_node(source_uuid)
            child_node = graph.get_node(target_uuid)
            if not parent_node or not child_node:
                continue
            if target_uuid not in parent_node.children:
                parent_node.children.append(target_uuid)
            child_node.parent_id = source_uuid
        
        # Load blueprint if template_id provided
        blueprint = None
        if template_id:
            try:
                loader = SchemaLoader()
                blueprint = loader.load(f'{template_id}.yaml')
                logger.info(f"[API] Loaded blueprint for template_id={template_id}")
            except Exception as e:
                logger.warning(f"[API] Failed to load blueprint: {e}")
        
        # Update session with loaded graph
        session_data = _sessions[session_id]
        session_data['graph'] = graph
        session_data['blueprint'] = blueprint
        session_data['template_id'] = template_id
        session_data['dispatcher'] = CommandDispatcher(graph, session_id=session_id)
        session_data['graph_service'] = GraphService(graph)
        session_data['current_project_id'] = str(uuid.uuid4())
        
        # Mark as dirty since it's a loaded state
        _mark_session_dirty(session_id)
        _update_session_activity(session_id)
        
        # Return serialized graph with blueprint context
        serialized = _serialize_graph(graph, blueprint)
        
        return jsonify({
            'session_id': session_id,
            'graph': serialized,
            'template_id': template_id
        }), 200
        
    except Exception as e:
        logger.error(f"[API] Failed to load graph into session: {e}", exc_info=True)
        return jsonify({
            'error': {
                'code': 'LOAD_FAILED',
                'message': f'Failed to load graph: {str(e)}'
            }
        }), 500


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
                # prop_id is the database key (from 'name' field), prop_display is the UI label
                prop_id = prop_data.get('id') or prop_data.get('name')
                prop_display = prop_data.get('label') or prop_data.get('name')
                prop_type = prop_data.get('type', 'text')
                required = prop_data.get('required', False)
                indicator_set = prop_data.get('indicator_set')
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
                    'name': prop_display,
                    'type': prop_type,
                    'required': required,
                    'indicator_set': indicator_set,
                    'options': options
                })
            
            node_types.append({
                'id': node_type.id,
                'name': node_type.name,
                'allowed_children': node_type.allowed_children,
                'icon': node_type._extra_props.get('icon'),
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

            graph = session_data['graph']
            graph_service = session_data.get('graph_service')

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

            if command_type == 'CreateNode':
                blueprint_type_id = command_data.get('blueprint_type_id')
                parent_id_str = command_data.get('parent_id')
                node_name = command_data.get('name', 'New Node')

                if not blueprint_type_id:
                    return jsonify({
                        'error': {
                            'code': 'INVALID_COMMAND',
                            'message': 'CreateNode requires blueprint_type_id'
                        }
                    }), 400

                parent_id = None
                if parent_id_str:
                    try:
                        parent_id = UUID(parent_id_str)
                    except (ValueError, TypeError):
                        logger.warning(f"Invalid parent_id: {parent_id_str}")

                create_cmd = CreateNodeCommand(
                    blueprint_type_id=blueprint_type_id,
                    name=node_name,
                    graph=graph,
                    blueprint=session_data.get('blueprint'),
                    session_id=session_id,
                    parent_id=parent_id,
                )
                dispatcher.execute(create_cmd)

                return jsonify({
                    'success': True,
                    'graph': _serialize_graph(graph, session_data.get('blueprint')),
                    'undo_available': len(dispatcher.undo_stack) > 0 if dispatcher else False,
                    'redo_available': len(dispatcher.redo_stack) > 0 if dispatcher else False
                }), 200

            if command_type == 'DeleteNode':
                node_id = command_data.get('node_id')
                if not node_id:
                    return jsonify({
                        'error': {
                            'code': 'INVALID_COMMAND',
                            'message': 'DeleteNode requires node_id'
                        }
                    }), 400
                command = DeleteNodeCommand(node_id=UUID(node_id), graph=graph, session_id=session_id)
                dispatcher.execute(command)
            elif command_type == 'LinkNode':
                parent_id = command_data.get('parent_id')
                child_id = command_data.get('child_id')
                if not parent_id or not child_id:
                    return jsonify({
                        'error': {
                            'code': 'INVALID_COMMAND',
                            'message': 'LinkNode requires parent_id and child_id'
                        }
                    }), 400
                command = LinkNodeCommand(parent_id=UUID(parent_id), child_id=UUID(child_id), graph=graph, session_id=session_id)
                dispatcher.execute(command)
            elif command_type == 'UpdateProperty':
                node_id = command_data.get('node_id')
                property_id = command_data.get('property_id')
                if not node_id or not property_id:
                    return jsonify({
                        'error': {
                            'code': 'INVALID_COMMAND',
                            'message': 'UpdateProperty requires node_id and property_id'
                        }
                    }), 400
                command = UpdatePropertyCommand(
                    node_id=UUID(node_id),
                    property_id=property_id,
                    old_value=command_data.get('old_value'),
                    new_value=command_data.get('new_value'),
                    graph=graph,
                    graph_service=graph_service,
                    session_id=session_id,
                )
                dispatcher.execute(command)
            elif command_type == 'ApplyKit':
                target_id = command_data.get('target_id')
                kit_root_id = command_data.get('kit_root_id')
                if not target_id or not kit_root_id:
                    return jsonify({
                        'error': {
                            'code': 'INVALID_COMMAND',
                            'message': 'ApplyKit requires target_id and kit_root_id'
                        }
                    }), 400
                command = ApplyKitCommand(target_id=UUID(target_id), kit_root_id=UUID(kit_root_id), graph=graph)
                dispatcher.execute(command)

            # Mark session as dirty after any command execution
            _mark_session_dirty(session_id)
            _update_session_activity(session_id)

            return jsonify({
                'success': True,
                'graph': _serialize_graph(session_data['graph'], session_data.get('blueprint')),
                'undo_available': len(dispatcher.undo_stack) > 0,
                'redo_available': len(dispatcher.redo_stack) > 0,
                'is_dirty': True
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
                'graph': _serialize_graph(session_data['graph'], session_data.get('blueprint')),
                'undo_available': False,
                'redo_available': len(dispatcher.redo_stack) > 0 if dispatcher else False
            }), 200
        
        dispatcher.undo()
        _update_session_activity(session_id)
        
        return jsonify({
            'success': True,
            'graph': _serialize_graph(session_data['graph'], session_data.get('blueprint')),
            'undo_available': len(dispatcher.undo_stack) > 0,
            'redo_available': len(dispatcher.redo_stack) > 0,
            'is_dirty': _is_session_dirty(session_id)
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
                'graph': _serialize_graph(session_data['graph'], session_data.get('blueprint')),
                'undo_available': len(dispatcher.undo_stack) > 0 if dispatcher else False,
                'redo_available': False
            }), 200
        
        dispatcher.redo()
        _mark_session_dirty(session_id)  # Mark as dirty after redo
        _update_session_activity(session_id)
        
        return jsonify({
            'success': True,
            'graph': _serialize_graph(session_data['graph'], session_data.get('blueprint')),
            'undo_available': len(dispatcher.undo_stack) > 0,
            'redo_available': len(dispatcher.redo_stack) > 0,
            'is_dirty': True
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
        blueprint = session_data.get('blueprint')
        return jsonify(_serialize_graph(graph, blueprint)), 200
        
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

def _serialize_graph(graph, blueprint=None):
    """Convert ProjectGraph to JSON-serializable dict with indicator metadata.
    
    Args:
        graph: ProjectGraph to serialize
        blueprint: Optional Blueprint definition for indicator lookup
    """
    # get_indicator_metadata is now a top-level function
    
    def serialize_node(node):
        print(f"[DEBUG][serialize_node] node={node} type(node)={type(node)}")
        # Get child nodes
        child_nodes = []
        for child_id in getattr(node, 'children', []):
            print(f"[DEBUG][serialize_node] child_id={child_id} type(child_id)={type(child_id)}")
            child = graph.nodes.get(child_id)
            print(f"[DEBUG][serialize_node] child={child} type(child)={type(child)}")
            if child is not None:
                child_nodes.append(child)
        node_data = {
            'id': str(node.id),
            'blueprint_type_id': node.blueprint_type_id,
            'name': node.name,
            'properties': node.properties,
            'children': [serialize_node(child) for child in child_nodes]
        }
        # Add indicator metadata if available
        indicator_meta = get_indicator_metadata(node, blueprint)
        if indicator_meta:
            node_data['indicator'] = indicator_meta
            node_data['indicator_id'] = indicator_meta.get('indicator_id')
            node_data['indicator_set'] = indicator_meta.get('indicator_set')
        else:
            node_data['indicator_id'] = None
            node_data['indicator_set'] = None
        node_data['icon_id'] = get_node_icon(node, blueprint)
        print(f"[serialize_node] id={node.id} status={node.properties.get('status')} indicator_id={node_data['indicator_id']} indicator_set={node_data['indicator_set']}")
        return node_data
    
    return {
        'roots': [serialize_node(root) for root in graph.roots]
    }


def register_routes(app):
    """Register all API routes with Flask app."""
    app.register_blueprint(api_bp)
