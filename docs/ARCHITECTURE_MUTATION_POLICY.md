# Architecture Mutation Policy

## Overview

This document defines which mutations are acceptable in the Talus Tally codebase and why, maintaining architectural consistency while acknowledging practical constraints.

## Core Principle

**All user-initiated mutations must go through the command dispatcher to support undo/redo.**

However, **initialization-time mutations that occur before the dispatcher is created are acceptable** because they represent graph construction, not user actions.

## Categories of Acceptable Mutations

### 1. ✅ Command Execution (ALWAYS REQUIRED)

**Location**: `backend/handlers/commands/` and all route handlers that respond to user actions

**Pattern**:
```python
command = UpdatePropertyCommand(
    node_id=node_id,
    property_id=property_id,
    old_value=old_value,
    new_value=new_value,
    graph=graph,
    graph_service=graph_service,
    session_id=session_id,
)
dispatcher.execute(command)
```

**Examples**:
- Manual allocation edits (ManpowerView.tsx) ✓
- Property updates via Inspector ✓
- Node creation/deletion ✓
- Any response to user action ✓

**Why**: These appear in undo/redo stack and must be reversible.

### 2. ✅ Graph Deserialization (ACCEPTABLE BEFORE DISPATCHER INIT)

**Location**: `backend/api/routes.py:load_graph_into_session()` (lines 2140-2211)

**Pattern**:
```python
# During graph load, before dispatcher creation (line 2274)
node = Node(blueprint_type_id=node_type, name=default_name, id=node_uuid)
node.properties = dict(properties)  # Direct assignment acceptable during init
graph.add_node(node)
```

**Specific Case - Reference Remapping** (line 2211):
```python
# Remaps imported string IDs to internal UUIDs during load
node.properties[prop_id] = remapped_value  # Acceptable during init
```

**Why**:
- Happens during graph construction, before dispatcher exists
- No undo/redo stack has entries yet
- Part of deserialization semantics, not user action
- Must complete before dispatcher initialization

**Critical Sequence**:
1. Nodes created and properties set (lines 2140-2160)
2. Parent-child relationships rebuilt (lines 2160-2180)
3. Reference remapping applied (line 2211)
4. **Dispatcher created** (line 2274) ← Everything after this must use commands

### 3. ✅ Orphan Reconciliation (ACCEPTABLE DURING INIT)

**Location**: `backend/infra/orphan_manager.py` via `load_graph_into_session()`

**When**: Called at line 2223, after deserialization but before dispatcher initialization

**Why**: Metadata management to track schema changes, not a user-initiated change

### 4. ✅ Template/Blueprint Property Injection (ACCEPTABLE DURING LOAD)

**Location**: `backend/api/routes.py` during `_apply_template_to_graph()`

**Pattern**: Feature macros, property defaults, and blueprint reconciliation

**Why**:
- Occurs during initial project template application
- Represents the defined structure, not a user modification
- Happens before first user interaction

### 5. ✅ Migrations (ACCEPTABLE DURING PROJECT LOAD)

**Location**: `backend/infra/project_talus_migrations.py`

**When**: Called after orphan reconciliation but before dispatcher initialization (line 2228)

**Why**:
- Schema evolution, not user action
- Must complete during load to ensure consistent state
- Only runs when template version mismatches

## Unacceptable Patterns (❌ DO NOT DO)

### Direct Property Assignment After Dispatcher Exists
```python
# ❌ WRONG - Command dispatcher exists but not used
node.properties['field'] = new_value
_mark_session_dirty(session_id)
```

Instead:
```python
# ✅ CORRECT - Use command system
command = UpdatePropertyCommand(...)
dispatcher.execute(command)
```

### Mutation in Calculation Functions
```python
# ❌ WRONG - Core function mutates as side effect
def recalculate_manual_allocations(nodes):
    for node in nodes:
        node.properties['manual_allocations'] = new_value  # Side effect!
```

Instead:
```python
# ✅ CORRECT - Return changes, let API layer apply via commands
def recalculate_manual_allocations(nodes):
    changes = []
    for node in nodes:
        changes.append({
            'node_id': node.id,
            'property_id': 'manual_allocations',
            'old_value': old_value,
            'new_value': new_value,
        })
    return {'changes': changes, 'count': len(changes)}
```

## Implementation Checklist

### When Adding New Mutation Endpoints:

- [ ] Mutation happens **after** dispatcher exists
- [ ] Use `UpdatePropertyCommand` (or appropriate command class)
- [ ] Call `dispatcher.execute(command)`
- [ ] Do NOT call `_mark_session_dirty()` directly
- [ ] Verify mutation appears in undo/redo stack

### When Adding New Initialization Code:

- [ ] Ensure code runs **before** line 2274 (dispatcher creation)
- [ ] Document why direct mutation is necessary
- [ ] Add comment: `# Initialization-time mutation, acceptable before dispatcher`
- [ ] Cannot be undone, so verify one-time nature

### When Writing Core Calculation Functions:

- [ ] Function must be **pure** (no mutations)
- [ ] Return list of proposed changes
- [ ] Let API layer decide whether to apply via commands
- [ ] Example: `recalculate_manpower_allocations()` returns changes dict

## Architectural Timeline

```
Graph Load Request
    ↓
[INIT PHASE - Direct Mutations OK]
    ├─ Deserialize nodes to graph
    ├─ Rebuild relationships
    ├─ Remap references
    ├─ Reconcile orphans
    └─ Apply migrations
    ↓
[DISPATCHER CREATED] ← Line 2274
    ↓
[COMMAND PHASE - Commands Required]
    ├─ User changes
    ├─ Recalculations via commands
    └─ All edits tracked in undo/redo
```

## Exceptions and Justifications

### Reference Remapping (line 2211)
- **Exception**: Direct mutation during load
- **Justification**: Part of deserialization; converts import-time IDs to internal UUIDs
- **Immutable After**: Once load completes, references don't change
- **Cost of Alternative**: Would need to defer to command system or maintain separate mapping

### Default Status Assignment (project_manager.py:71)
- **Exception**: Direct property assignment during project creation
- **Justification**: Applying template defaults, not a user modification
- **Only Occurs**: On new project creation, not on every load
- **Tracked By**: Blueprint schema, not undo/redo

## Future Guidance

### Undo/Redo Coverage

The goal is 100% coverage of user mutations via commands. Init-time mutations are acceptable but should be minimized:

1. **Preferred**: Complete mutations during init, no commands needed
2. **Acceptable**: Init-time mutation with documentation
3. **Unacceptable**: Mutation after dispatcher exists without command

### When in Doubt

Ask:
- **Q**: Does this happen before or after dispatcher initialization?
- **A**: If before → direct mutation acceptable with documentation
- **A**: If after → must use command system

- **Q**: Is this a user action or system initialization?
- **A**: If user → MUST use commands
- **A**: If init → acceptable before dispatcher

## Testing Implications

### For Init-Time Mutations
- Unit test calculation functions without dispatch
- Integration tests verify final state after full load

### For Command Mutations
- Test undo/redo stack contains entry
- Test redo stack clears on new action
- Test state is reversible

## References

- [CommandDispatcher](../backend/handlers/dispatcher.py)
- [UpdatePropertyCommand](../backend/handlers/commands/node_commands.py)
- [Load Graph Into Session](../backend/api/routes.py#L2013)
- [Recalculate Manpower](../backend/api/budget_gantt_routes.py#L168)
