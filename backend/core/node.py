from uuid import UUID, uuid4
from datetime import datetime
from typing import Dict, Any, List, Optional


class Node:
    """Represents a single node in the ProjectGraph."""
    
    def __init__(self, blueprint_type_id: str, name: str, id: Optional[UUID] = None):
        """
        Initialize a Node.
        
        Args:
            blueprint_type_id: The type ID of the blueprint this node follows
            name: The human-readable name of the node
            id: Optional UUID; generates one if not provided
        """
        self.id: UUID = id or uuid4()
        self.blueprint_type_id: str = blueprint_type_id
        self.name: str = name
        self.created_at: datetime = datetime.now()
        self.properties: Dict[str, Any] = {}
        self.children: List[UUID] = []
        self.parent_id: Optional[UUID] = None
