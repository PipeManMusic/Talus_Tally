from typing import Optional, List, Dict

from backend.handlers.command import Command


class UpdateBlockingRelationshipCommand(Command):
    """Command to update a blocking relationship with undo support."""

    def __init__(
        self,
        blocked_node_id: str,
        new_blocking_node_id: Optional[str],
        relationships: List[Dict[str, str]],
        session_id: Optional[str] = None,
    ) -> None:
        self.blocked_node_id = blocked_node_id
        self.new_blocking_node_id = new_blocking_node_id
        self.relationships = relationships
        self.session_id = session_id
        self.previous_blocking_node_id: Optional[str] = None

    def execute(self) -> None:
        # Store previous relationship if it exists
        self.previous_blocking_node_id = next(
            (
                rel.get("blockingNodeId")
                for rel in self.relationships
                if rel.get("blockedNodeId") == self.blocked_node_id
            ),
            None,
        )

        # Remove any existing relationship for this blocked node
        self.relationships[:] = [
            rel for rel in self.relationships
            if rel.get("blockedNodeId") != self.blocked_node_id
        ]

        # Add new relationship if provided
        if self.new_blocking_node_id:
            self.relationships.append({
                "blockedNodeId": self.blocked_node_id,
                "blockingNodeId": self.new_blocking_node_id,
            })

    def undo(self) -> None:
        # Remove current relationship for this blocked node
        self.relationships[:] = [
            rel for rel in self.relationships
            if rel.get("blockedNodeId") != self.blocked_node_id
        ]

        # Restore previous relationship if it existed
        if self.previous_blocking_node_id:
            self.relationships.append({
                "blockedNodeId": self.blocked_node_id,
                "blockingNodeId": self.previous_blocking_node_id,
            })
