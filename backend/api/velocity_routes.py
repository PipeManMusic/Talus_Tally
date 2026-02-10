"""
Velocity API Routes

Endpoints:
- GET /api/v1/sessions/{id}/velocity - Get all velocity scores
- GET /api/v1/sessions/{id}/nodes/{id}/velocity - Get single node velocity
- POST /api/v1/sessions/{id}/nodes/{id}/blocking - Update blocking relationship
- GET /api/v1/sessions/{id}/blocking-graph - Get all blocking relationships
"""

from flask import Blueprint, jsonify, request, current_app
from typing import Optional, Dict, Any
from uuid import UUID
import logging
from backend.handlers.commands.velocity_commands import UpdateBlockingRelationshipCommand

velocity_bp = Blueprint('velocity', __name__, url_prefix='/api/v1')
logger = logging.getLogger(__name__)


def _convert_node_id(node_id_str: str) -> Optional[UUID]:
    """Convert string node_id from URL to UUID."""
    try:
        return UUID(node_id_str)
    except (ValueError, TypeError):
        return None


def _convert_blueprint_to_schema(blueprint) -> Optional[Dict]:
    """Convert Blueprint object to schema dict for VelocityEngine."""
    if not blueprint:
        return None
    
    # If it's already a dict, return it
    if isinstance(blueprint, dict):
        return blueprint
    
    # If it's a Blueprint object, build a schema dict from it
    if hasattr(blueprint, 'node_types'):
        schema = {'node_types': []}
        for node_type in blueprint.node_types:
            nt_dict = {
                'id': node_type.id if hasattr(node_type, 'id') else str(node_type),
            }
            
            # Extract node-level velocityConfig if it exists
            if hasattr(node_type, '_extra_props') and isinstance(node_type._extra_props, dict):
                nt_dict['velocityConfig'] = node_type._extra_props.get('velocityConfig', {})
            elif hasattr(node_type, 'velocityConfig'):
                nt_dict['velocityConfig'] = node_type.velocityConfig
            
            # Extract properties with their velocity configs
            # Now NodeTypeDef preserves properties, so we can use them directly
            if hasattr(node_type, 'properties') and node_type.properties:
                nt_dict['properties'] = node_type.properties
            
            schema['node_types'].append(nt_dict)
        return schema
    
    # If we can't convert it, return None
    return None


def _get_velocity_context(session_id: str):
    """
    Extract velocity calculation context from session data.
    
    Returns: (graph_nodes, schema, blocking_relationships) or (None, None, None) if not found
    """
    from backend.api.routes import get_session_data
    
    session_data = get_session_data(session_id)
    if not session_data:
        return None, None, None
    
    graph = session_data.get('graph')
    if not graph:
        return None, None, None

    # Extract nodes dict from the graph object
    graph_nodes = graph.nodes if hasattr(graph, 'nodes') else {}

    schema = None

    template_id = None
    if hasattr(graph, 'template_id') and graph.template_id:
        template_id = graph.template_id
    elif session_data.get('template_id'):
        template_id = session_data.get('template_id')

    # Prefer session-cached velocity schema from reload-blueprint
    velocity_schema = session_data.get('velocity_schema')
    if isinstance(velocity_schema, dict) and velocity_schema.get('node_types'):
        schema = velocity_schema

    # Fall back to loading from disk to ensure option UUIDs and latest edits are applied
    if schema is None:
        if template_id:
            try:
                from backend.infra.schema_loader import SchemaLoader

                loader = SchemaLoader()
                blueprint = loader.load(f'{template_id}.yaml')
                schema = _convert_blueprint_to_schema(blueprint)
            except Exception as e:
                logger.error(f'Error loading schema from template: {e}')
                schema = None
        else:
            logger.warning('Velocity schema load skipped: no template_id available')

    # Final fallback to the in-session blueprint
    if schema is None:
        blueprint = session_data.get('blueprint')
        if blueprint:
            schema = _convert_blueprint_to_schema(blueprint)
    
    # Get blocking relationships from session metadata
    blocking_relationships = session_data.get('blocking_relationships', [])
    blocking_graph = {'relationships': blocking_relationships}
    
    return graph_nodes, schema, blocking_graph


@velocity_bp.route('/sessions/<session_id>/velocity', methods=['GET'])
def get_velocity_ranking(session_id: str):
    """
    Get velocity ranking for all nodes in session
    
    Returns nodes sorted by velocity score (highest first)
    """
    try:
        from backend.api.routes import get_session_data
        
        # Check if session exists
        session_data = get_session_data(session_id)
        if not session_data:
            return jsonify({'error': 'Session not found'}), 404
        
        # If no graph loaded, return empty ranking
        graph_nodes, schema, blocking_graph = _get_velocity_context(session_id)
        
        if graph_nodes is None:
            logger.debug(f'No graph found in session {session_id}')
            return jsonify({
                'nodes': [],
                'timestamp': int(__import__('time').time() * 1000),
            })
        
        logger.debug(f'Found {len(graph_nodes)} nodes in graph for session {session_id}')
        
        # Import and use velocity engine
        from backend.core.velocity_engine import VelocityEngine
        
        engine = VelocityEngine(graph_nodes, schema, blocking_graph)
        ranking = engine.get_ranking()
        
        logger.debug(f'Velocity ranking calculated: {len(ranking)} nodes')
        
        # Format response
        nodes = []
        filtered_count = 0
        for node_id, calc in ranking:
            if calc.total_velocity < 0:
                filtered_count += 1
                continue
            
            # Try both string and UUID keys (graph_nodes may use UUID objects as keys)
            node = graph_nodes.get(node_id, {})
            if not node or node == {}:
                try:
                    from uuid import UUID
                    node = graph_nodes.get(UUID(node_id), {})
                except (ValueError, KeyError):
                    node = {}
            
            # Get node properties safely
            if hasattr(node, 'properties'):
                node_name = node.properties.get('name', 'Unnamed')
                node_type = node.blueprint_type_id if hasattr(node, 'blueprint_type_id') else 'unknown'
            else:
                node_name = node.get('properties', {}).get('name', 'Unnamed')
                node_type = node.get('type', 'unknown')
            
            nodes.append({
                'nodeId': str(node_id),
                'nodeName': node_name,
                'nodeType': node_type,
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
        
        logger.info(f'Velocity ranking: {len(ranking)} total, {filtered_count} filtered (negative), {len(nodes)} returned')
        if len(nodes) > 0:
            logger.info(f'Top 5 nodes: {[{n["nodeName"]: n["totalVelocity"]} for n in nodes[:5]]}')
        
        return jsonify({
            'nodes': nodes,
            'timestamp': int(__import__('time').time() * 1000),
        })
    
    except Exception as e:
        logger.error(f'Error calculating velocity: {str(e)}')
        return jsonify({'error': f'Failed to calculate velocity: {str(e)}'}), 500


@velocity_bp.route('/sessions/<session_id>/nodes/<node_id>/velocity', methods=['GET'])
def get_node_velocity(session_id: str, node_id: str):
    """Get velocity score for a single node"""
    try:
        from backend.api.routes import get_session_data
        
        node_uuid = _convert_node_id(node_id)
        if not node_uuid:
            return jsonify({'error': 'Invalid node ID format'}), 400
        
        # Check if session exists
        session_data = get_session_data(session_id)
        if not session_data:
            return jsonify({'error': 'Session not found'}), 404
        
        graph_nodes, schema, blocking_graph = _get_velocity_context(session_id)
        
        if graph_nodes is None:
            return jsonify({'error': f'Node {node_id} not found'}), 404
        
        if node_uuid not in graph_nodes:
            return jsonify({'error': f'Node {node_id} not found'}), 404
        
        from backend.core.velocity_engine import VelocityEngine
        
        engine = VelocityEngine(graph_nodes, schema, blocking_graph)
        calc = engine.calculate_velocity(node_uuid)
        
        node = graph_nodes.get(node_uuid, {})
        
        # Get node properties safely
        if hasattr(node, 'properties'):
            node_name = node.properties.get('name', 'Unnamed')
            node_type = node.blueprint_type_id if hasattr(node, 'blueprint_type_id') else 'unknown'
        else:
            node_name = node.get('properties', {}).get('name', 'Unnamed')
            node_type = node.get('type', 'unknown')
        
        return jsonify({
            'nodeId': str(node_uuid),
            'nodeName': node_name,
            'nodeType': node_type,
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
    
    except Exception as e:
        logger.error(f'Error calculating node velocity: {str(e)}')
        return jsonify({'error': f'Failed to calculate node velocity: {str(e)}'}), 500


@velocity_bp.route('/sessions/<session_id>/nodes/<node_id>/blocking', methods=['POST'])
def update_blocking_relationship(session_id: str, node_id: str):
    """
    Update blocking relationship for a node
    
    Request body:
    {
      "blocking_node_id": "node123" or null to clear
    }
    """
    try:
        node_uuid = _convert_node_id(node_id)
        if not node_uuid:
            return jsonify({'error': 'Invalid node ID format'}), 400
        
        data = request.get_json()
        blocking_node_id_str = data.get('blocking_node_id')
        blocking_node_uuid = None
        
        if blocking_node_id_str:
            blocking_node_uuid = _convert_node_id(blocking_node_id_str)
            if not blocking_node_uuid:
                return jsonify({'error': 'Invalid blocking_node_id format'}), 400
        
        from backend.api.routes import get_session_data
        
        session_data = get_session_data(session_id)
        if not session_data:
            return jsonify({'error': 'Session not found'}), 404
        
        graph = session_data.get('graph')
        if not graph:
            return jsonify({'error': 'No project loaded in session'}), 400

        dispatcher = session_data.get('dispatcher')
        if not dispatcher:
            return jsonify({'error': 'Dispatcher not initialized for session'}), 400
        
        # Get nodes from graph
        nodes = graph.nodes if hasattr(graph, 'nodes') else {}
        
        # Validate nodes exist
        if node_uuid not in nodes:
            return jsonify({'error': f'Node {node_id} not found'}), 404
        
        if blocking_node_uuid and blocking_node_uuid not in nodes:
            return jsonify({'error': f'Blocking node {blocking_node_id_str} not found'}), 404
        
        # Get or create blocking relationships
        if 'blocking_relationships' not in session_data:
            session_data['blocking_relationships'] = []
        
        relationships = session_data['blocking_relationships']

        node_id_str = str(node_uuid)
        new_blocking_id_str = str(blocking_node_uuid) if blocking_node_uuid else None

        command = UpdateBlockingRelationshipCommand(
            blocked_node_id=node_id_str,
            new_blocking_node_id=new_blocking_id_str,
            relationships=relationships,
            session_id=session_id,
        )

        dispatcher.execute(command)
        
        # Emit node-updated event to trigger velocity recalculation in UI
        from backend.api.broadcaster import emit_node_updated
        emit_node_updated(session_id, node_id_str)
        if blocking_node_uuid:
            # Also emit for the blocking node since its velocity may change
            emit_node_updated(session_id, str(blocking_node_uuid))

        return jsonify({
            'success': True,
            'message': f'Blocking relationship updated for node {node_id}',
            'undo_available': len(dispatcher.undo_stack) > 0,
            'redo_available': len(dispatcher.redo_stack) > 0,
        })
    
    except Exception as e:
        logger.error(f'Error updating blocking relationship: {str(e)}')
        return jsonify({'error': f'Failed to update blocking relationship: {str(e)}'}), 500


@velocity_bp.route('/sessions/<session_id>/blocking-graph', methods=['GET'])
def get_blocking_graph(session_id: str):
    """Get all blocking relationships for the session"""
    try:
        from backend.api.routes import get_session_data
        
        session_data = get_session_data(session_id)
        if not session_data:
            return jsonify({'error': 'Session not found'}), 404
        
        blocking_relationships = session_data.get('blocking_relationships', [])
        
        return jsonify({
            'relationships': blocking_relationships,
            'timestamp': int(__import__('time').time() * 1000),
        })
    
    except Exception as e:
        logger.error(f'Error getting blocking graph: {str(e)}')
        return jsonify({'error': f'Failed to get blocking graph: {str(e)}'}), 500

