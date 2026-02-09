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
import logging

velocity_bp = Blueprint('velocity', __name__, url_prefix='/api/v1')
logger = logging.getLogger(__name__)


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
    
    # Get schema from session
    schema = session_data.get('blueprint')
    
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
        graph_nodes, schema, blocking_graph = _get_velocity_context(session_id)
        
        if graph_nodes is None:
            return jsonify({'error': 'Session not found'}), 404
        
        # Import and use velocity engine
        from backend.core.velocity_engine import VelocityEngine
        
        engine = VelocityEngine(graph_nodes, schema, blocking_graph)
        ranking = engine.get_ranking()
        
        # Format response
        nodes = []
        for node_id, calc in ranking:
            node = graph_nodes.get(node_id, {})
            # Get node properties safely
            if hasattr(node, 'properties'):
                node_name = node.properties.get('name', 'Unnamed')
                node_type = node.blueprint_type_id if hasattr(node, 'blueprint_type_id') else 'unknown'
            else:
                node_name = node.get('properties', {}).get('name', 'Unnamed')
                node_type = node.get('type', 'unknown')
            
            nodes.append({
                'nodeId': node_id,
                'nodeName': node_name,
                'nodeType': node_type,
                'baseScore': calc.base_score,
                'inheritedScore': calc.inherited_score,
                'statusScore': calc.status_score,
                'numericalScore': calc.numerical_score,
                'blockingPenalty': calc.blocking_penalty,
                'totalVelocity': calc.total_velocity,
                'isBlocked': calc.is_blocked,
                'blockedByNodes': calc.blocked_by_nodes,
                'blocksNodeIds': calc.blocks_node_ids,
            })
        
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
        graph_nodes, schema, blocking_graph = _get_velocity_context(session_id)
        
        if graph_nodes is None:
            return jsonify({'error': 'Session not found'}), 404
        
        from backend.core.velocity_engine import VelocityEngine
        
        engine = VelocityEngine(graph_nodes, schema, blocking_graph)
        calc = engine.calculate_velocity(node_id)
        
        node = graph_nodes.get(node_id, {})
        
        # Get node properties safely
        if hasattr(node, 'properties'):
            node_name = node.properties.get('name', 'Unnamed')
            node_type = node.blueprint_type_id if hasattr(node, 'blueprint_type_id') else 'unknown'
        else:
            node_name = node.get('properties', {}).get('name', 'Unnamed')
            node_type = node.get('type', 'unknown')
        
        return jsonify({
            'nodeId': node_id,
            'nodeName': node_name,
            'nodeType': node_type,
            'baseScore': calc.base_score,
            'inheritedScore': calc.inherited_score,
            'statusScore': calc.status_score,
            'numericalScore': calc.numerical_score,
            'blockingPenalty': calc.blocking_penalty,
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
        data = request.get_json()
        blocking_node_id = data.get('blocking_node_id')
        
        from backend.api.routes import get_session_data
        
        session_data = get_session_data(session_id)
        if not session_data:
            return jsonify({'error': 'Session not found'}), 404
        
        graph = session_data.get('graph')
        if not graph:
            return jsonify({'error': 'No project loaded in session'}), 400
        
        # Get nodes from graph
        nodes = graph.nodes if hasattr(graph, 'nodes') else {}
        
        # Validate nodes exist
        if node_id not in nodes:
            return jsonify({'error': f'Node {node_id} not found'}), 404
        
        if blocking_node_id and blocking_node_id not in nodes:
            return jsonify({'error': f'Blocking node {blocking_node_id} not found'}), 404
        
        # Get or create blocking relationships
        if 'blocking_relationships' not in session_data:
            session_data['blocking_relationships'] = []
        
        relationships = session_data['blocking_relationships']
        
        # Remove existing blocking for this node
        relationships[:] = [
            rel for rel in relationships 
            if rel.get('blockedNodeId') != node_id
        ]
        
        # Add new relationship if blocking_node_id provided
        if blocking_node_id:
            relationships.append({
                'blockedNodeId': node_id,
                'blockingNodeId': blocking_node_id,
            })
        
        return jsonify({
            'success': True,
            'message': f'Blocking relationship updated for node {node_id}',
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

