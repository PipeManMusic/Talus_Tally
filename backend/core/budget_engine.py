"""
Budget Engine — recursive tree rollup for cost calculation.

Each node returns full financial rollups:
- total_estimated = own estimated_cost + children total_estimated
- total_actual = own actual_cost + children total_actual
- variance = total_actual - total_estimated

The frontend receives a pre-calculated tree; it does ZERO recursive math.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from uuid import UUID

logger = logging.getLogger(__name__)


@dataclass
class BudgetNode:
    """Pre-calculated budget data for a single node."""

    node_id: str
    node_name: str
    node_type: str
    estimated_cost: float
    actual_cost: float
    total_estimated: float
    total_actual: float
    variance: float
    depth: int
    children: List[BudgetNode] = field(default_factory=list)


class BudgetEngine:
    """
    Walks the project graph tree and produces a budget rollup.

    Constructor mirrors VelocityEngine: takes the raw graph_nodes dict
    (keyed by UUID) whose values are Node objects or plain dicts.
    """

    def __init__(self, graph_nodes: Dict[Any, Any]) -> None:
        self._nodes = graph_nodes
        self._parent_map: Dict[str, str] = {}
        self._children_map: Dict[str, List[str]] = {}
        self._build_maps()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_maps(self) -> None:
        """Build parent→children index from the node graph."""
        for nid, node in self._nodes.items():
            nid_str = str(nid)
            children = (
                node.children if hasattr(node, "children") else node.get("children", [])
            )
            child_strs = [str(c) for c in children]
            self._children_map[nid_str] = child_strs
            for cid in child_strs:
                self._parent_map[cid] = nid_str

    @staticmethod
    def _get_prop(node: Any, key: str, default: Any = None) -> Any:
        """Read a property from a Node object or dict."""
        if hasattr(node, "properties"):
            return node.properties.get(key, default)
        return node.get("properties", {}).get(key, default)

    @staticmethod
    def _get_name(node: Any) -> str:
        if hasattr(node, "properties"):
            return node.properties.get("name", "Unnamed")
        return node.get("properties", {}).get("name", "Unnamed")

    @staticmethod
    def _get_type(node: Any) -> str:
        if hasattr(node, "blueprint_type_id"):
            return node.blueprint_type_id or "unknown"
        return node.get("type", "unknown")

    def _resolve_node(self, nid_str: str) -> Optional[Any]:
        """Look up a node by string id, trying both str and UUID keys."""
        node = self._nodes.get(nid_str)
        if node is not None:
            return node
        try:
            return self._nodes.get(UUID(nid_str))
        except (ValueError, TypeError):
            return None

    # ------------------------------------------------------------------
    # Core rollup
    # ------------------------------------------------------------------

    def _rollup(self, nid_str: str, depth: int) -> Optional[BudgetNode]:
        """Recursively compute estimated/actual/variance for *nid_str* subtree."""
        node = self._resolve_node(nid_str)
        if node is None:
            return None

        raw_estimated = self._get_prop(node, "estimated_cost", 0)
        raw_actual = self._get_prop(node, "actual_cost", 0)
        try:
            estimated_cost = float(raw_estimated) if raw_estimated else 0.0
        except (ValueError, TypeError):
            estimated_cost = 0.0
        try:
            actual_cost = float(raw_actual) if raw_actual else 0.0
        except (ValueError, TypeError):
            actual_cost = 0.0

        child_budget_nodes: List[BudgetNode] = []
        children_estimated = 0.0
        children_actual = 0.0
        for cid in self._children_map.get(nid_str, []):
            child_bn = self._rollup(cid, depth + 1)
            if child_bn is not None:
                child_budget_nodes.append(child_bn)
                children_estimated += child_bn.total_estimated
                children_actual += child_bn.total_actual

        total_estimated = estimated_cost + children_estimated
        total_actual = actual_cost + children_actual
        variance = total_actual - total_estimated

        return BudgetNode(
            node_id=nid_str,
            node_name=self._get_name(node),
            node_type=self._get_type(node),
            estimated_cost=estimated_cost,
            actual_cost=actual_cost,
            total_estimated=total_estimated,
            total_actual=total_actual,
            variance=variance,
            depth=depth,
            children=child_budget_nodes,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def calculate(self) -> List[BudgetNode]:
        """
        Return a list of root-level BudgetNode trees.

        Each root contains recursively nested children with pre-calculated
        total_estimated/total_actual/variance values ready for the frontend.
        """
        # Roots = nodes that have no parent
        root_ids = [
            str(nid)
            for nid in self._nodes
            if str(nid) not in self._parent_map
        ]

        results: List[BudgetNode] = []
        for rid in root_ids:
            bn = self._rollup(rid, depth=0)
            if bn is not None:
                results.append(bn)

        return results

    def calculate_flat(self) -> List[Dict[str, Any]]:
        """
        Return a *flat* list of every node with budget info (no nesting).

        Useful for summary tables / totals.
        """
        trees = self.calculate()
        flat: List[Dict[str, Any]] = []

        def _flatten(bn: BudgetNode) -> None:
            flat.append(
                {
                    "node_id": bn.node_id,
                    "node_name": bn.node_name,
                    "node_type": bn.node_type,
                    "estimated_cost": bn.estimated_cost,
                    "actual_cost": bn.actual_cost,
                    "total_estimated": bn.total_estimated,
                    "total_actual": bn.total_actual,
                    "variance": bn.variance,
                    "depth": bn.depth,
                }
            )
            for child in bn.children:
                _flatten(child)

        for tree in trees:
            _flatten(tree)
        return flat

    def grand_total(self) -> float:
        """Backward-compatible grand total (sum of total_estimated)."""
        return sum(t.total_estimated for t in self.calculate())
