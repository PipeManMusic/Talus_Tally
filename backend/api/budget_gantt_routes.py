"""
Budget & Gantt API Routes

Endpoints:
- GET /api/v1/sessions/{id}/budget  — Pre-calculated budget tree rollup
- GET /api/v1/sessions/{id}/gantt   — Pre-calculated Gantt bar positions
"""

from flask import Blueprint, jsonify, request
import logging
import time

budget_gantt_bp = Blueprint('budget_gantt', __name__, url_prefix='/api/v1')
logger = logging.getLogger(__name__)


def _get_graph_nodes(session_id: str):
    """
    Extract graph nodes dict from session data.

    Returns (graph_nodes, session_data) or (None, None).
    """
    from backend.api.routes import get_session_data

    session_data = get_session_data(session_id)
    if not session_data:
        return None, None

    graph = session_data.get('graph')
    if not graph:
        return None, None

    graph_nodes = graph.nodes if hasattr(graph, 'nodes') else {}
    return graph_nodes, session_data


def _get_person_type_ids(session_data) -> set:
    """Extract the set of node type IDs (UUIDs) that have the is_person feature."""
    blueprint = session_data.get('blueprint') if session_data else None
    if not blueprint or not hasattr(blueprint, 'node_types'):
        return set()
    return {nt.uuid for nt in blueprint.node_types if nt.has_feature('is_person')}


# ── Budget ────────────────────────────────────────────────────────────


def _serialise_budget_tree(bn) -> dict:
    """Recursively convert a BudgetNode dataclass to a plain dict."""
    return {
        'nodeId': bn.node_id,
        'nodeName': bn.node_name,
        'nodeType': bn.node_type,
        'estimatedCost': bn.estimated_cost,
        'actualCost': bn.actual_cost,
        'totalEstimated': bn.total_estimated,
        'totalActual': bn.total_actual,
        'variance': bn.variance,
        'depth': bn.depth,
        'children': [_serialise_budget_tree(c) for c in bn.children],
    }


@budget_gantt_bp.route('/sessions/<session_id>/budget', methods=['GET'])
def get_budget(session_id: str):
    """Return the pre-calculated budget tree for the session's project."""
    try:
        graph_nodes, session_data = _get_graph_nodes(session_id)

        if graph_nodes is None:
            if session_data is None:
                return jsonify({'error': 'Session not found'}), 404
            return jsonify({
                'trees': [],
                'grandTotal': 0,
                'timestamp': int(time.time() * 1000),
            })

        from backend.core.budget_engine import BudgetEngine

        engine = BudgetEngine(graph_nodes, blueprint=session_data.get('blueprint'))
        trees = engine.calculate()
        grand_estimated = sum(t.total_estimated for t in trees)
        grand_actual = sum(t.total_actual for t in trees)
        grand_variance = grand_actual - grand_estimated

        return jsonify({
            'trees': [_serialise_budget_tree(t) for t in trees],
            'grandTotal': grand_estimated,
            'grandEstimated': grand_estimated,
            'grandActual': grand_actual,
            'grandVariance': grand_variance,
            'timestamp': int(time.time() * 1000),
        })

    except Exception as e:
        logger.error(f'Error calculating budget: {e}')
        return jsonify({'error': f'Failed to calculate budget: {str(e)}'}), 500


# ── Gantt ─────────────────────────────────────────────────────────────


@budget_gantt_bp.route('/sessions/<session_id>/gantt', methods=['GET'])
def get_gantt(session_id: str):
    """Return pre-calculated Gantt bar positions for the session's project."""
    try:
        graph_nodes, session_data = _get_graph_nodes(session_id)

        if graph_nodes is None:
            if session_data is None:
                return jsonify({'error': 'Session not found'}), 404
            return jsonify({
                'bars': [],
                'timelineRange': None,
                'timestamp': int(time.time() * 1000),
            })

        from backend.core.gantt_engine import GanttEngine

        blueprint = session_data.get('blueprint') if session_data else None
        engine = GanttEngine(graph_nodes, blueprint=blueprint)
        bars = engine.calculate()
        timeline_range = engine.get_timeline_range()

        return jsonify({
            'bars': [
                {
                    'nodeId': b.node_id,
                    'nodeName': b.node_name,
                    'nodeType': b.node_type,
                    'startDate': b.start_date,
                    'endDate': b.end_date,
                    'leftPercent': b.left_percent,
                    'widthPercent': b.width_percent,
                    'depth': b.depth,
                }
                for b in bars
            ],
            'timelineRange': timeline_range,
            'timestamp': int(time.time() * 1000),
        })

    except Exception as e:
        logger.error(f'Error calculating gantt: {e}')
        return jsonify({'error': f'Failed to calculate gantt: {str(e)}'}), 500


# ── Manpower ──────────────────────────────────────────────────────────


@budget_gantt_bp.route('/sessions/<session_id>/manpower', methods=['GET'])
def get_manpower(session_id: str):
    """Return day-by-day manpower loading for person resources."""
    try:
        graph_nodes, session_data = _get_graph_nodes(session_id)

        if graph_nodes is None:
            if session_data is None:
                return jsonify({'error': 'Session not found'}), 404
            return jsonify({
                'date_columns': [],
                'resources': {},
                'timestamp': int(time.time() * 1000),
            })

        from backend.core.resource_engine import calculate_manpower_load

        person_ids = _get_person_type_ids(session_data)
        blueprint = session_data.get('blueprint') if session_data else None
        payload = calculate_manpower_load(list(graph_nodes.values()), person_type_ids=person_ids, blueprint=blueprint)
        payload['timestamp'] = int(time.time() * 1000)
        return jsonify(payload)

    except Exception as e:
        logger.error(f'Error calculating manpower: {e}')
        return jsonify({'error': f'Failed to calculate manpower: {str(e)}'}), 500


@budget_gantt_bp.route('/sessions/<session_id>/manpower/recalculate', methods=['POST'])
def recalculate_manpower(session_id: str):
    """Explicitly regenerate manpower allocations via proper command execution."""
    try:
        from backend.api.routes import get_session_data
        
        session_data = get_session_data(session_id)
        if not session_data:
            return jsonify({'error': 'Session not found'}), 404
        
        graph = session_data.get('graph')
        dispatcher = session_data.get('dispatcher')
        if not graph or not dispatcher:
            return jsonify({'error': 'Session is missing graph or dispatcher'}), 404
        
        graph_nodes = graph.nodes if hasattr(graph, 'nodes') else {}
        from backend.core.resource_engine import calculate_manpower_load, recalculate_manpower_allocations
        from backend.handlers.commands.node_commands import UpdatePropertyCommand
        from uuid import UUID

        person_ids = _get_person_type_ids(session_data)

        blueprint = session_data.get('blueprint')

        # Get the list of changes (does not mutate nodes directly)
        node_ids_filter = None
        body = request.get_json(silent=True) or {}
        if body.get('node_ids'):
            node_ids_filter = set(str(nid) for nid in body['node_ids'])
        recalc_result = recalculate_manpower_allocations(list(graph_nodes.values()), person_type_ids=person_ids, blueprint=blueprint, node_ids=node_ids_filter)
        
        # Apply each change via UpdatePropertyCommand to ensure undo/redo support
        for change in recalc_result.get("changes", []):
            command = UpdatePropertyCommand(
                node_id=UUID(change["node_id"]),
                property_id=change["property_id"],
                old_value=change["old_value"],
                new_value=change["new_value"],
                graph=graph,
                graph_service=session_data.get('graph_service'),
                session_id=session_id,
            )
            dispatcher.execute(command)
        
        # Calculate fresh payload
        payload = calculate_manpower_load(list(graph_nodes.values()), person_type_ids=person_ids, blueprint=blueprint)
        payload.update({
            "updated_tasks": recalc_result["updated_tasks"],
            "total_tasks": recalc_result["total_tasks"],
            "changes": recalc_result.get("changes", []),
        })
        payload['timestamp'] = int(time.time() * 1000)
        return jsonify(payload)

    except Exception as e:
        logger.error(f'Error recalculating manpower: {e}')
        return jsonify({'error': f'Failed to recalculate manpower: {str(e)}'}), 500


@budget_gantt_bp.route('/sessions/<session_id>/manpower/clear', methods=['POST'])
def clear_manpower_allocations(session_id: str):
    """Clear manpower allocations for specified task nodes."""
    try:
        from backend.api.routes import get_session_data

        session_data = get_session_data(session_id)
        if not session_data:
            return jsonify({'error': 'Session not found'}), 404

        graph = session_data.get('graph')
        dispatcher = session_data.get('dispatcher')
        if not graph or not dispatcher:
            return jsonify({'error': 'Session is missing graph or dispatcher'}), 404

        body = request.get_json(silent=True) or {}
        node_ids = set(str(nid) for nid in body.get('node_ids', []))
        if not node_ids:
            return jsonify({'error': 'node_ids is required'}), 400

        graph_nodes = graph.nodes if hasattr(graph, 'nodes') else {}
        blueprint = session_data.get('blueprint')
        person_ids = _get_person_type_ids(session_data)

        from backend.core.resource_engine import calculate_manpower_load, ALLOCATIONS_PROPERTY_ID, _node_type
        from backend.core.property_resolver import PropertyResolver
        from backend.handlers.commands.node_commands import UpdatePropertyCommand
        from uuid import UUID

        pr = PropertyResolver(blueprint)
        changes = []

        for nid in node_ids:
            try:
                node = graph_nodes.get(UUID(nid))
            except (ValueError, AttributeError):
                node = graph_nodes.get(nid)
            if not node:
                continue
            props = node.properties if hasattr(node, 'properties') else {}
            # Resolve the allocations property (semantic or UUID key)
            alloc_uuid = pr.key(_node_type(node), ALLOCATIONS_PROPERTY_ID)
            old_value = props.get(ALLOCATIONS_PROPERTY_ID) or props.get(alloc_uuid)
            if not old_value:
                continue
            changes.append({
                'node_id': nid,
                'property_id': alloc_uuid,
                'old_value': old_value,
                'new_value': {},
            })

        for change in changes:
            command = UpdatePropertyCommand(
                node_id=UUID(change['node_id']),
                property_id=change['property_id'],
                old_value=change['old_value'],
                new_value=change['new_value'],
                graph=graph,
                graph_service=session_data.get('graph_service'),
                session_id=session_id,
            )
            dispatcher.execute(command)

        payload = calculate_manpower_load(list(graph_nodes.values()), person_type_ids=person_ids, blueprint=blueprint)
        payload['changes'] = changes
        payload['cleared_tasks'] = len(changes)
        payload['timestamp'] = int(time.time() * 1000)
        return jsonify(payload)

    except Exception as e:
        logger.error(f'Error clearing manpower allocations: {e}')
        return jsonify({'error': f'Failed to clear manpower allocations: {str(e)}'}), 500
