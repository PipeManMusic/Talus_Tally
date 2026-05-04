from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Set
from uuid import UUID


# Import modes for CSV operations.
CSV_MODE_CREATE = "create"
CSV_MODE_UPDATE = "update"
CSV_MODE_UPSERT = "upsert"
CSV_VALID_MODES = {CSV_MODE_CREATE, CSV_MODE_UPDATE, CSV_MODE_UPSERT}
# Modes that require ``match_property_id`` and a ``match_value`` per row.
CSV_MATCH_MODES = {CSV_MODE_UPDATE, CSV_MODE_UPSERT}


@dataclass(frozen=True)
class CSVColumnBinding:
    header: str
    property_id: str


@dataclass
class CSVImportPlan:
    parent_id: UUID
    blueprint_type_id: str
    column_bindings: List[CSVColumnBinding]
    mode: str = CSV_MODE_CREATE
    # Property id (semantic key or UUID) used to match CSV rows to existing
    # child nodes when ``mode == CSV_MODE_UPDATE``. Ignored in create mode.
    match_property_id: Optional[str] = None

    def __post_init__(self) -> None:
        seen = set()
        for binding in self.column_bindings:
            if binding.property_id in seen:
                raise ValueError(f"Duplicate property binding: {binding.property_id}")
            seen.add(binding.property_id)

        if self.mode not in CSV_VALID_MODES:
            raise ValueError(f"Invalid CSV import mode '{self.mode}'")

        if self.mode in CSV_MATCH_MODES:
            if not self.match_property_id:
                raise ValueError(
                    f"match_property_id is required in {self.mode} mode"
                )
            if self.match_property_id not in seen:
                raise ValueError(
                    f"match_property_id '{self.match_property_id}' must be present in column_bindings"
                )

    def missing_required_properties(self, required_properties: Iterable[str]) -> Set[str]:
        required = set(required_properties)
        if not required:
            return set()
        bound = {binding.property_id for binding in self.column_bindings}
        return {prop for prop in required if prop not in bound}


class CSVImportPlanError(ValueError):
    """Raised when a CSV import plan is invalid before processing."""


@dataclass(frozen=True)
class CSVRowError:
    row_number: int
    messages: Sequence[str]


@dataclass(frozen=True)
class PreparedCSVNode:
    name: str
    properties: Dict[str, str]
    # Original 1-based CSV row number (header is row 1, first data row is 2).
    # Used by update mode to report unmatched rows back to the client.
    row_number: int = 0
    # Value to use for matching against existing nodes in update mode.
    # Resolved by the service from the row's match-column value.
    match_value: Optional[str] = None


@dataclass
class CSVImportBatch:
    plan: CSVImportPlan
    prepared_nodes: List[PreparedCSVNode]
    errors: List[CSVRowError]

    @property
    def has_errors(self) -> bool:
        return len(self.errors) > 0
