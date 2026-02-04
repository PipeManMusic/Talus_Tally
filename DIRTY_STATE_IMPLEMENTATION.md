# Dirty/Clean State Integration - Complete Implementation

## Overview

Implemented comprehensive dirty/clean state tracking across the API and UI to handle unsaved changes. The system now:

1. **Tracks modifications** - Backend marks sessions as dirty when commands execute
2. **Prevents data loss** - UI prompts users before creating new projects with unsaved changes
3. **Integrates with save** - File save operations mark sessions as clean
4. **Provides visibility** - API endpoints expose dirty state for UI decision-making

---

## Backend Implementation

### 1. Session Metadata Tracking

**File:** `backend/api/routes.py`

Added `is_dirty` flag to session metadata initialization:

```python
_session_metadata[session_id] = {
    'created_at': datetime.now(timezone.utc).isoformat(),
    'last_activity': datetime.now(timezone.utc).isoformat(),
    'active_clients': 0,
    'is_dirty': False  # Track if there are unsaved changes
}
```

### 2. Helper Functions

Added utility functions to manage dirty state:

```python
def _mark_session_dirty(session_id):
    """Mark a session as having unsaved changes."""
    if session_id in _session_metadata:
        _session_metadata[session_id]['is_dirty'] = True

def _mark_session_clean(session_id):
    """Mark a session as clean (no unsaved changes)."""
    if session_id in _session_metadata:
        _session_metadata[session_id]['is_dirty'] = False

def _is_session_dirty(session_id):
    """Check if a session has unsaved changes."""
    if session_id in _session_metadata:
        return _session_metadata[session_id].get('is_dirty', False)
    return False
```

### 3. Dirty State API Endpoints

**Location:** `backend/api/routes.py` - Dirty State Management section

#### GET /api/v1/sessions/{session_id}/dirty
Check if a session has unsaved changes.

```python
@api_bp.route('/sessions/<session_id>/dirty', methods=['GET'])
def check_session_dirty(session_id):
    """Check if a session has unsaved changes."""
    is_dirty = _is_session_dirty(session_id)
    return jsonify({
        'session_id': session_id,
        'is_dirty': is_dirty
    }), 200
```

**Response:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "is_dirty": true
}
```

#### POST /api/v1/sessions/{session_id}/save
Mark session as clean (typically called after file save).

```python
@api_bp.route('/sessions/<session_id>/save', methods=['POST'])
def save_session(session_id):
    """Save session (mark as clean)."""
    _mark_session_clean(session_id)
    _update_session_activity(session_id)
    return jsonify({
        'success': True,
        'session_id': session_id,
        'is_dirty': False
    }), 200
```

#### POST /api/v1/sessions/{session_id}/reset-dirty
Reset dirty state without saving (used when discarding changes).

```python
@api_bp.route('/sessions/<session_id>/reset-dirty', methods=['POST'])
def reset_dirty_state(session_id):
    """Reset dirty state without saving (discard changes)."""
    _mark_session_clean(session_id)
    _update_session_activity(session_id)
    return jsonify({
        'success': True,
        'session_id': session_id,
        'is_dirty': False,
        'message': 'Dirty state reset (changes discarded)'
    }), 200
```

### 4. Command Execution Dirty State Tracking

All command execution routes now mark sessions as dirty and include `is_dirty` in responses:

#### POST /api/v1/commands/execute

```python
# Mark session as dirty after any command execution
_mark_session_dirty(session_id)
_update_session_activity(session_id)

return jsonify({
    'success': True,
    'graph': _serialize_graph(session_data['graph'], session_data.get('blueprint')),
    'undo_available': len(dispatcher.undo_stack) > 0,
    'redo_available': len(dispatcher.redo_stack) > 0,
    'is_dirty': True  # Include dirty state in response
}), 200
```

#### POST /api/v1/sessions/{session_id}/undo

```python
dispatcher.undo()
_update_session_activity(session_id)

return jsonify({
    'success': True,
    'graph': _serialize_graph(session_data['graph'], session_data.get('blueprint')),
    'undo_available': len(dispatcher.undo_stack) > 0,
    'redo_available': len(dispatcher.redo_stack) > 0,
    'is_dirty': _is_session_dirty(session_id)  # Return current dirty state
}), 200
```

#### POST /api/v1/sessions/{session_id}/redo

```python
dispatcher.redo()
_mark_session_dirty(session_id)  # Redo is a modification
_update_session_activity(session_id)

return jsonify({
    'success': True,
    'graph': _serialize_graph(session_data['graph'], session_data.get('blueprint')),
    'undo_available': len(dispatcher.undo_stack) > 0,
    'redo_available': len(dispatcher.redo_stack) > 0,
    'is_dirty': True  # Redo changes state
}), 200
```

---

## Frontend Implementation

### 1. API Client Methods

**File:** `frontend/src/api/client.ts`

Added dirty state management methods to APIClient class:

```typescript
// Check dirty state
async checkDirtyState(sessionId: string): Promise<{ session_id: string; is_dirty: boolean }> {
  const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/dirty`);
  if (!response.ok) throw new Error('Failed to check dirty state');
  return response.json();
}

// Mark session as saved
async saveSession(sessionId: string): Promise<any> {
  const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error('Failed to save session');
  return response.json();
}

// Reset dirty state (discard changes)
async resetDirtyState(sessionId: string): Promise<any> {
  const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/reset-dirty`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error('Failed to reset dirty state');
  return response.json();
}
```

### 2. App State Management

**File:** `frontend/src/App.tsx`

Added dirty state tracking:

```typescript
const [isDirty, setIsDirty] = useState(false);  // Track dirty state
```

### 3. New Project Dialog Dirty Check

**Function:** `handleNew()`

Checks for unsaved changes before showing new project dialog:

```typescript
const handleNew = useCallback(async () => {
  try {
    // Check if current project has unsaved changes
    if (isDirty && sessionId) {
      const confirmed = window.confirm(
        'You have unsaved changes. Do you want to discard them and create a new project?'
      );
      if (!confirmed) return;
      
      // Discard changes
      try {
        await apiClient.resetDirtyState(sessionId);
        setIsDirty(false);
      } catch (err) {
        console.warn('Failed to reset dirty state:', err);
        setIsDirty(false);
      }
    }
    
    // Load templates and show dialog...
  } catch (err) {
    console.error('✗ Failed to load templates:', err);
  }
}, [templates.length, isDirty, sessionId]);
```

### 4. Project Creation

**Function:** `handleCreateProject()`

New projects start clean:

```typescript
const handleCreateProject = useCallback(async (templateId: string, projectName: string) => {
  // ... create project ...
  setIsDirty(false);  // New project is clean
  console.log('✓ Project created with session:', newSessionId);
}, [normalizeGraph, setCurrentGraph]);
```

### 5. Command Execution Dirty Tracking

All command handlers now update dirty state from API responses:

#### CreateNode commands

```typescript
.then((result) => {
  const graph = normalizeGraph(result.graph ?? result);
  setCurrentGraph(graph);
  setIsDirty(result.is_dirty ?? true);  // Update from API
  console.log('✓ Project root added');
})
```

#### DeleteNode commands

```typescript
.then((result) => {
  const graph = normalizeGraph(result.graph ?? result);
  setCurrentGraph(graph);
  setIsDirty(result.is_dirty ?? true);  // Update from API
  console.log('✓ Node deleted via API');
})
```

#### UpdateProperty commands

```typescript
.then((result) => {
  const graph = normalizeGraph(result.graph ?? result);
  setCurrentGraph(graph);
  setIsDirty(result.is_dirty ?? true);  // Update from API
  console.log('✓ Property updated');
})
```

### 6. Save Operations

**Functions:** `handleSave()` and `handleSaveAs()`

File save now marks session as clean:

```typescript
const handleSave = useCallback(async () => {
  try {
    // ... write file to disk ...
    
    // Mark session as clean after saving
    await apiClient.saveSession(sessionId);
    setIsDirty(false);
    console.log('✓ Project saved');
  } catch (err) {
    console.error('✗ Save failed:', err);
    alert('Save failed.');
  }
}, [currentGraph, lastFilePath, sessionId]);
```

---

## Data Flow

### Creating a Node (marks dirty)

```
UI: User clicks "Add Child"
  ↓
UI: executeCommand('CreateNode', ...)
  ↓
API: dispatcher.execute(create_cmd)
  ↓
API: _mark_session_dirty(session_id)
  ↓
API: Response includes is_dirty: true
  ↓
UI: setIsDirty(true)
  ↓
UI: Next time "File > New" is clicked, user sees warning
```

### Saving File (marks clean)

```
UI: User clicks "File > Save"
  ↓
UI: writeTextFile(payload)  // Write to disk
  ↓
UI: apiClient.saveSession(sessionId)
  ↓
API: _mark_session_clean(session_id)
  ↓
API: Response includes is_dirty: false
  ↓
UI: setIsDirty(false)
  ↓
UI: Next time "File > New" clicked, no warning
```

### Creating New Project (discards changes)

```
UI: User clicks "File > New"
  ↓
UI: isDirty === true, show confirmation dialog
  ↓
User clicks "Yes, discard and create new"
  ↓
UI: apiClient.resetDirtyState(sessionId)
  ↓
API: _mark_session_clean(session_id)
  ↓
UI: setIsDirty(false)
  ↓
UI: Show new project dialog
```

---

## Key Design Decisions

1. **Backward Compatible**: All existing API responses still work; `is_dirty` is optional in older responses, defaulting to dirty state to be safe.

2. **Backend Source of Truth**: The API tracks dirty state, not the client. This ensures state is consistent across multiple clients.

3. **No Persistent Storage**: Dirty state resets when sessions expire. Files are only dirty during active editing session.

4. **Undo is Different from Redo**: 
   - **Undo** preserves dirty state (you may still have unsaved changes)
   - **Redo** marks dirty (you're re-applying changes, which counts as modification)

5. **User-Centric Warnings**: Only warn when user tries to discard changes via "New" action, not on every modification.

---

## Testing Scenarios

1. **New Project with Unsaved Changes**
   - Create project → Add node → File > New
   - Expected: Confirmation dialog shown
   - User discards: Dirty state reset, new project dialog shown
   - User cancels: Stays on current project

2. **Save File Marks Clean**
   - Create project → Add node → File > Save
   - Expected: isDirty becomes false
   - File > New should show no warning

3. **Create Node Marks Dirty**
   - Create project → Immediately File > New
   - Expected: No warning (project is new/clean)
   - Add node → File > New
   - Expected: Confirmation dialog shown

4. **Undo/Redo Behavior**
   - Create node → Add property → Undo
   - Expected: Still dirty (property added, then undone)
   - Redo
   - Expected: Still dirty (redo is modification)

---

## Files Modified

- `backend/api/routes.py` - Added dirty state tracking functions and endpoints
- `frontend/src/api/client.ts` - Added dirty state management methods
- `frontend/src/App.tsx` - Added state tracking and integrated checks into handlers

## API Contract Additions

All command responses now include:
```json
{
  "success": true,
  "graph": { ... },
  "undo_available": boolean,
  "redo_available": boolean,
  "is_dirty": boolean  // NEW
}
```

Dirty state check response:
```json
{
  "session_id": "...",
  "is_dirty": boolean
}
```

---

## Future Enhancements

1. **Persist dirty state** - Save to backend storage so it survives session restore
2. **Diff tracking** - Track what changed for more granular dirty indicators
3. **Auto-save** - Automatically save to a temp file periodically
4. **Merge conflicts** - Handle multiple clients editing same session
