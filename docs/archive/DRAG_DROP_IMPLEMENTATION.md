# Drag and Drop Node Implementation

## Overview
Implemented drag and drop of nodes with validation that nodes can only be moved to compatible parent nodes. This allows users to reorganize the project tree by dragging nodes to new parents.

## Implementation Details

### 1. Backend Infra Layer: MoveNodeCommand
**File:** `backend/handlers/commands/node_commands.py`

New `MoveNodeCommand` class that:
- Validates the move is allowed before execution
- Checks type compatibility (destination parent must allow the node type as a child)
- Prevents cycles (a node cannot be moved under its own descendants)
- Prevents moving to orphaned nodes (orphaned nodes cannot have children)
- Stores the old parent for undo support
- Emits linked/unlinked events for real-time updates

**Key validations:**
```python
# Type compatibility check
if not self.blueprint.is_allowed_child(parent_type, node_type):
    raise ValueError(f"Node type '{node_type}' not allowed as child of '{parent_type}'")

# Cycle detection
if self._would_create_cycle(node, new_parent):
    raise ValueError("Moving node would create a cycle")

# Orphaned node check
if not OrphanManager.can_add_child(parent_dict):
    raise ValueError("Cannot move to orphaned parent")
```

### 2. REST API Handler
**File:** `backend/api/routes.py`

Added `MoveNode` command handling in `/sessions/{id}/execute-command` endpoint:
- Registers command in `COMMAND_CLASSES` map
- Validates required parameters: `node_id` and `new_parent_id`
- Returns `MOVE_INVALID` error status if validation fails
- Provides detailed error messages for UI feedback

### 3. Frontend Tree View
**File:** `frontend/src/components/layout/TreeView.tsx`

Enhanced `TreeItem` component with drag and drop support:

**Drag Events:**
- `onDragStart`: Captures dragged node info (id, type, name) in dataTransfer
- `onDragEnd`: Clears drag state

**Drop Events:**
- `onDragOver`: Validates drop target
  - Checks if target accepts the node type
  - Prevents dropping on itself
  - Allows drop with visual feedback
- `onDragLeave`: Clears drop zone highlight
- `onDrop`: Triggers move command on successful drop

**Visual Feedback:**
- `cursor-move` class indicates nodes are draggable
- `bg-accent-primary/30` highlight shows valid drop zones
- Smooth color transitions during drag operations

### 4. Frontend App Handler
**File:** `frontend/src/App.tsx`

Added move action handler in context menu:
```tsx
else if (action.startsWith('move:')) {
  const newParentId = action.split(':')[1];
  safeExecuteCommand('MoveNode', {
    node_id: nodeId,
    new_parent_id: newParentId,
  })
}
```

Provides user feedback:
- Success: Updates graph and marks as dirty
- Error: Shows alert with detailed validation message

## User Experience

### How to Use
1. **Drag a node:** Click and hold on any node to start dragging
2. **Hover over target:** Valid drop zones highlight with accent color
3. **Drop:** Release to move the node to the new parent
4. **Undo:** If move fails, an alert explains why (incompatible types, would create cycle, etc.)

### Validation Rules
- **Type Compatibility:** The destination node type must list the source node type in its `allowed_children`
- **No Cycles:** Cannot move a node under any of its descendants
- **Orphaned Nodes:** Cannot move nodes into orphaned parents (orphaned nodes are read-only)
- **No Self-Move:** Cannot move a node to itself

## Testing Checklist

- [ ] Drag a task node to another job (should fail: task not allowed as child of job in standard template)
- [ ] Drag a phase node to another phase (should fail: phase not allowed as child of phase)
- [ ] Drag a task to a different job (should succeed if allowed by schema)
- [ ] Drag and immediately undo (should restore node to original position)
- [ ] Drag a node with children to verify all descendants move together
- [ ] Verify cycle detection: try to drag a parent into its own child (should fail)
- [ ] Test orphaned node: try to move a node into an orphaned parent (should fail with message)
- [ ] Test API error handling: move command returns detailed error message
- [ ] Verify drag cursor feedback highlights valid drop targets

## Architecture Notes

### Why This Approach?
1. **Validation at command level:** Moving business logic to MoveNodeCommand ensures consistency whether drag/drop or other features trigger moves
2. **Reusable command:** Same MoveNodeCommand used for any future move operations (API, UI, macros)
3. **Optimize State:** Pending updates state only used in template editor; drag/drop is simple immediate API call
4. **Real-time feedback:** Graph updates immediately on success, error messages explain validation failures

### Future Enhancements
- Batch move operations (move multiple nodes at once)
- Visual drag indicators (show node being dragged with semi-transparent copy)
- Expand parent on hover during drag (auto-expand collapsed parents)
- Drag multiple nodes: Shift+click + drag

