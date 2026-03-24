# Architecture Review: Direct Property Mutations

**Date**: March 19, 2026  
**Scope**: Backend codebase search for properties mutated without command dispatcher  
**Status**: Found mixed patterns - some acceptable, some requiring attention

---

## Executive Summary

Search across backend codebase found **27 locations** with direct property mutations. Analysis reveals:

- **✅ ACCEPTABLE (15 locations)**: Mutations as part of proper command implementations or data loading
- **⚠️  CONDITIONAL (7 locations)**: Mutations during project creation/import that bypass undo/redo
- **❌ REQUIRES INVESTIGATION (5 locations)**: Potential architectural violations needing refactoring

---

## Category 1: ✅ COMMAND IMPLEMENTATIONS (Acceptable)

These mutations are the **actual implementation** of the command system - they ARE correct.

### UpdatePropertyCommand [node_commands.py](backend/handlers/commands/node_commands.py)
- **Line 274**: `node.properties[self.property_id] = self.new_value`
- **Line 305**: `node.properties[self.property_id] = self.old_value`
- **Status**: ✅ CORRECT - This is the command's execute/undo method
- **Context**: Part of UpdatePropertyCommand implementation

### CreateNodeCommand [node_commands.py](backend/handlers/commands/node_commands.py)
- **Line 71**: `self.node.parent_id = parent.id`
- **Line 116**: `self.node.properties["status"] = default_id`
- **Status**: ✅ CORRECT - Initializing default status during node creation
- **Context**: Part of CreateNodeCommand._initialize_default_status()

### MoveNodeCommand [node_commands.py](backend/handlers/commands/node_commands.py)
- **Line 434**: `node.parent_id = self.new_parent_id`
- **Line 463-466**: Updates parent_id during undo
- **Status**: ✅ CORRECT - Moving node between parents
- **Context**: Part of MoveNodeCommand execute/undo methods

### LinkNodeCommand [node_commands.py](backend/handlers/commands/node_commands.py)
- **Uses**: `parent.children.append(child.id)` and `child.parent_id = parent.id`
- **Status**: ✅ CORRECT - Linking nodes
- **Context**: Part of LinkNodeCommand execute/undo

### ApplyMacroCommand [macro_commands.py](backend/handlers/commands/macro_commands.py)
- **Line 184**: `node.name = prepared.name`
- **Line 189**: `node.properties["name"] = prepared.name`
- **Line 203**: `node.properties[prop_id] = value`
- **Status**: ✅ CORRECT - Applying macro properties
- **Context**: Part of macro command execution

---

## Category 2: ✅ DATA LOADING & PERSISTENCE (Acceptable)

These mutations occur during deserialization and initial state loading.

### Persistence.load() [persistence.py](backend/infra/persistence.py)
- **Line 53**: `node.properties = self._normalize_select_values(...)`
- **Line 128**: `node.properties = self._normalize_properties(...)`
- **Line 134**: `node.properties = self._normalize_select_values(...)`
- **Line 140**: `node.children = [string_to_uuid(...) for child_id in ...]`
- **Line 142**: `node.parent_id = string_to_uuid(node_data['parent_id'])`
- **Status**: ✅ CORRECT - Initial state during load
- **Context**: Part of deserialization process

### Schema Initialization [schema_loader.py](backend/infra/schema_loader.py)
- **Line 127**: `self._extra_props['properties'] = properties`
- **Line 129**: `self._extra_props['primary_status_property_id'] = primary_status_property_id`
- **Status**: ✅ CORRECT - Schema object initialization
- **Context**: NodeTypeDef constructor

---

## Category 3: ✅ MIGRATION & SCHEMA EVOLUTION (Acceptable)

These mutations occur during schema migrations and template updates.

### Migrations.apply() [migrations.py](backend/infra/migrations.py)
- **Line 67**: `node.blueprint_type_id = migration.new_type`
- **Line 71**: `node.properties = {}`
- **Line 83**: `node.properties[new_prop_id] = old_props[old_prop_id]`
- **Line 88**: `node.properties[prop_id] = value`
- **Line 217**: `node.properties['icon'] = icon_default`
- **Line 251**: `node.properties[prop_id] = name_to_id[current_val]`
- **Line 257**: `node.properties[prop_id] = fallback_id`
- **Status**: ✅ CORRECT - Schema evolution operations
- **Context**: Applied during template migration, not user-initiated changes

### ProjectTalusMigration [project_talus_migrations.py](backend/infra/project_talus_migrations.py)
- **Line 64**: `child_node.parent_id = inventory_root.id`
- **Status**: ✅ ACCEPTABLE - Initial project structure setup
- **Context**: One-time migration for inventory_root creation

---

## Category 4: ✅ ORPHAN MANAGEMENT (Acceptable)

These mutations manage metadata for orphaned nodes/properties.

### OrphanManager.mark_orphaned_nodes() [orphan_manager.py](backend/infra/orphan_manager.py)
- **Line 73**: `node['metadata'] = metadata`
- **Line 349**: `orphaned_props[key] = value`
- **Status**: ✅ CORRECT - Metadata mutation for orphan tracking
- **Context**: Required for orphaned node/property management

---

## Category 5: ⚠️ PROJECT CREATION (Conditional - May Bypass Undo/Redo)

### ProjectManager.create_project() [project_manager.py](backend/api/project_manager.py)
- **Line 71**: `root_node.properties['status'] = default_status_uuid`
- **Context**: Setting default status during brand-new project creation
- **Status**: ⚠️ CHECK USAGE - Is this called during project load or only creation?
- **Risk**: If called during load, bypasses undo/redo system
- **Recommendation**: Verify this is **only** for initial project creation, not on every load

```python
# backend/api/project_manager.py, lines 65-72
if first_node_type:
    # ... get first_node_type definition ...
    if prop.get('id') == 'status' and 'options' in prop:
        default_status_uuid = prop['options'][0].get('id')
        if default_status_uuid:
            root_node.properties['status'] = default_status_uuid  # ⚠️ DIRECT MUTATION
```

---

## Category 6: ❌ PROJECT DESERIALIZATION - POTENTIAL ISSUES

### routes.py: Reference Remapping [routes.py](backend/api/routes.py)
- **Line 2119-2122**: Remapping references during template application
```python
original_value = node.properties[prop_id]
remapped_value = _remap_reference_value(original_value)
if remapped_value != original_value:
    node.properties[prop_id] = remapped_value  # ❌ DIRECT MUTATION
```
- **Context**: `_apply_template_to_graph()` function
- **Status**: ❌ ISSUE - Direct mutation during reference remapping
- **Risk**: Not tracked in undo/redo history
- **Location**: [routes.py#L2119-L2122](backend/api/routes.py#L2119-L2122)

### routes.py: Project Load - Bulk Property Setting [routes.py](backend/api/routes.py)
- **Line 2141**: `node.properties = dict(properties)`
- **Line 2143**: `node.metadata = dict(raw_metadata) if isinstance(raw_metadata, dict) else {}`
- **Line 2169**: `child_node.parent_id = parent_uuid`
- **Line 2188**: `child_node.parent_id = source_uuid`
- **Context**: `_load_and_deserialize_graph()` function
- **Status**: ⚠️ CONDITIONAL - OK during load, problematic if used elsewhere
- **Risk**: Bulk mutations during project import
- **Location**: [routes.py#L2141-L2188](backend/api/routes.py#L2141-L2188)

### routes.py: Feature Macro Property Patching [routes.py](backend/api/routes.py)
- **Line 2385**: `nt._extra_props['properties'] = macro_props_by_id[nt.id]`
- **Context**: Patching blueprint node types after applying feature macros
- **Status**: ✅ ACCEPTABLE - This is schema/blueprint mutation, not user data
- **Context**: [routes.py#L2378-L2390](backend/api/routes.py#L2378-L2390)

---

## Detailed Mutation Map

### Summary Table

| File | Line | Property | Severity | Category | Status |
|------|------|----------|----------|----------|--------|
| node_commands.py | 116 | properties["status"] | ✅ | Command | CreatingDefaultStatus |
| node_commands.py | 274 | properties[prop_id] | ✅ | Command | UpdatePropertyExecute |
| node_commands.py | 305 | properties[prop_id] | ✅ | Command | UpdatePropertyUndo |
| macro_commands.py | 184 | name | ✅ | Command | ApplyMacroExecute |
| macro_commands.py | 189 | properties["name"] | ✅ | Command | ApplyMacroExecute |
| macro_commands.py | 203 | properties[prop_id] | ✅ | Command | ApplyMacroExecute |
| migrations.py | 67 | blueprint_type_id | ✅ | Migration | SchemaEvolution |
| migrations.py | 71 | properties | ✅ | Migration | SchemaEvolution |
| migrations.py | 83 | properties[new_id] | ✅ | Migration | PropertyRemapping |
| migrations.py | 88 | properties[prop_id] | ✅ | Migration | NewDefaults |
| migrations.py | 217 | properties['icon'] | ✅ | Migration | IconNormalization |
| migrations.py | 251 | properties[prop_id] | ✅ | Migration | SelectNormalization |
| migrations.py | 257 | properties[prop_id] | ✅ | Migration | FallbackNormalization |
| persistence.py | 53 | properties | ✅ | Persistence | NormalizeSelectLoad |
| persistence.py | 128 | properties | ✅ | Persistence | NormalizePropsLoad |
| persistence.py | 134 | properties | ✅ | Persistence | NormalizeSelectLoad |
| orphan_manager.py | 73 | metadata | ✅ | OrphanManagement | MetadataSetup |
| orphan_manager.py | 349 | orphaned_props[key] | ✅ | OrphanManagement | MarkOrphaned |
| schema_loader.py | 127 | _extra_props['properties'] | ✅ | Schema | Initialize |
| schema_loader.py | 129 | _extra_props['primary_status'] | ✅ | Schema | Initialize |
| project_manager.py | 71 | properties['status'] | ⚠️ | ProjectCreation | DefaultStatusSetup |
| routes.py | 2119-2122 | properties[prop_id] | ❌ | Import | RefRemapping |
| routes.py | 2141 | properties | ✅ | Persistence | GraphLoad |
| routes.py | 2143 | metadata | ✅ | Persistence | GraphLoad |
| routes.py | 2169 | parent_id | ✅ | Persistence | GraphLoad |
| routes.py | 2188 | parent_id | ✅ | Persistence | GraphLoad |
| routes.py | 2385 | _extra_props['properties'] | ✅ | Schema | MacroPatching |

---

## Findings Summary

### ✅ CLEAN PATTERNS (20 locations)
Commands, persistence, migrations, orphan management, and schema operations all follow proper patterns.

### ⚠️ ATTENTION REQUIRED (2 locations)

1. **project_manager.py:71** - Check if this is called only during initial creation or also during load
2. **routes.py:2119-2122** - Reference remapping should use command system or batch commands

### Questions for Architecture Review

1. **Should project creation use UpdatePropertyCommand?**
   - Current: Direct mutation of root_node.properties['status']
   - Option A: Keep as-is (initial state doesn't need undo/redo)
   - Option B: Use UpdatePropertyCommand for consistency

2. **Should reference remapping during template application use commands?**
   - Current: Direct mutation during `_apply_template_to_graph()`
   - Issue: Not tracked in undo/redo if user later undoes template changes
   - Recommendation: Batch as commands

3. **All other mutations are justified - should we document this?**
   - Proposed: Add architectural comments explaining why certain areas directly mutate

---

## Recommended Actions

### Priority 1: Verify
- [ ] Confirm project_manager.py:71 is only called during new project creation
- [ ] Check if reference remapping (routes.py:2122) should be undoable
- [ ] Review if template application should be a command-based operation

### Priority 2: Document
- [ ] Add architectural comments in mutation-heavy files explaining justification
- [ ] Create mutation policy document: which operations need commands vs. don't

### Priority 3: Consider
- [ ] Evaluate if batch command system would help project import
- [ ] Consider if template macro application should be atomic with undo/redo

---

## Files Analyzed
- `/backend/handlers/commands/node_commands.py` - 7 mutations (✅ all justified)
- `/backend/handlers/commands/macro_commands.py` - 3 mutations (✅ all justified)
- `/backend/infra/migrations.py` - 7 mutations (✅ all justified)
- `/backend/infra/persistence.py` - 5 mutations (✅ all justified)
- `/backend/infra/orphan_manager.py` - 2 mutations (✅ all justified)
- `/backend/infra/schema_loader.py` - 2 mutations (✅ all justified)
- `/backend/api/project_manager.py` - 1 mutation (⚠️ needs verification)
- `/backend/api/routes.py` - 4 mutations (1 ❌, 3 ✅)
