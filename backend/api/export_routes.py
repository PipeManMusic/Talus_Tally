"""
Export API routes for downloading project data in various formats.

Provides REST endpoints for:
- Listing available export templates
- Downloading project data rendered through templates
"""

import logging
from flask import Blueprint, request, jsonify, Response
from uuid import UUID
from typing import Dict, Any, List

from backend.core.export_engine import ExportEngine

logger = logging.getLogger(__name__)

# Create blueprint with /api/export prefix
export_bp = Blueprint('export', __name__, url_prefix='/api/export')

# Initialize export engine
_export_engine = None


def get_export_engine() -> ExportEngine:
    """Get or create the global export engine instance."""
    global _export_engine
    if _export_engine is None:
        _export_engine = ExportEngine()
    return _export_engine


@export_bp.route('/list', methods=['GET'])
def list_templates():
    """
    Get list of available export templates.
    
    Returns:
        JSON array of template metadata:
        [{
            "id": "kdenlive_session.xml.j2",
            "name": "Kdenlive Session XML",
            "extension": "xml"
        }, ...]
    """
    try:
        engine = get_export_engine()
        templates = engine.get_templates()
        
        return jsonify({
            'templates': templates,
            'count': len(templates)
        }), 200
        
    except Exception as e:
        logger.error(f"[EXPORT] Failed to list templates: {e}", exc_info=True)
        return jsonify({
            'error': {
                'code': 'LIST_FAILED',
                'message': f'Failed to list templates: {str(e)}'
            }
        }), 500


@export_bp.route('/<session_id>/download', methods=['POST'])
def download_export(session_id):
    """
    Download project data rendered through a template.
    
    Args:
        session_id: The session ID containing the project data
        
    Request Body (JSON):
        {
            "template_id": "kdenlive_session.xml.j2",
            "context": {  // optional additional context data
                "project_name": "My Project",
                "custom_field": "value"
            }
        }
    
    Returns:
        Response with rendered template as downloadable file
    """
    # Import here to avoid circular dependency
    from backend.api.routes import _get_session_data
    
    try:
        # Get session data
        session_data = _get_session_data(session_id)
        if not session_data:
            return jsonify({
                'error': {
                    'code': 'SESSION_NOT_FOUND',
                    'message': f'Session {session_id} not found'
                }
            }), 404
        
        # Get graph from session
        graph = session_data.get('graph')
        if not graph:
            return jsonify({
                'error': {
                    'code': 'NO_GRAPH',
                    'message': 'No graph loaded in session'
                }
            }), 400
        
        # Parse request body
        body = request.get_json()
        if not body:
            return jsonify({
                'error': {
                    'code': 'INVALID_REQUEST',
                    'message': 'Request body must be JSON'
                }
            }), 400
        
        template_id = body.get('template_id')
        if not template_id:
            return jsonify({
                'error': {
                    'code': 'MISSING_TEMPLATE_ID',
                    'message': 'template_id is required'
                }
            }), 400
        
        user_context = body.get('context', {})
        
        # Build status label map from blueprint if available
        status_label_map: Dict[str, str] = {}
        blueprint = session_data.get('blueprint')
        if blueprint and hasattr(blueprint, 'node_types'):
            for node_type in blueprint.node_types:
                properties = []
                if hasattr(node_type, '_extra_props') and isinstance(node_type._extra_props, dict):
                    properties = node_type._extra_props.get('properties', [])
                elif hasattr(node_type, 'properties'):
                    properties = node_type.properties or []
                status_prop = next((p for p in properties if p.get('id') == 'status'), None)
                if not status_prop:
                    continue
                for option in status_prop.get('options', []) or []:
                    option_id = option.get('id')
                    option_name = option.get('name')
                    if option_id and option_name:
                        status_label_map[str(option_id)] = option_name

        # Flatten graph nodes into list of dicts
        nodes = []
        for node_id, node in graph.nodes.items():
            status_value = node.properties.get('status', 'unknown')
            status_label = status_label_map.get(str(status_value), status_value)
            node_dict = {
                'id': str(node.id),
                'name': node.name,
                'type': node.blueprint_type_id,
                'properties': node.properties,
                'status': status_value,
                'status_label': status_label,
                'created_at': node.created_at.isoformat() if hasattr(node, 'created_at') else None,
                'parent_id': str(node.parent_id) if node.parent_id else None,
                'children': [str(child_id) for child_id in node.children] if hasattr(node, 'children') else []
            }
            nodes.append(node_dict)
        
        # Build template context
        project_id = session_data.get('current_project_id', 'unknown')
        blueprint_version = None
        if blueprint and hasattr(blueprint, 'version'):
            blueprint_version = blueprint.version
        template_version = blueprint_version or (graph.template_version if hasattr(graph, 'template_version') else None)
        blocking_relationships = session_data.get('blocking_relationships', [])

        velocity_nodes = []
        try:
            from backend.core.velocity_engine import VelocityEngine
            from backend.api.velocity_routes import _get_velocity_context

            graph_nodes, schema, blocking_graph = _get_velocity_context(session_id)
            if graph_nodes and schema:
                engine = VelocityEngine(graph_nodes, schema, blocking_graph)
                ranking = engine.get_ranking()
                for node_id, calc in ranking:
                    node = graph_nodes.get(node_id, {})
                    if not node or node == {}:
                        try:
                            node = graph_nodes.get(UUID(node_id), {})
                        except (ValueError, KeyError):
                            node = {}
                    if hasattr(node, 'properties'):
                        node_name = node.properties.get('name', 'Unnamed')
                        node_type = node.blueprint_type_id if hasattr(node, 'blueprint_type_id') else 'unknown'
                        status_value = node.properties.get('status')
                    else:
                        node_name = node.get('properties', {}).get('name', 'Unnamed')
                        node_type = node.get('type', 'unknown')
                        status_value = node.get('properties', {}).get('status')
                    status_label = status_label_map.get(str(status_value), status_value)
                    velocity_nodes.append({
                        'nodeId': str(node_id),
                        'nodeName': node_name,
                        'nodeType': node_type,
                        'status': status_value,
                        'statusLabel': status_label,
                        'baseScore': calc.base_score,
                        'inheritedScore': calc.inherited_score,
                        'statusScore': calc.status_score,
                        'numericalScore': calc.numerical_score,
                        'blockingPenalty': calc.blocking_penalty,
                        'blockingBonus': calc.blocking_bonus,
                        'totalVelocity': calc.total_velocity,
                        'isBlocked': calc.is_blocked,
                        'blockedByNodes': calc.blocked_by_nodes,
                        'blocksNodeIds': calc.blocks_node_ids,
                    })
        except Exception as velocity_error:
            logger.warning(f"[EXPORT] Velocity data unavailable: {velocity_error}")
        
        from datetime import datetime

        context = {
            'nodes': nodes,
            'project_id': project_id,
            'template_id': graph.template_id if hasattr(graph, 'template_id') else None,
            'template_version': template_version,
            'node_count': len(nodes),
            'generated_date': datetime.now().date().isoformat(),
            'blocking_relationships': blocking_relationships,
            'velocity_nodes': velocity_nodes,
            # Include user-provided context (can override defaults)
            **user_context
        }
        
        # Render template
        engine = get_export_engine()
        try:
            rendered_content = engine.render(template_id, context)
        except Exception as render_error:
            logger.error(f"[EXPORT] Template rendering failed: {render_error}", exc_info=True)
            return jsonify({
                'error': {
                    'code': 'RENDER_FAILED',
                    'message': f'Failed to render template: {str(render_error)}'
                }
            }), 500
        
        # Generate output filename
        output_filename = engine.get_output_filename(template_id, project_id)
        
        # Determine MIME type based on file extension
        extension = output_filename.split('.')[-1].lower()
        mime_types = {
            'xml': 'application/xml',
            'csv': 'text/csv',
            'html': 'text/html',
            'json': 'application/json',
            'txt': 'text/plain'
        }
        mime_type = mime_types.get(extension, 'application/octet-stream')
        
        # Create response with download headers
        response = Response(
            rendered_content,
            mimetype=mime_type,
            headers={
                'Content-Disposition': f'attachment; filename="{output_filename}"',
                'Content-Type': mime_type
            }
        )
        
        logger.info(f"[EXPORT] Generated export: {output_filename} ({len(rendered_content)} bytes)")
        return response
        
    except Exception as e:
        logger.error(f"[EXPORT] Download failed: {e}", exc_info=True)
        return jsonify({
            'error': {
                'code': 'DOWNLOAD_FAILED',
                'message': f'Failed to generate download: {str(e)}'
            }
        }), 500
