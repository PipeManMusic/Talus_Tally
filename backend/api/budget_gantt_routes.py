"""
Budget & Gantt API Routes

Endpoints:
- GET /api/v1/sessions/{id}/budget  — Pre-calculated budget tree rollup
- GET /api/v1/sessions/{id}/gantt   — Pre-calculated Gantt bar positions
"""

from flask import Blueprint, jsonify
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

        engine = BudgetEngine(graph_nodes)
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

        engine = GanttEngine(graph_nodes)
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
