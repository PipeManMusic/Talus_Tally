from uuid import UUID, uuid4
from datetime import datetime
from typing import Dict, Any, List, Optional


class Node:
    """Represents a single node in the ProjectGraph."""
    
    def __init__(self, blueprint_type_id: str, name: str, id: Optional[UUID] = None):
        print(f"[DEBUG][Node.__init__] blueprint_type_id={blueprint_type_id} (type={type(blueprint_type_id)}) name={name} id={id}")
        self.id: UUID = id or uuid4()
        self.blueprint_type_id: str = blueprint_type_id
        self.name: str = name
        self.created_at: datetime = datetime.now()
        self.properties: Dict[str, Any] = {}
        self.children: List[UUID] = []
        self.parent_id: Optional[UUID] = None
