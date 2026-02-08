from dataclasses import dataclass
from typing import Dict, Iterable, List, Sequence, Set
from uuid import UUID


@dataclass(frozen=True)
class CSVColumnBinding:
    header: str
    property_id: str


@dataclass
class CSVImportPlan:
    parent_id: UUID
    blueprint_type_id: str
    column_bindings: List[CSVColumnBinding]

    def __post_init__(self) -> None:
        seen = set()
        for binding in self.column_bindings:
            if binding.property_id in seen:
                raise ValueError(f"Duplicate property binding: {binding.property_id}")
            seen.add(binding.property_id)

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


@dataclass
class CSVImportBatch:
    plan: CSVImportPlan
    prepared_nodes: List[PreparedCSVNode]
    errors: List[CSVRowError]

    @property
    def has_errors(self) -> bool:
        return len(self.errors) > 0
