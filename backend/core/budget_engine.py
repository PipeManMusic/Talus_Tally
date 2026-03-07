"""
Budget Engine — recursive tree rollup for total cost calculation.

Each node's total_cost = its own estimated_cost + sum of children's total_cost.
The frontend receives a pre-calculated tree; it does ZERO recursive math.

Endpoints consume the BudgetEngine.calculate() method which returns a list of
BudgetNode dataclass instances ready to be serialised to JSON.
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
    own_cost: float
    children_cost: float
    total_cost: float
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
        """Recursively compute total_cost for *nid_str* and its subtree."""
        node = self._resolve_node(nid_str)
        if node is None:
            return None

        raw_cost = self._get_prop(node, "estimated_cost", 0)
        try:
            own_cost = float(raw_cost) if raw_cost else 0.0
        except (ValueError, TypeError):
            own_cost = 0.0

        child_budget_nodes: List[BudgetNode] = []
        children_cost = 0.0
        for cid in self._children_map.get(nid_str, []):
            child_bn = self._rollup(cid, depth + 1)
            if child_bn is not None:
                child_budget_nodes.append(child_bn)
                children_cost += child_bn.total_cost

        return BudgetNode(
            node_id=nid_str,
            node_name=self._get_name(node),
            node_type=self._get_type(node),
            own_cost=own_cost,
            children_cost=children_cost,
            total_cost=own_cost + children_cost,
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
        total_cost values ready for the frontend to render.
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
                    "own_cost": bn.own_cost,
                    "children_cost": bn.children_cost,
                    "total_cost": bn.total_cost,
                    "depth": bn.depth,
                }
            )
            for child in bn.children:
                _flatten(child)

        for tree in trees:
            _flatten(tree)
        return flat

    def grand_total(self) -> float:
        """Sum of all root-level total_cost values (the project grand total)."""
        return sum(t.total_cost for t in self.calculate())
