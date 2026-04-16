"""
Export API routes for downloading project data in various formats.

Provides REST endpoints for:
- Listing available export templates
- Downloading project data rendered through templates
"""

import logging
from flask import Blueprint, request, jsonify, Response
from uuid import UUID
from typing import Dict, Any, List, Optional, Set

from backend.core.export_engine import ExportEngine

logger = logging.getLogger(__name__)

# Create blueprint with /api/export prefix
export_bp = Blueprint('export', __name__, url_prefix='/api/export')

# Initialize export engine
_export_engine = None


def _coerce_reference_value(value: Any, node_name_by_id: Dict[str, str]) -> Any:
    if isinstance(value, list):
        return [_coerce_reference_value(item, node_name_by_id) for item in value]
    if isinstance(value, tuple):
        return [_coerce_reference_value(item, node_name_by_id) for item in value]
    if isinstance(value, set):
        return [_coerce_reference_value(item, node_name_by_id) for item in value]
    if isinstance(value, str):
        return node_name_by_id.get(value, value)
    return value


def _resolve_properties(
    raw_properties: Dict[str, Any],
    node_type_id: str,
    property_uuid_maps: Dict[str, Dict[str, str]],
    property_defs_by_type: Dict[str, Dict[str, Dict[str, Any]]],
    option_label_maps: Dict[str, Dict[str, Dict[str, str]]],
    node_name_by_id: Dict[str, str],
) -> Dict[str, Any]:
    if not isinstance(raw_properties, dict):
        return {}

    reverse_map = {
        uuid_key: property_key
        for property_key, uuid_key in property_uuid_maps.get(node_type_id, {}).items()
    }
    normalized: Dict[str, Any] = {}

    for raw_key, raw_value in raw_properties.items():
        property_key = str(reverse_map.get(raw_key, raw_key))
        property_def = property_defs_by_type.get(node_type_id, {}).get(property_key, {})
        option_labels = option_label_maps.get(node_type_id, {}).get(property_key, {})

        value = raw_value
        if option_labels:
            if isinstance(raw_value, list):
                value = [option_labels.get(str(item), item) for item in raw_value]
            else:
                value = option_labels.get(str(raw_value), raw_value)
        elif property_def.get('type') in {'node_ref', 'node_refs', 'relationship', 'person_ref'}:
            value = _coerce_reference_value(raw_value, node_name_by_id)
        elif property_key == 'assigned_to':
            value = _coerce_reference_value(raw_value, node_name_by_id)

        normalized[property_key] = value

    return normalized


def _build_node_path(node_dict: Dict[str, Any], node_by_id: Dict[str, Dict[str, Any]]) -> str:
    names: List[str] = []
    current = node_dict
    visited: Set[str] = set()

    while current:
        current_id = str(current.get('id') or '')
        if current_id in visited:
            break
        visited.add(current_id)

        current_name = str(current.get('name') or '').strip()
        if current_name:
            names.append(current_name)

        parent_id = current.get('parent_id')
        if not parent_id:
            break
        current = node_by_id.get(str(parent_id))

    names.reverse()
    return ' / '.join(names)


def _is_task_like(node_dict: Dict[str, Any]) -> bool:
    type_key = str(node_dict.get('type_key') or '').lower()
    type_label = str(node_dict.get('type_label') or '').lower()
    props = node_dict.get('properties') or {}

    if type_key == 'task' or type_label == 'task':
        return True

    taskish_fields = {'status', 'assigned_to', 'estimated_hours', 'start_date', 'end_date', 'notes', 'description'}
    return len(taskish_fields & set(props.keys())) >= 3


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
            "root_node_id": "uuid-string",            // optional
            "included_node_ids": ["uuid-1", "uuid-2"], // optional
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
        root_node_id = body.get('root_node_id')
        included_node_ids_raw = body.get('included_node_ids')

        if root_node_id is not None and not isinstance(root_node_id, str):
            return jsonify({
                'error': {
                    'code': 'INVALID_ROOT_NODE_ID',
                    'message': 'root_node_id must be a string when provided'
                }
            }), 400

        included_node_ids: Optional[List[str]] = None
        if included_node_ids_raw is not None:
            if not isinstance(included_node_ids_raw, list) or not all(isinstance(item, str) for item in included_node_ids_raw):
                return jsonify({
                    'error': {
                        'code': 'INVALID_INCLUDED_NODE_IDS',
                        'message': 'included_node_ids must be an array of strings when provided'
                    }
                }), 400
            included_node_ids = included_node_ids_raw
        
        # Build schema lookup maps from blueprint if available
        status_label_map: Dict[str, str] = {}
        status_prop_uuid_map: Dict[str, str] = {}
        property_uuid_maps: Dict[str, Dict[str, str]] = {}
        property_defs_by_type: Dict[str, Dict[str, Dict[str, Any]]] = {}
        option_label_maps: Dict[str, Dict[str, Dict[str, str]]] = {}
        type_label_map: Dict[str, str] = {}
        blueprint = session_data.get('blueprint')
        if blueprint and hasattr(blueprint, 'build_all_property_uuid_maps'):
            property_uuid_maps = blueprint.build_all_property_uuid_maps()
        if blueprint and hasattr(blueprint, 'node_types'):
            for node_type in blueprint.node_types:
                properties = []
                if hasattr(node_type, '_extra_props') and isinstance(node_type._extra_props, dict):
                    properties = node_type._extra_props.get('properties', [])
                elif hasattr(node_type, 'properties'):
                    properties = node_type.properties or []
                type_label_map[node_type.uuid] = getattr(node_type, 'label', None) or getattr(node_type, 'id', None) or node_type.uuid
                type_property_defs: Dict[str, Dict[str, Any]] = {}
                type_option_labels: Dict[str, Dict[str, str]] = {}
                for prop in properties:
                    prop_key = str(prop.get('key') or prop.get('id') or prop.get('uuid') or '')
                    if not prop_key:
                        continue
                    type_property_defs[prop_key] = prop
                    option_labels: Dict[str, str] = {}
                    for option in prop.get('options', []) or []:
                        option_id = option.get('id')
                        option_name = option.get('name')
                        if option_id and option_name:
                            option_labels[str(option_id)] = option_name
                    if option_labels:
                        type_option_labels[prop_key] = option_labels
                property_defs_by_type[node_type.uuid] = type_property_defs
                option_label_maps[node_type.uuid] = type_option_labels
                status_prop = next((p for p in properties if p.get('id') == 'status'), None)
                if not status_prop:
                    continue
                if status_prop.get('uuid') and node_type.uuid:
                    status_prop_uuid_map[node_type.uuid] = status_prop['uuid']
                for option in status_prop.get('options', []) or []:
                    option_id = option.get('id')
                    option_name = option.get('name')
                    if option_id and option_name:
                        status_label_map[str(option_id)] = option_name

        # Build UUID-to-key map for export templates that use human-readable type names
        uuid_to_key: Dict[str, str] = {}
        if blueprint and hasattr(blueprint, 'node_types'):
            for nt in blueprint.node_types:
                if nt.uuid and nt.id:
                    uuid_to_key[nt.uuid] = nt.id

        node_name_by_id = {
            str(node.id): node.name
            for node in graph.nodes.values()
            if hasattr(node, 'id') and hasattr(node, 'name')
        }

        # Flatten graph nodes into list of dicts
        nodes = []
        for node_id, node in graph.nodes.items():
            status_key = status_prop_uuid_map.get(node.blueprint_type_id, 'status')
            status_value = node.properties.get(status_key, 'unknown')
            status_label = status_label_map.get(str(status_value), status_value)
            type_key = uuid_to_key.get(node.blueprint_type_id, node.blueprint_type_id)
            resolved_properties = _resolve_properties(
                node.properties,
                node.blueprint_type_id,
                property_uuid_maps,
                property_defs_by_type,
                option_label_maps,
                node_name_by_id,
            )
            node_dict = {
                'id': str(node.id),
                'name': node.name,
                'type': node.blueprint_type_id,
                'type_key': type_key,
                'type_label': type_label_map.get(node.blueprint_type_id, type_key),
                'properties': resolved_properties,
                'raw_properties': node.properties,
                'status': status_value,
                'status_label': status_label,
                'created_at': node.created_at.isoformat() if hasattr(node, 'created_at') else None,
                'parent_id': str(node.parent_id) if node.parent_id else None,
                'children': [str(child_id) for child_id in node.children] if hasattr(node, 'children') else []
            }
            nodes.append(node_dict)

        node_by_id: Dict[str, Dict[str, Any]] = {str(node['id']): node for node in nodes}
        for node_dict in nodes:
            parent = node_by_id.get(str(node_dict.get('parent_id'))) if node_dict.get('parent_id') else None
            node_dict['parent_name'] = parent.get('name') if parent else ''
            node_dict['path'] = _build_node_path(node_dict, node_by_id)
            node_dict['is_task_like'] = _is_task_like(node_dict)
        
        # Apply export filters (branch root and/or explicit included node ids)
        export_engine = get_export_engine()
        nodes = export_engine.filter_nodes(
            nodes,
            root_node_id=root_node_id,
            included_node_ids=included_node_ids,
        )
        filtered_node_ids: Set[str] = {str(node['id']) for node in nodes}

        # Build template context
        project_id = session_data.get('current_project_id', 'unknown')
        blueprint_version = None
        if blueprint and hasattr(blueprint, 'version'):
            blueprint_version = blueprint.version
        template_version = blueprint_version or (graph.template_version if hasattr(graph, 'template_version') else None)
        blocking_relationships = session_data.get('blocking_relationships', [])
        if filtered_node_ids:
            blocking_relationships = [
                edge for edge in blocking_relationships
                if str(edge.get('blockedNodeId')) in filtered_node_ids and str(edge.get('blockingNodeId')) in filtered_node_ids
            ]

        velocity_nodes = []
        try:
            from backend.core.velocity_engine import VelocityEngine
            from backend.api.velocity_routes import _get_velocity_context

            graph_nodes, schema, blocking_graph = _get_velocity_context(session_id)
            if graph_nodes and schema:
                velocity_engine = VelocityEngine(graph_nodes, schema, blocking_graph)
                ranking = velocity_engine.get_ranking()
                for node_id, calc in ranking:
                    node = graph_nodes.get(node_id, {})
                    if not node or node == {}:
                        try:
                            node = graph_nodes.get(UUID(node_id), {})
                        except (ValueError, KeyError):
                            node = {}
                    if hasattr(node, 'name'):
                        node_name = node.name or 'Unnamed'
                        node_type = node.blueprint_type_id if hasattr(node, 'blueprint_type_id') else 'unknown'
                        s_key = status_prop_uuid_map.get(node_type, 'status') if hasattr(node, 'properties') else 'status'
                        status_value = node.properties.get(s_key) if hasattr(node, 'properties') else None
                    else:
                        node_name = node.get('name', 'Unnamed')
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

        if filtered_node_ids:
            velocity_nodes = [entry for entry in velocity_nodes if str(entry.get('nodeId')) in filtered_node_ids]
        
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
        try:
            rendered_content = export_engine.render(template_id, context)
        except Exception as render_error:
            logger.error(f"[EXPORT] Template rendering failed: {render_error}", exc_info=True)
            return jsonify({
                'error': {
                    'code': 'RENDER_FAILED',
                    'message': f'Failed to render template: {str(render_error)}'
                }
            }), 500
        
        # Generate output filename
        output_filename = export_engine.get_output_filename(template_id, project_id)
        
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
