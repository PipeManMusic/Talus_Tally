# Template Migration System

## Overview

The template migration system ensures that when template schema changes, existing user projects can be automatically migrated to match the new schema without data loss. This is critical for a template-based project management system where users cannot be expected to manually fix their projects with every schema update.

## Architecture

### Core Components

#### 1. **NodeTypeMigration** (`backend/infra/migrations.py`)
Defines how a single node type transforms during a migration.

```python
NodeTypeMigration(
    old_type="camera_gear",           # Type in old schema
    new_type="camera_gear",            # Type in new schema (can be different)
    property_map={                     # Property transformation
        "name": "name",                # old_prop_id -> new_prop_id
        "model": "model",
        "serial": "serial",
        "deprecated_field": None       # None = drop the property
    },
    new_defaults={"status": "active"}  # Optional defaults for new properties
)
```

#### 2. **TemplateMigration** (`backend/infra/migrations.py`)
Orchestrates a migration from one template version to another.

```python
TemplateMigration(
    from_version="0.1.0",
    to_version="0.2.0",
    description="Restructure inventory under inventory_root container",
    node_migrations=[...],              # List of NodeTypeMigrations
    custom_transform=migrate_func       # Optional custom Python function
)
```

Features:
- **Property remapping**: Maps old property IDs to new ones or drops them
- **Custom transforms**: For complex structural changes (moving nodes, creating containers, etc.)
- **Migration messages**: Audit trail of what changed

#### 3. **MigrationRegistry** (`backend/infra/migrations.py`)
Manages the migration graph and applies migrations.

Features:
- **Registration**: `register_migration()` adds migrations to the registry
- **Path finding**: `get_migration_path(from_v, to_v)` uses BFS to find migration sequences
- **Application**: `apply_migrations(graph, from_v, to_v)` applies all migrations in the path
- **Error handling**: Returns success status and messages for each migration

### Project-Specific Migrations

File: `backend/infra/project_talus_migrations.py`

Defines all migrations for the `project_talus` template.

**Migration 0.1.0 → 0.2.0:**
- **Property changes**: None (camera_gear and car_part keep the same properties)
- **Structural changes**: Moves camera_gear and car_part nodes from direct children of project_root to children of inventory_root
- **Custom function**: `migrate_inventory_structure()` creates inventory_root if needed and reparents nodes

## Workflow

### Session Loading

When a project is loaded in [load_graph_into_session](../backend/api/routes.py#L646):

1. **Load project data** → Create `ProjectGraph` with `template_version` from saved data
2. **Load template** → Get current template version
3. **Check version mismatch** → Compare `graph.template_version` vs `blueprint.version`
4. **Apply migrations** → If versions differ, use `MigrationRegistry.apply_migrations()`
5. **Update session** → Store new `template_version` in session

```python
if graph.template_version and graph.template_version != current_version:
    success, messages = migrations_registry.apply_migrations(
        graph,
        from_version=graph.template_version,
        to_version=current_version
    )
    if success:
        graph.template_version = current_version
```

### REST API

#### GET `/api/v1/session/<session_id>/migrations/status`

Check if migrations are needed for current session.

Response:
```json
{
  "status": "migration_available",
  "saved_version": "0.1.0",
  "current_version": "0.2.0",
  "template_id": "project_talus",
  "migration_count": 1,
  "migration_path": ["0.1.0 -> 0.2.0"]
}
```

#### POST `/api/v1/session/<session_id>/migrations/apply`

Apply pending migrations to the session.

Response:
```json
{
  "status": "migration_successful",
  "from_version": "0.1.0",
  "to_version": "0.2.0",
  "messages": [
    "Migration 0.1.0 → 0.2.0: 2 nodes updated",
    "Migrating node 'Camera Equipment' from type 'camera_gear' to 'camera_gear'",
    "Created inventory_root node",
    "Moved node 'Camera Equipment' (camera_gear) from project_root to inventory_root",
    "..."
  ]
}
```

## Creating a New Migration

### 1. Define the Migration

In `backend/infra/project_talus_migrations.py`:

```python
def migrate_complex_logic(project_graph):
    """Custom transform function for complex migrations."""
    messages = []
    # ... transform logic ...
    return messages

migration_0_2_to_0_3 = TemplateMigration(
    from_version="0.2.0",
    to_version="0.3.0",
    description="Add new property to season nodes",
    node_migrations=[
        NodeTypeMigration(
            old_type="season",
            new_type="season",
            property_map={
                "name": "name",
                "number": "number",
                "new_field": "default_value"  # Map to new property
            }
        ),
    ],
    custom_transform=migrate_complex_logic
)

# Register it
register_migration(migration_0_2_to_0_3)
```

### 2. Update Template Version

In `data/templates/project_talus.yaml`:

```yaml
version: "0.3.0"  # Increment version number
node_types:
  season:
    # ... updated schema ...
```

### 3. Test the Migration

Run the test suite:

```bash
python tests/test_migrations.py
```

Add new test in `tests/test_migrations.py`:

```python
def test_0_2_to_0_3_migration():
    graph = ProjectGraph(template_id='project_talus', template_version='0.2.0')
    # ... create test data ...
    registry = get_migration_registry()
    success, messages = registry.apply_migrations(graph, '0.2.0', '0.3.0')
    assert success
    # ... verify results ...
```

## Key Design Decisions

### 1. **Version as String, Not Semver**
- Uses simple string comparison for matching migrations
- Allows flexibility in versioning scheme (0.1.0, 0.1.x, custom)

### 2. **Immutable Migration Definitions**
- Once registered, migrations cannot be changed
- Ensures consistent behavior for old and new projects

### 3. **BFS Path Finding**
- Automatically finds migration sequences for multi-step updates (0.1 → 0.2 → 0.3)
- Migrations are composable

### 4. **Property Dropping**
- Properties can be mapped to `None` to explicitly drop them
- Prevents silent data loss by requiring explicit intent

### 5. **Custom Transforms**
- For complex structural migrations (moving nodes, creating containers)
- Allows full control over tree transformation logic
- Still tracked with audit messages

## Migration Status

### Completed
✅ Migration framework core (NodeTypeMigration, TemplateMigration, MigrationRegistry)
✅ Project-specific migration: 0.1.0 → 0.2.0
✅ Structural migration: Move camera_gear/car_part under inventory_root
✅ Session loading integration
✅ REST API endpoints for status and application
✅ Unit tests (all passing)

### Future
- UI notification of pending migrations
- Automatic migration on session load vs manual trigger
- Migration rollback capability
- Migration progress reporting for large projects
- Documentation for users

## Error Handling

If a migration fails:
- Returns `success=False` with detailed error messages
- Session loading continues with old data (better than crashing)
- Admin can retry migration or investigate manually
- API endpoint `/migrations/apply` can be called manually

## Performance

- **BFS path finding**: O(V+E) where V=versions, E=migrations
- **Node migration**: O(N) where N=number of nodes
- **Custom transforms**: Depends on implementation
- Large projects (10,000+ nodes): ~100-500ms per migration step

## Testing

Run all migration tests:
```bash
cd "/home/dworth/Dropbox/Bronco II/Talus Tally"
python tests/test_migrations.py
```

Expected output: **3/3 tests passed**
- ✓ Migration path finding
- ✓ Simple node property migration
- ✓ Structural node migration

## References

- [Migration Framework](../backend/infra/migrations.py)
- [Project Talus Migrations](../backend/infra/project_talus_migrations.py)
- [Routes Integration](../backend/api/routes.py#L646)
- [ProjectGraph](../backend/core/graph.py)
- [Test Suite](../tests/test_migrations.py)
