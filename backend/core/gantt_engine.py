"""
Gantt Engine — percentage-based bar positioning for timeline visualisation.

Finds the absolute earliest start_date and latest end_date across ALL nodes in
the graph, then expresses each node's bar as left_percent / width_percent so
the frontend can render pure-CSS positioned bars with ZERO date parsing.

Endpoints consume GanttEngine.calculate() which returns a list of GanttBar
dataclass instances.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

logger = logging.getLogger(__name__)


@dataclass
class GanttBar:
    """Pre-calculated Gantt bar positioning for a single node."""

    node_id: str
    node_name: str
    node_type: str
    start_date: str          # ISO-8601 string for display labels
    end_date: str             # ISO-8601 string for display labels
    left_percent: float       # 0-100, position from left edge
    width_percent: float      # 0-100, bar width
    depth: int                # tree depth for indentation


class GanttEngine:
    """
    Walks the project graph and produces percentage-positioned Gantt bars.

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
        node = self._nodes.get(nid_str)
        if node is not None:
            return node
        try:
            return self._nodes.get(UUID(nid_str))
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _parse_date(raw: Any) -> Optional[date]:
        """Best-effort parse of a date value (str or date/datetime)."""
        if raw is None or raw == "":
            return None
        if isinstance(raw, datetime):
            return raw.date()
        if isinstance(raw, date):
            return raw
        if isinstance(raw, str):
            for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%m-%d-%Y", "%m/%d/%Y"):
                try:
                    return datetime.strptime(raw, fmt).date()
                except ValueError:
                    continue
        return None

    # ------------------------------------------------------------------
    # Core calculation
    # ------------------------------------------------------------------

    def _get_timeline_bounds(self) -> Optional[Tuple[date, date]]:
        """Find the absolute earliest start and latest end across all nodes."""
        earliest: Optional[date] = None
        latest: Optional[date] = None

        for node in self._nodes.values():
            s = self._parse_date(self._get_prop(node, "start_date"))
            e = self._parse_date(self._get_prop(node, "end_date"))
            if s is not None:
                if earliest is None or s < earliest:
                    earliest = s
            if e is not None:
                if latest is None or e > latest:
                    latest = e

        if earliest is None or latest is None:
            return None
        if earliest >= latest:
            # Edge case: all dates identical — widen by one day
            return (earliest, date.fromordinal(latest.toordinal() + 1))
        return (earliest, latest)

    def _node_depth(self, nid_str: str) -> int:
        depth = 0
        cur = nid_str
        while cur in self._parent_map:
            cur = self._parent_map[cur]
            depth += 1
        return depth

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def calculate(self) -> List[GanttBar]:
        """
        Return a flat list of GanttBar objects for every node that has
        both a start_date and end_date.

        Bars omit nodes missing either date — the frontend simply doesn't
        render those rows.
        """
        bounds = self._get_timeline_bounds()
        if bounds is None:
            return []

        earliest, latest = bounds
        total_days = (latest - earliest).days
        if total_days <= 0:
            total_days = 1  # prevent division by zero

        bars: List[GanttBar] = []

        for nid, node in self._nodes.items():
            nid_str = str(nid)
            s = self._parse_date(self._get_prop(node, "start_date"))
            e = self._parse_date(self._get_prop(node, "end_date"))

            if s is None or e is None:
                continue

            # Clamp to bounds
            if s < earliest:
                s = earliest
            if e > latest:
                e = latest
            if s > e:
                e = s  # zero-width bar

            left_percent = ((s - earliest).days / total_days) * 100.0
            bar_days = (e - s).days
            width_percent = max((bar_days / total_days) * 100.0, 0.5)  # min 0.5% visibility

            bars.append(
                GanttBar(
                    node_id=nid_str,
                    node_name=self._get_name(node),
                    node_type=self._get_type(node),
                    start_date=s.isoformat(),
                    end_date=e.isoformat(),
                    left_percent=round(left_percent, 2),
                    width_percent=round(width_percent, 2),
                    depth=self._node_depth(nid_str),
                )
            )

        # Sort by start_date then name for consistent ordering
        bars.sort(key=lambda b: (b.start_date, b.node_name))
        return bars

    def get_timeline_range(self) -> Optional[Dict[str, str]]:
        """Return the overall timeline range as ISO strings, or None."""
        bounds = self._get_timeline_bounds()
        if bounds is None:
            return None
        return {
            "earliest": bounds[0].isoformat(),
            "latest": bounds[1].isoformat(),
        }
