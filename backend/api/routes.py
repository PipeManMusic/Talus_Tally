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
    default_icon_map = {
        'project_root': 'film',
        'season': 'calendar-days',
        'episode': 'video-camera',
        'task': 'clipboard-document-check',
        'footage': 'play-circle',
        'location_scout': 'map-pin',
        'inventory_root': 'archive-box',
        'camera_gear_inventory': 'camera',
        'camera_gear_category': 'camera',
        'camera_gear_asset': 'camera',
        'car_parts_inventory': 'cog',
        'part_category': 'cog',
        'part_asset': 'cog',
        'tools_inventory': 'cog',
        'tool_category': 'cog',
        'tool_asset': 'cog',
        'asset_reference': 'clipboard-document-list',
        'uses_camera_gear': 'camera',
        'uses_car_part': 'cog',
        'uses_tool': 'cog',
        'phase': 'calendar-days',
        'job': 'clipboard-document-list',
        'part': 'cog',
        'vehicles': 'truck',
        'vehicle_asset': 'truck',
    }

    if not blueprint:
        return node.properties.get('icon') or node.properties.get('icon_id') or default_icon_map.get(node.blueprint_type_id)

    node_type_def = blueprint._node_type_map.get(node.blueprint_type_id)
    if not node_type_def:
        return node.properties.get('icon') or node.properties.get('icon_id') or default_icon_map.get(node.blueprint_type_id)

    icon_id = node_type_def._extra_props.get('icon')
    if icon_id:
        return icon_id
    return node.properties.get('icon') or node.properties.get('icon_id') or default_icon_map.get(node.blueprint_type_id)
"""
REST API route handlers.

Maps HTTP requests to backend API methods.
All endpoints are prefixed with /api/v1/.
"""

from flask import Blueprint, request, jsonify, send_file, Response
import io
import json
import logging
import uuid
from datetime import datetime, timezone
from backend.api.project_manager import ProjectManager
from backend.api.graph_service import GraphService
from backend.core.node import Node
from backend.handlers.dispatcher import CommandDispatcher
from backend.infra.schema_loader import SchemaLoader
from backend.infra.markup import MarkupRegistry, MarkupParser, resolve_markup_definition
from backend.infra.template_validator import TemplateValidationError
from backend.infra.orphan_manager import OrphanManager
from backend.infra.persistence import string_to_uuid
from backend.api.broadcaster import emit_node_created
from backend.core.imports import CSVColumnBinding, CSVImportPlan, CSVImportPlanError
from backend.infra.imports.csv_service import CSVImportService
from backend.handlers.commands.macro_commands import ImportNodesCommand
from uuid import UUID
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


# ============================================================================
# CSV Import
# ============================================================================


@api_bp.route('/imports/csv', methods=['POST'])
def import_nodes_from_csv():
    """Import child nodes from a CSV file under a given parent node."""
    session_id = request.form.get('session_id')
    parent_id_str = request.form.get('parent_id')
    blueprint_type_id = request.form.get('blueprint_type_id')
    column_map_payload = request.form.get('column_map')
    file_storage = request.files.get('file')

    if not session_id or not parent_id_str or not blueprint_type_id or not column_map_payload or not file_storage:
        return jsonify({
            'error': {
                'code': 'INVALID_REQUEST',
                'message': 'session_id, parent_id, blueprint_type_id, column_map, and file are required'
            }
        }), 400

    try:
        parent_id = UUID(parent_id_str)
    except (ValueError, TypeError):
        return jsonify({
            'error': {
                'code': 'INVALID_REQUEST',
                'message': 'parent_id must be a valid UUID'
            }
        }), 400

    try:
        column_map_data = json.loads(column_map_payload)
    except json.JSONDecodeError:
        return jsonify({
            'error': {
                'code': 'INVALID_REQUEST',
                'message': 'column_map must be valid JSON'
            }
        }), 400

    if not isinstance(column_map_data, list) or not column_map_data:
        return jsonify({
            'error': {
                'code': 'INVALID_REQUEST',
                'message': 'column_map must be a non-empty list'
            }
        }), 400

    column_bindings = []
    try:
        for entry in column_map_data:
            header = (entry or {}).get('header')
            property_id = (entry or {}).get('property_id')
            if not header or not property_id:
                raise ValueError('Each mapping must include header and property_id')
            column_bindings.append(CSVColumnBinding(header=header, property_id=property_id))
    except ValueError as err:
        return jsonify({
            'error': {
                'code': 'INVALID_REQUEST',
                'message': str(err)
            }
        }), 400

    session_data = _get_session_data(session_id)
    if not session_data:
        return jsonify({
            'error': {
                'code': 'INVALID_SESSION',
                'message': 'Session not found'
            }
        }), 404

    graph = session_data.get('graph')
    blueprint = session_data.get('blueprint')
    dispatcher: CommandDispatcher = session_data.get('dispatcher')

    if not graph or not blueprint or not dispatcher:
        return jsonify({
            'error': {
                'code': 'INVALID_STATE',
                'message': 'Session is missing graph, blueprint, or dispatcher'
            }
        }), 400

    if blueprint_type_id not in blueprint._node_type_map:
        return jsonify({
            'error': {
                'code': 'INVALID_PLAN',
                'message': f"Unknown blueprint type '{blueprint_type_id}'"
            }
        }), 400

    try:
        plan = CSVImportPlan(
            parent_id=parent_id,
            blueprint_type_id=blueprint_type_id,
            column_bindings=column_bindings,
        )
    except ValueError as err:
        return jsonify({
            'error': {
                'code': 'INVALID_PLAN',
                'message': str(err)
            }
        }), 400

    def resolve_property_schema(node_type_id: str):
        node_type = blueprint._node_type_map.get(node_type_id)
        if not node_type:
            return []
        return node_type._extra_props.get('properties', [])

    service = CSVImportService(resolve_property_schema)

    file_bytes = file_storage.read()
    try:
        csv_text = file_bytes.decode('utf-8-sig')
    except UnicodeDecodeError:
        try:
            csv_text = file_bytes.decode('utf-8')
        except UnicodeDecodeError:
            return jsonify({
                'error': {
                    'code': 'INVALID_FILE',
                    'message': 'Uploaded CSV must be UTF-8 encoded'
                }
            }), 400

    try:
        batch = service.prepare_import(plan, io.StringIO(csv_text))
    except CSVImportPlanError as err:
        return jsonify({
            'error': {
                'code': 'INVALID_PLAN',
                'message': str(err)
            }
        }), 400

    if batch.has_errors:
        row_errors = [
            {
                'row_number': error.row_number,
                'messages': list(error.messages),
            }
            for error in batch.errors
        ]
        return jsonify({
            'error': {
                'code': 'CSV_ROW_ERRORS',
                'message': 'CSV rows contain validation errors',
                'rows': row_errors,
            }
        }), 422

    if not batch.prepared_nodes:
        return jsonify({
            'error': {
                'code': 'INVALID_FILE',
                'message': 'CSV contained no data rows'
            }
        }), 400

    import_command = ImportNodesCommand(
        plan=plan,
        prepared_nodes=batch.prepared_nodes,
        graph=graph,
        blueprint=blueprint,
        session_id=session_id,
    )

    try:
        dispatcher.execute(import_command)
    except ValueError as err:
        return jsonify({
            'error': {
                'code': 'INVALID_PLAN',
                'message': str(err)
            }
        }), 400

    created_ids = [str(node_id) for node_id in import_command.created_node_ids]

    _mark_session_dirty(session_id)
    _update_session_activity(session_id)

    return jsonify({
        'success': True,
        'created_count': len(created_ids),
        'created_node_ids': created_ids,
        'graph': _serialize_graph(graph, blueprint),
        'undo_available': len(dispatcher.undo_stack) > 0 if dispatcher else False,
        'redo_available': len(dispatcher.redo_stack) > 0 if dispatcher else False,
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


@api_bp.route('/sessions/<session_id>/reload-blueprint', methods=['POST'])
def reload_blueprint(session_id):
    """Reload the blueprint/template from disk for a session.
    
    This is useful when the template file has been edited and you want
    to pick up the changes without restarting the backend or reloading the project.
    """
    if session_id not in _sessions:
        return jsonify({
            'error': {
                'code': 'INVALID_SESSION',
                'message': 'Session not found'
            }
        }), 404
    
    session_data = _sessions[session_id]
    graph = session_data.get('graph')
    
    if not graph or not graph.template_id:
        return jsonify({
            'error': {
                'code': 'NO_TEMPLATE',
                'message': 'Session has no template_id to reload'
            }
        }), 400
    
    try:
        template_id = graph.template_id
        loader = SchemaLoader()
        blueprint = loader.load(f'{template_id}.yaml')
        session_data['blueprint'] = blueprint
        
        logger.info(f"[API] Reloaded blueprint for session {session_id}, template_id={template_id}")
        _update_session_activity(session_id)
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'template_id': template_id,
            'message': f'Blueprint reloaded from {template_id}.yaml'
        }), 200
        
    except Exception as e:
        logger.error(f"[API] Failed to reload blueprint: {e}", exc_info=True)
        return jsonify({
            'error': {
                'code': 'RELOAD_FAILED',
                'message': f'Failed to reload blueprint: {str(e)}'
            }
        }), 500


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
        except TemplateValidationError as e:
            return jsonify({
                'error': {
                    'code': 'TEMPLATE_VALIDATION_ERROR',
                    'message': f'Template validation failed: {str(e)}',
                    'details': str(e)
                }
            }), 400
        except FileNotFoundError as e:
            return jsonify({
                'error': {
                    'code': 'TEMPLATE_NOT_FOUND',
                    'message': f'Template not found: {template_id}'
                }
            }), 404
        except Exception as e:
            return jsonify({
                'error': {
                    'code': 'INVALID_TEMPLATE',
                    'message': f'Failed to load template: {str(e)}'
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
        
        # Extract template info from saved data
        saved_template_version = data.get('template_version')
        
        # Default to '0.0.0' if template_version is missing (legacy project)
        if not saved_template_version:
            logger.warning("[API] Legacy project file missing template_version; defaulting to '0.0.0'")
            saved_template_version = '0.0.0'
        graph = ProjectGraph(template_id=template_id, template_version=saved_template_version)

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
                current_version = blueprint.version if hasattr(blueprint, 'version') else '0.1.0'
                logger.info(f"[API] Loaded blueprint for template_id={template_id}, version={current_version}")
                
                # Check if migration is needed
                if graph.template_version and graph.template_version != current_version:
                    logger.info(f"[API] Template version mismatch: project={graph.template_version}, current={current_version}")
                    logger.info(f"[API] Attempting to migrate project from {graph.template_version} to {current_version}")
                    
                    # Apply migrations
                    try:
                        from backend.infra.project_talus_migrations import registry as migrations_registry
                        success, messages = migrations_registry.apply_migrations(
                            graph,
                            from_version=graph.template_version,
                            to_version=current_version
                        )
                        
                        if success:
                            graph.template_version = current_version
                            logger.info(f"[API] Migration successful. Messages: {messages}")
                        else:
                            logger.warning(f"[API] Migration failed. Messages: {messages}")
                            # Continue anyway - better to load with warnings than fail entirely
                    except Exception as e:
                        logger.warning(f"[API] Migration error (continuing with loaded data): {e}")
                        
            except TemplateValidationError as e:
                logger.error(f"[API] Template validation failed for {template_id}: {e}")
                # Don't fail the load, but blueprint will be None
            except FileNotFoundError as e:
                logger.warning(f"[API] Template file not found: {template_id}")
            except Exception as e:
                logger.warning(f"[API] Failed to load blueprint: {e}")
        
        # If no template version was saved, set to current version
        if not graph.template_version and blueprint:
            graph.template_version = blueprint.version if hasattr(blueprint, 'version') else '0.1.0'
            logger.info(f"[API] Set initial template version to {graph.template_version}")
        
        # Update session with loaded graph
        session_data = _sessions[session_id]
        session_data['graph'] = graph
        session_data['blueprint'] = blueprint
        session_data['template_id'] = template_id
        session_data['template_version'] = graph.template_version
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
        markup_registry = MarkupRegistry()
        
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
                markup_profile = prop_data.get('markup_profile')
                markup_tokens = None
                
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

                if markup_profile:
                    try:
                        profile = markup_registry.load_profile(markup_profile)
                        markup_tokens = profile.get('tokens') or []
                    except Exception as exc:
                        logger.warning(f"Failed to load markup profile '{markup_profile}': {exc}")

                inline_markup = prop_data.get('markup')
                if isinstance(inline_markup, dict):
                    markup_tokens = inline_markup.get('tokens') or []
                
                properties.append({
                    'id': prop_id,
                    'name': prop_display,
                    'type': prop_type,
                    'required': required,
                    'indicator_set': indicator_set,
                    'options': options,
                    'markup_profile': markup_profile,
                    'markup_tokens': markup_tokens
                })
            
            node_types.append({
                'id': node_type.id,
                'name': node_type.name,
                'allowed_children': node_type.allowed_children,
                'allowed_asset_types': node_type.allowed_asset_types,
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
    except TemplateValidationError as e:
        logger.error(f"Template validation error for {template_id}: {e}")
        return jsonify({
            'error': {
                'code': 'TEMPLATE_VALIDATION_ERROR',
                'message': f'Template validation failed: {str(e)}',
                'details': str(e)
            }
        }), 400
    except Exception as e:
        logger.error(f"Error loading template schema: {e}")
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Internal server error',
                'details': str(e)
            }
        }), 500


# ============================================================================
# Template Editor - CRUD Operations
# ============================================================================

@api_bp.route('/templates/editor/list', methods=['GET'])
def editor_list_templates():
    """List all templates with metadata for the template editor."""
    try:
        from backend.infra.template_persistence import TemplatePersistence
        persistence = TemplatePersistence()
        templates = persistence.list_templates()
        
        return jsonify({'templates': templates}), 200
    except Exception as e:
        logger.error(f"[API] Error listing templates for editor: {e}")
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Failed to list templates'
            }
        }), 500


@api_bp.route('/templates/editor/<template_id>', methods=['GET'])
def editor_get_template(template_id):
    """Get a complete template document for editing."""
    try:
        from backend.infra.template_persistence import TemplatePersistence
        persistence = TemplatePersistence()
        template = persistence.load_template(template_id)
        
        # Migrate old templates for editor compatibility
        if 'node_types' in template:
            for node_type in template['node_types']:
                # Ensure required fields exist
                if 'label' not in node_type:
                    node_type['label'] = node_type.get('id', 'Unnamed').replace('_', ' ').title()
                if 'allowed_children' not in node_type:
                    node_type['allowed_children'] = []
                if 'allowed_asset_types' not in node_type:
                    node_type['allowed_asset_types'] = []
                if 'properties' not in node_type:
                    node_type['properties'] = []
                
                # Clean up properties
                for prop in node_type.get('properties', []):
                    # Remove 'required' field (no longer supported in editor)
                    prop.pop('required', None)
                    
                    # Ensure label exists
                    if 'label' not in prop:
                        prop['label'] = prop.get('id', 'Unnamed').replace('_', ' ').title()
                    
                    # Ensure type exists (required field)
                    if 'type' not in prop:
                        logger.warning(f"Property {node_type['id']}.{prop.get('id')} missing type, defaulting to 'text'")
                        prop['type'] = 'text'
        
        return jsonify(template), 200
    except FileNotFoundError:
        return jsonify({
            'error': {
                'code': 'NOT_FOUND',
                'message': f'Template not found: {template_id}'
            }
        }), 404
    except Exception as e:
        logger.error(f"[API] Error loading template {template_id}: {e}", exc_info=True)
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Failed to load template'
            }
        }), 500


@api_bp.route('/templates/editor', methods=['POST'])
def editor_create_template():
    """Create a new template."""
    try:
        from backend.infra.template_persistence import TemplatePersistence
        persistence = TemplatePersistence()
        
        data = request.get_json()
        if not data:
            return jsonify({
                'error': {
                    'code': 'INVALID_REQUEST',
                    'message': 'No JSON body provided'
                }
            }), 400
        
        # Validate that template has required fields
        if not data.get('id'):
            return jsonify({
                'error': {
                    'code': 'INVALID_REQUEST',
                    'message': 'Template must have an id'
                }
            }), 400
        
        try:
            persistence.save_template(data)
            return jsonify({
                'success': True,
                'template_id': data['id'],
                'message': f'Template "{data.get("name", data["id"])}" created successfully'
            }), 201
        except ValueError as ve:
            return jsonify({
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': str(ve)
                }
            }), 400
    except Exception as e:
        logger.error(f"[API] Error creating template: {e}", exc_info=True)
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Failed to create template'
            }
        }), 500


@api_bp.route('/templates/editor/<template_id>', methods=['PUT'])
def editor_update_template(template_id):
    """Update an existing template and handle orphaned nodes."""
    try:
        from backend.infra.template_persistence import TemplatePersistence
        persistence = TemplatePersistence()
        orphan_mgr = OrphanManager()
        
        data = request.get_json()
        if not data:
            return jsonify({
                'error': {
                    'code': 'INVALID_REQUEST',
                    'message': 'No JSON body provided'
                }
            }), 400
        
        # Ensure ID matches URL parameter
        if data.get('id') != template_id:
            data['id'] = template_id
        
        try:
            # Load old template to detect removed node types
            old_template = None
            try:
                old_template = persistence.load_template(template_id)
            except FileNotFoundError:
                pass  # New template, no orphaning needed
            
            # Save the updated template
            persistence.save_template(data)
            
            # Check for orphaned node types
            orphan_info = {
                'orphaned_sessions': [],
                'total_orphaned_nodes': 0,
                'total_orphaned_properties': 0
            }
            
            if old_template:
                # Check for removed node types
                removed_types = orphan_mgr.find_orphaned_node_types(
                    old_template, data
                )
                
                # Check for removed properties
                orphaned_props_by_type = orphan_mgr.find_orphaned_properties(
                    old_template, data
                )
                
                if removed_types or orphaned_props_by_type:
                    # Find all sessions using this template and mark orphaned nodes/properties
                    sessions = GraphService.get_all_sessions()
                    
                    for session_id, session_data in sessions.items():
                        blueprint = session_data.get('blueprint')
                        if not blueprint or blueprint.get('id') != template_id:
                            continue
                        
                        # Get graph for this session
                        graph = session_data.get('graph', {})
                        
                        orphaned_node_count = 0
                        orphaned_prop_count = 0
                        orphaned_node_ids = []
                        
                        # Mark orphaned nodes
                        if removed_types:
                            result = orphan_mgr.mark_orphaned_nodes(
                                graph, removed_types
                            )
                            orphaned_node_count = result['affected_count']
                            orphaned_node_ids = result['orphaned_node_ids']
                        
                        # Mark orphaned properties
                        if orphaned_props_by_type:
                            orphaned_prop_count = orphan_mgr.mark_orphaned_properties(
                                graph, orphaned_props_by_type
                            )
                        
                        if orphaned_node_count > 0 or orphaned_prop_count > 0:
                            orphan_info['orphaned_sessions'].append({
                                'session_id': session_id,
                                'orphaned_count': orphaned_node_count,
                                'orphaned_node_ids': orphaned_node_ids,
                                'orphaned_property_count': orphaned_prop_count
                            })
                            orphan_info['total_orphaned_nodes'] += orphaned_node_count
                            orphan_info['total_orphaned_properties'] += orphaned_prop_count
                    
                    logger.info(
                        f"Template update orphaned {orphan_info['total_orphaned_nodes']} nodes "
                        f"and {orphan_info['total_orphaned_properties']} properties "
                        f"across {len(orphan_info['orphaned_sessions'])} sessions"
                    )
            
            return jsonify({
                'success': True,
                'template_id': template_id,
                'message': f'Template "{data.get("name", template_id)}" updated successfully',
                'orphan_info': orphan_info
            }), 200
            
        except ValueError as ve:
            return jsonify({
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': str(ve)
                }
            }), 400
    except Exception as e:
        logger.error(f"[API] Error updating template {template_id}: {e}", exc_info=True)
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Failed to update template'
            }
        }), 500


@api_bp.route('/templates/editor/<template_id>', methods=['DELETE'])
def editor_delete_template(template_id):
    """Delete a template."""
    try:
        from backend.infra.template_persistence import TemplatePersistence
        persistence = TemplatePersistence()
        
        try:
            persistence.delete_template(template_id)
            return jsonify({
                'success': True,
                'message': f'Template "{template_id}" deleted successfully'
            }), 200
        except FileNotFoundError:
            return jsonify({
                'error': {
                    'code': 'NOT_FOUND',
                    'message': f'Template not found: {template_id}'
                }
            }), 404
    except Exception as e:
        logger.error(f"[API] Error deleting template {template_id}: {e}")
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Failed to delete template'
            }
        }), 500


@api_bp.route('/templates/editor/<template_id>/validate', methods=['POST'])
def editor_validate_template(template_id):
    """Validate a template."""
    try:
        from backend.infra.template_persistence import TemplatePersistence
        persistence = TemplatePersistence()
        
        data = request.get_json()
        if not data:
            return jsonify({
                'error': {
                    'code': 'INVALID_REQUEST',
                    'message': 'No JSON body provided'
                }
            }), 400
        
        errors = persistence.validate_template(data)
        
        return jsonify({
            'is_valid': len(errors) == 0,
            'errors': errors
        }), 200
    except Exception as e:
        logger.error(f"[API] Error validating template: {e}")
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Failed to validate template'
            }
        }), 500


@api_bp.route('/sessions/<session_id>/orphaned-nodes', methods=['GET'])
def get_orphaned_nodes(session_id):
    """Get all orphaned nodes for a session."""
    try:
        orphan_mgr = OrphanManager()
        
        # Get session data
        session_data = GraphService.get_session(session_id)
        if not session_data:
            return jsonify({
                'error': {
                    'code': 'SESSION_NOT_FOUND',
                    'message': f'Session not found: {session_id}'
                }
            }), 404
        
        # Get orphaned nodes
        graph = session_data.get('graph', {})
        orphaned_nodes = orphan_mgr.get_orphaned_nodes(graph)
        
        return jsonify({
            'session_id': session_id,
            'orphaned_nodes': orphaned_nodes,
            'count': len(orphaned_nodes)
        }), 200
        
    except Exception as e:
        logger.error(f"[API] Error getting orphaned nodes: {e}", exc_info=True)
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Failed to get orphaned nodes'
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
            from backend.handlers.commands.node_commands import CreateNodeCommand, DeleteNodeCommand, LinkNodeCommand, UpdatePropertyCommand, MoveNodeCommand, ReorderNodeCommand
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
                'MoveNode': MoveNodeCommand,
                'ReorderNode': ReorderNodeCommand,
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
            elif command_type == 'MoveNode':
                node_id = command_data.get('node_id')
                new_parent_id = command_data.get('new_parent_id')
                if not node_id or not new_parent_id:
                    return jsonify({
                        'error': {
                            'code': 'INVALID_COMMAND',
                            'message': 'MoveNode requires node_id and new_parent_id'
                        }
                    }), 400
                try:
                    command = MoveNodeCommand(
                        node_id=UUID(node_id),
                        new_parent_id=UUID(new_parent_id),
                        graph=graph,
                        blueprint=session_data.get('blueprint'),
                        session_id=session_id,
                    )
                    dispatcher.execute(command)
                except ValueError as e:
                    return jsonify({
                        'error': {
                            'code': 'MOVE_INVALID',
                            'message': str(e)
                        }
                    }), 400
            elif command_type == 'ReorderNode':
                node_id = command_data.get('node_id')
                new_index = command_data.get('new_index')
                if node_id is None or new_index is None:
                    return jsonify({
                        'error': {
                            'code': 'INVALID_COMMAND',
                            'message': 'ReorderNode requires node_id and new_index'
                        }
                    }), 400
                try:
                    command = ReorderNodeCommand(
                        node_id=UUID(node_id),
                        new_index=int(new_index),
                        graph=graph,
                        session_id=session_id,
                    )
                    dispatcher.execute(command)
                except Exception as e:
                    return jsonify({
                        'error': {
                            'code': 'REORDER_INVALID',
                            'message': str(e)
                        }
                    }), 400
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
    """Convert ProjectGraph to JSON-serializable dict with indicator metadata and schema enrichment.
    
    Args:
        graph: ProjectGraph to serialize
        blueprint: Optional Blueprint definition for schema enrichment
    """
    # get_indicator_metadata is now a top-level function
    
    def get_allowed_children(node_type_id: str) -> list:
        """Get allowed_children from blueprint schema for a node type, with logging."""
        import logging
        logger = logging.getLogger("talus.api.routes")
        logger.info(f"[get_allowed_children] node_type_id={node_type_id} blueprint={blueprint}")
        if not blueprint:
            logger.warning(f"[get_allowed_children] blueprint is None!")
            return []
        logger.info(f"[get_allowed_children] blueprint._node_type_map keys: {list(blueprint._node_type_map.keys())}")
        node_type_def = blueprint._node_type_map.get(node_type_id)
        logger.info(f"[get_allowed_children] node_type_def={node_type_def}")
        if not node_type_def:
            logger.warning(f"[get_allowed_children] node_type_def not found for {node_type_id}")
            return []
        allowed = node_type_def.allowed_children or []
        logger.info(f"[get_allowed_children] returning allowed_children={allowed}")
        return allowed
    
    markup_registry = MarkupRegistry()
    markup_parser = MarkupParser()

    def serialize_node(node, visited=None, ancestry=None):
        if visited is None:
            visited = set()
        if ancestry is None:
            ancestry = []
        
        node_id = str(node.id)
        if node_id in visited:
            print(f"[serialize_node] Cycle detected at node {node_id}, ancestry: {ancestry}")
            return {
                'id': node_id,
                'blueprint_type_id': node.blueprint_type_id,
                'name': node.name,
                'properties': node.properties,
                'children': [],
                'indicator': None,
                'indicator_id': None,
                'indicator_set': None,
                'icon_id': get_node_icon(node, blueprint),
                'allowed_children': get_allowed_children(node.blueprint_type_id),
                'cycle_warning': True
            }
        
        # Create a new visited set for this branch that includes current node
        branch_visited = visited | {node_id}
        new_ancestry = ancestry + [node_id]
        
        print(f"[DEBUG][serialize_node] node={node} type(node)={type(node)}")
        # Get child nodes
        child_nodes = []
        for child_id in getattr(node, 'children', []):
            print(f"[DEBUG][serialize_node] child_id={child_id} type(child_id)={type(child_id)}")
            child = graph.nodes.get(child_id)
            print(f"[DEBUG][serialize_node] child={child} type(child)={type(child)}")
            if child is not None:
                child_nodes.append(child)
            else:
                print(f"[WARN][serialize_node] Skipping orphaned child_id={child_id} (parent={node_id})")
        node_data = {
            'id': node_id,
            'blueprint_type_id': node.blueprint_type_id,
            'name': node.name,
            'properties': node.properties,
            'children': [serialize_node(child, branch_visited, new_ancestry) for child in child_nodes]
        }

        if blueprint:
            node_type_def = blueprint._node_type_map.get(node.blueprint_type_id)
            if node_type_def:
                prop_defs = node_type_def._extra_props.get('properties', [])
                property_markup = {}
                for prop_def in prop_defs:
                    if prop_def.get('type') != 'editor':
                        continue
                    prop_id = prop_def.get('id') or prop_def.get('name')
                    if not prop_id:
                        continue
                    markup_def = resolve_markup_definition(prop_def, markup_registry)
                    if not markup_def:
                        continue
                    raw_value = node.properties.get(prop_id, '')
                    parsed = markup_parser.parse(str(raw_value), markup_def)
                    property_markup[prop_id] = {
                        'profile_id': markup_def.get('id'),
                        'blocks': parsed.get('blocks', [])
                    }
                if property_markup:
                    node_data['property_markup'] = property_markup
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
        # Add allowed_children from schema
        node_data['allowed_children'] = get_allowed_children(node.blueprint_type_id)
        print(f"[serialize_node] id={node_id} type={node.blueprint_type_id} allowed_children={node_data['allowed_children']} status={node.properties.get('status')} indicator_id={node_data['indicator_id']} indicator_set={node_data['indicator_set']}")
        return node_data

    return {
        'roots': [serialize_node(root) for root in graph.roots]
    }


# Config endpoints

@api_bp.route('/config/icons', methods=['GET'])
def get_icons_config():
    """Get the icons catalog configuration with API URLs for accessing icons."""
    try:
        import yaml
        from pathlib import Path
        
        # Find the icons catalog file
        assets_icons_dir = Path(__file__).parent.parent.parent / 'assets' / 'icons'
        catalog_file = assets_icons_dir / 'catalog.yaml'
        
        if not catalog_file.exists():
            logger.warning(f"Icons catalog not found at {catalog_file}")
            return jsonify({
                'error': {
                    'code': 'CATALOG_NOT_FOUND',
                    'message': 'Icons catalog not found'
                }
            }), 404
        
        with open(catalog_file, 'r') as f:
            catalog_data = yaml.safe_load(f)
        
        # Enhance icon data with API URL
        icons = catalog_data.get('icons', [])
        for icon in icons:
            icon['url'] = f'/api/v1/assets/icons/{icon["id"]}'
        
        return jsonify({
            'icons': icons
        }), 200
        
    except Exception as e:
        logger.error(f"Error loading icons catalog: {e}", exc_info=True)
        return jsonify({
            'error': {
                'code': 'CATALOG_ERROR',
                'message': f'Failed to load icons catalog: {str(e)}'
            }
        }), 500


@api_bp.route('/config/indicators', methods=['GET'])
def get_indicators_config():
    """Get the indicators catalog configuration with API URLs for accessing indicator files."""
    try:
        import yaml
        from pathlib import Path
        
        # Find the indicators catalog file
        assets_indicators_dir = Path(__file__).parent.parent.parent / 'assets' / 'indicators'
        catalog_file = assets_indicators_dir / 'catalog.yaml'
        
        if not catalog_file.exists():
            logger.warning(f"Indicators catalog not found at {catalog_file}")
            return jsonify({
                'error': {
                    'code': 'CATALOG_NOT_FOUND',
                    'message': 'Indicators catalog not found'
                }
            }), 404
        
        with open(catalog_file, 'r') as f:
            catalog_data = yaml.safe_load(f)
        
        # Enhance indicator data with API URLs
        indicator_sets = catalog_data.get('indicator_sets', {})
        for set_key, set_def in indicator_sets.items():
            for indicator in set_def.get('indicators', []):
                indicator['url'] = f'/api/v1/assets/indicators/{set_key}/{indicator["id"]}'
        
        return jsonify({
            'indicator_sets': indicator_sets
        }), 200
        
    except Exception as e:
        logger.error(f"Error loading indicators catalog: {e}", exc_info=True)
        return jsonify({
            'error': {
                'code': 'CATALOG_ERROR',
                'message': f'Failed to load indicators catalog: {str(e)}'
            }
        }), 500


@api_bp.route('/assets/icons/<icon_id>', methods=['GET'])
def get_icon_file(icon_id: str):
    """Get an individual icon SVG file."""
    try:
        from pathlib import Path
        
        # Sanitize the icon_id to prevent path traversal
        if '..' in icon_id or '/' in icon_id:
            return jsonify({'error': 'Invalid icon ID'}), 400
        
        assets_icons_dir = Path(__file__).parent.parent.parent / 'assets' / 'icons'
        icon_file = assets_icons_dir / f'{icon_id}.svg'
        
        if not icon_file.exists():
            return jsonify({'error': 'Icon not found'}), 404
        
        with open(icon_file, 'r') as f:
            svg_content = f.read()
        
        return svg_content, 200, {'Content-Type': 'image/svg+xml'}
        
    except Exception as e:
        logger.error(f"Error loading icon file: {e}", exc_info=True)
        return jsonify({'error': 'Failed to load icon'}), 500


@api_bp.route('/assets/indicators/<set_id>/<indicator_id>', methods=['GET'])
def get_indicator_file(set_id: str, indicator_id: str):
    """Get an individual indicator SVG file."""
    try:
        from pathlib import Path
        import yaml
        
        # Sanitize to prevent path traversal
        if '..' in set_id or '/' in set_id or '..' in indicator_id or '/' in indicator_id:
            return jsonify({'error': 'Invalid indicator ID'}), 400
        
        assets_indicators_dir = Path(__file__).parent.parent.parent / 'assets' / 'indicators'
        
        # Load catalog to find the actual filename for this indicator
        catalog_file = assets_indicators_dir / 'catalog.yaml'
        with open(catalog_file, 'r') as f:
            catalog_data = yaml.safe_load(f)
        
        indicator_set = catalog_data.get('indicator_sets', {}).get(set_id, {})
        indicators = indicator_set.get('indicators', [])
        
        # Find the indicator with matching id
        target_indicator = None
        for ind in indicators:
            if ind.get('id') == indicator_id:
                target_indicator = ind
                break
        
        if not target_indicator:
            return jsonify({'error': 'Indicator not found in catalog'}), 404
        
        # Use the filename from the catalog
        indicator_filename = target_indicator.get('file')
        if not indicator_filename:
            return jsonify({'error': 'Indicator file not specified'}), 400
        
        indicator_file = assets_indicators_dir / indicator_filename
        
        if not indicator_file.exists():
            return jsonify({'error': f'Indicator file not found: {indicator_filename}'}), 404
        
        with open(indicator_file, 'r') as f:
            svg_content = f.read()
        
        return svg_content, 200, {'Content-Type': 'image/svg+xml'}
        
    except Exception as e:
        logger.error(f"Error loading indicator file: {e}", exc_info=True)
        return jsonify({'error': 'Failed to load indicator'}), 500


def register_routes(app):
    """Register all API routes with Flask app."""
    app.register_blueprint(api_bp)


@api_bp.route('/session/<session_id>/migrations/status', methods=['GET'])
def get_migration_status(session_id):
    """Get migration status for current session.
    
    Returns info about template version mismatch and available migrations.
    """
    session_data = _get_session_data(session_id)
    if not session_data:
        return jsonify({
            'error': {
                'code': 'SESSION_NOT_FOUND',
                'message': f'Session {session_id} not found'
            }
        }), 404
    
    try:
        graph = session_data.get('graph')
        blueprint = session_data.get('blueprint')
        template_id = session_data.get('template_id')
        
        if not graph or not blueprint:
            return jsonify({
                'status': 'no_migration_needed',
                'message': 'No graph or blueprint loaded'
            }), 200
        
        current_version = blueprint.version if hasattr(blueprint, 'version') else '0.1.0'
        saved_version = graph.template_version or '0.1.0'
        
        if saved_version == current_version:
            return jsonify({
                'status': 'up_to_date',
                'saved_version': saved_version,
                'current_version': current_version,
                'template_id': template_id
            }), 200
        
        # Check if migration path exists
        try:
            from backend.infra.project_talus_migrations import registry as migrations_registry
            migrations = migrations_registry.get_migration_path(saved_version, current_version)
            
            return jsonify({
                'status': 'migration_available',
                'saved_version': saved_version,
                'current_version': current_version,
                'template_id': template_id,
                'migration_count': len(migrations),
                'migration_path': [f"{m.from_version} -> {m.to_version}" for m in migrations]
            }), 200
        except Exception as e:
            return jsonify({
                'status': 'migration_not_available',
                'saved_version': saved_version,
                'current_version': current_version,
                'error': str(e)
            }), 200
            
    except Exception as e:
        logger.error(f"[API] Failed to get migration status: {e}", exc_info=True)
        return jsonify({
            'error': {
                'code': 'STATUS_CHECK_FAILED',
                'message': f'Failed to check migration status: {str(e)}'
            }
        }), 500


@api_bp.route('/session/<session_id>/migrations/apply', methods=['POST'])
def apply_migrations(session_id):
    """Apply pending migrations to the current session.
    
    Migrates the graph from saved template version to current version.
    """
    session_data = _get_session_data(session_id)
    if not session_data:
        return jsonify({
            'error': {
                'code': 'SESSION_NOT_FOUND',
                'message': f'Session {session_id} not found'
            }
        }), 404
    
    try:
        graph = session_data.get('graph')
        blueprint = session_data.get('blueprint')
        template_id = session_data.get('template_id')
        
        if not graph or not blueprint:
            return jsonify({
                'error': {
                    'code': 'INCOMPLETE_SESSION',
                    'message': 'Graph or blueprint not loaded'
                }
            }), 400
        
        current_version = blueprint.version if hasattr(blueprint, 'version') else '0.1.0'
        saved_version = graph.template_version or '0.1.0'
        
        if saved_version == current_version:
            return jsonify({
                'status': 'already_up_to_date',
                'version': current_version
            }), 200
        
        # Apply migrations
        try:
            from backend.infra.project_talus_migrations import registry as migrations_registry
            success, messages = migrations_registry.apply_migrations(
                graph,
                from_version=saved_version,
                to_version=current_version
            )
            
            if success:
                graph.template_version = current_version
                session_data['template_version'] = current_version
                _mark_session_dirty(session_id)
                logger.info(f"[API] Migration successful for session {session_id}")
                
                return jsonify({
                    'status': 'migration_successful',
                    'from_version': saved_version,
                    'to_version': current_version,
                    'messages': messages
                }), 200
            else:
                logger.warning(f"[API] Migration failed for session {session_id}: {messages}")
                return jsonify({
                    'status': 'migration_failed',
                    'from_version': saved_version,
                    'to_version': current_version,
                    'messages': messages
                }), 400
                
        except Exception as e:
            logger.error(f"[API] Migration error: {e}", exc_info=True)
            return jsonify({
                'error': {
                    'code': 'MIGRATION_ERROR',
                    'message': f'Migration failed: {str(e)}'
                }
            }), 500
            
    except Exception as e:
        logger.error(f"[API] Failed to apply migrations: {e}", exc_info=True)
        return jsonify({
            'error': {
                'code': 'APPLY_FAILED',
                'message': f'Failed to apply migrations: {str(e)}'
            }
        }), 500
