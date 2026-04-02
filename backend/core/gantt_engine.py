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

from backend.core.property_resolver import PropertyResolver

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
    progress: float           # 0.0-1.0, actual_hours / estimated_hours
    status: str               # "To Do", "In Progress", "Done", or ""
    assigned_to: List[str]    # list of assigned person node IDs
    estimated_hours: float    # total estimated hours


class GanttEngine:
    """
    Walks the project graph and produces percentage-positioned Gantt bars.

    Constructor mirrors VelocityEngine: takes the raw graph_nodes dict
    (keyed by UUID) whose values are Node objects or plain dicts.
    """

    def __init__(self, graph_nodes: Dict[Any, Any], blueprint=None) -> None:
        self._nodes = graph_nodes
        self._pr = PropertyResolver(blueprint)
        self._parent_map: Dict[str, str] = {}
        self._children_map: Dict[str, List[str]] = {}
        self._status_option_map = self._build_status_map(blueprint)
        self._build_maps()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_status_map(blueprint) -> Dict[str, str]:
        """Build option-UUID → display-name map for all status properties."""
        mapping: Dict[str, str] = {}
        if not blueprint:
            return mapping
        # Blueprint is an object with .node_types list of NodeTypeDef objects
        node_types = getattr(blueprint, 'node_types', None)
        if node_types is None:
            # Fallback for raw dict blueprints (e.g. in tests)
            if isinstance(blueprint, dict):
                node_types = blueprint.get("node_types", [])
            else:
                return mapping
        for nt in node_types:
            props = nt.properties if hasattr(nt, 'properties') else nt.get("properties", [])
            if not props:
                continue
            for prop in props:
                prop_id = prop.get("id", "") if isinstance(prop, dict) else getattr(prop, "id", "")
                prop_key = prop.get("key", "") if isinstance(prop, dict) else getattr(prop, "key", "")
                prop_type = prop.get("type", "") if isinstance(prop, dict) else getattr(prop, "type", "")
                if (prop_id == "status" or prop_key == "status") and prop_type == "select":
                    options = prop.get("options", []) if isinstance(prop, dict) else getattr(prop, "options", [])
                    for opt in (options or []):
                        opt_id = opt.get("id", "") if isinstance(opt, dict) else getattr(opt, "id", "")
                        opt_name = opt.get("name", opt_id) if isinstance(opt, dict) else getattr(opt, "name", opt_id)
                        if opt_id:
                            mapping[opt_id] = opt_name
        return mapping

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

    def _get_prop(self, node: Any, key: str, default: Any = None) -> Any:
        return self._pr.get(node, key, default)

    def _get_name(self, node: Any) -> str:
        return self._pr.get(node, "name") or getattr(node, "name", None) or "Unnamed"

    @staticmethod
    def _get_type(node: Any) -> str:
        if hasattr(node, "blueprint_type_id"):
            return node.blueprint_type_id or "unknown"
        return node.get("type", "unknown")

    @staticmethod
    def _is_scheduling_orphaned(node: Any) -> bool:
        """Return True if the node or its scheduling properties are orphaned."""
        metadata = getattr(node, "metadata", None) if hasattr(node, "metadata") else node.get("metadata")
        if not isinstance(metadata, dict):
            return False
        if metadata.get("orphaned"):
            return True
        orphaned_props = metadata.get("orphaned_properties", {})
        if isinstance(orphaned_props, dict):
            if "start_date" in orphaned_props or "end_date" in orphaned_props:
                return True
        return False

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
            if self._is_scheduling_orphaned(node):
                continue
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
            if self._is_scheduling_orphaned(node):
                continue
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

            # Progress from actual vs estimated hours
            est = 0.0
            act = 0.0
            raw_est = self._get_prop(node, "estimated_hours", 0)
            raw_act = self._get_prop(node, "actual_hours", 0)
            try:
                est = float(raw_est) if raw_est else 0.0
            except (TypeError, ValueError):
                pass
            try:
                act = float(raw_act) if raw_act else 0.0
            except (TypeError, ValueError):
                pass
            progress = min(act / est, 1.0) if est > 0 else 0.0

            # Status – resolve option UUID to display name
            raw_status = self._get_prop(node, "status", "")
            status_str = ""
            if raw_status:
                raw_str = str(raw_status).strip()
                status_str = self._status_option_map.get(raw_str, raw_str)

            # Assigned person IDs
            raw_assigned = self._get_prop(node, "assigned_to", None)
            assigned_list: List[str] = []
            if isinstance(raw_assigned, list):
                assigned_list = [str(a) for a in raw_assigned]
            elif isinstance(raw_assigned, str) and raw_assigned:
                assigned_list = [raw_assigned]

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
                    progress=round(progress, 3),
                    status=status_str,
                    assigned_to=assigned_list,
                    estimated_hours=est,
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
