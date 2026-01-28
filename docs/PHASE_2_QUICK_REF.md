# Phase 2 WebSocket - Quick Reference Card

Print this out or keep it open while implementing!

---

## 14 Event Types at a Glance

### 📦 Graph Structure Events (4)
```
graph:node-created
  Payload: {node_id, name, blueprint_type_id, parent_id?, timestamp}
  When: Node added to graph
  Source: CreateNodeCommand

graph:node-deleted
  Payload: {node_id, timestamp}
  When: Node removed from graph
  Source: DeleteNodeCommand

graph:node-linked
  Payload: {parent_id, child_id, timestamp}
  When: Parent-child relationship created
  Source: LinkNodeCommand

graph:node-unlinked
  Payload: {parent_id, child_id, timestamp}
  When: Parent-child relationship removed
  Source: LinkNodeCommand.undo()
```

### 📝 Property Events (2)
```
graph:property-changed
  Payload: {node_id, property_id, old_value, new_value, timestamp}
  When: Node property updated
  Source: GraphService.notify_property_changed()

graph:property-deleted
  Payload: {node_id, property_id, timestamp}
  When: Property removed from node
  Source: (Future command)
```

### ⚡ Command Events (5)
```
command:executing
  Payload: {command_id, command_type, timestamp}
  When: Command starts
  Source: Dispatcher.execute()

command:executed
  Payload: {command_id, command_type, result?, timestamp}
  When: Command completes successfully
  Source: Dispatcher.execute()

command:failed
  Payload: {command_id, command_type, error, timestamp}
  When: Command throws exception
  Source: Dispatcher.execute() error handler

command:undo
  Payload: {command_id, timestamp}
  When: Undo operation performed
  Source: Dispatcher.undo()

command:redo
  Payload: {command_id, timestamp}
  When: Redo operation performed
  Source: Dispatcher.redo()
```

### 👥 Session Events (2)
```
session:connected
  Payload: {session_id, client_count, timestamp}
  When: Client connects to WebSocket
  Source: WebSocket handler

session:disconnected
  Payload: {session_id, client_count, timestamp}
  When: Client disconnects
  Source: WebSocket handler
```

### 💾 Project Events (2)
```
project:saved
  Payload: {project_id, timestamp}
  When: Project saved to disk
  Source: (Future: project_manager)

project:loaded
  Payload: {project_id, graph, timestamp}
  When: Project loaded from disk
  Source: (Future: project_manager)
```

---

## Code Pattern Checklist

### ✅ When adding a new command:

1. **Accept event_emitter in `__init__`**
   ```python
   def __init__(self, ..., event_emitter=None):
       self.event_emitter = event_emitter
   ```

2. **Emit event in `execute()`**
   ```python
   def execute(self):
       # ... do work ...
       if self.event_emitter:
           from backend.websocket.context import get_current_session
           session_id = get_current_session()
           if session_id:
               self.event_emitter.emit_node_created(...)
   ```

3. **Test it**
   ```python
   def test_command_emits_event():
       broadcaster = Mock()
       cmd = CreateNodeCommand(..., event_emitter=broadcaster)
       cmd.execute()
       broadcaster.emit_node_created.assert_called_once()
   ```

### ✅ When emitting from non-command code:

1. **Get broadcaster**
   ```python
   from backend.websocket import get_broadcaster
   broadcaster = get_broadcaster()
   ```

2. **Get session context**
   ```python
   from backend.websocket.context import get_current_session
   session_id = get_current_session()
   ```

3. **Emit safely**
   ```python
   if broadcaster and session_id:
       broadcaster.emit_property_changed(session_id, ...)
   ```

### ✅ In routes (set session context):

```python
from backend.websocket.context import set_current_session

@api_bp.before_request
def set_session_context():
    session_id = request.headers.get('X-Session-ID')
    if session_id:
        set_current_session(session_id)
```

---

## File Tree: What Gets Created

```
NEW FILES:
backend/websocket/
├── __init__.py              (50 lines)
├── broadcaster.py           (300 lines)
├── handlers.py              (150 lines)
├── context.py               (50 lines)
└── session_manager.py       (100 lines)

tests/websocket/
├── __init__.py
├── conftest.py              (100 lines)
├── test_broadcaster.py      (200 lines)
├── test_handlers.py         (150 lines)
├── test_command_events.py   (200 lines)
├── test_property_events.py  (150 lines)
├── test_session_manager.py  (100 lines)
└── test_e2e.py              (300 lines)

MODIFIED FILES:
backend/app.py              (add Socket.IO init)
backend/handlers/dispatcher.py
backend/handlers/commands/node_commands.py
backend/api/graph_service.py
backend/api/routes.py
```

---

## Connection Flow Diagram

```
CLIENT                          SERVER
  │                               │
  ├─ socket.connect()─────────────►
  │  + auth: {session_id}         │
  │                         handler_connect
  │                              │
  │                    join_room(session_ABC)
  │◄─────── 'session:connected'──┤
  │         {client_count: 2}     │
  │                               │
  │  (WebSocket connected)        │
  │                               │
  ├─ POST /api/v1/cmd ───────────►
  │                    set_session_context
  │                              │
  │                    dispatcher.execute()
  │                              │
  │                  broadcaster.emit_*()
  │◄───── 'graph:node-created'───┤
  │       (broadcast to room)     │
  │                               │
  │◄──── REST response ───────────┤
  │      {success: true}          │
  │                               │
  └─ socket.disconnect()─────────►
                            handler_disconnect
                                   │
                           leave_room(...)
                                   │
                    broadcast 'session:disconnected'
```

---

## Event Emission Locations

### 📍 In Dispatcher
- `command:executing` → `execute()` start
- `command:executed` → `execute()` end
- `command:failed` → `execute()` exception
- `command:undo` → `undo()` method
- `command:redo` → `redo()` method

### 📍 In CreateNodeCommand
- `graph:node-created` → `execute()` after add_node()

### 📍 In DeleteNodeCommand
- `graph:node-deleted` → `execute()` after remove_node()

### 📍 In LinkNodeCommand
- `graph:node-linked` → `execute()` after linking
- `graph:node-unlinked` → `undo()` after unlinking

### 📍 In GraphService
- `graph:property-changed` → `notify_property_changed()` loop

### 📍 In WebSocket Handlers
- `session:connected` → `connect` handler
- `session:disconnected` → `disconnect` handler

---

## Testing Checklist by Component

### Broadcaster Tests
- [ ] All 14 emit methods exist
- [ ] Correct event names
- [ ] Correct payload structure
- [ ] Timestamp included
- [ ] Room name is `session_{id}`
- [ ] Handles None socketio gracefully

### Handler Tests
- [ ] Connect with valid session_id → accepted
- [ ] Connect without session_id → rejected
- [ ] Disconnect removes from room
- [ ] Multiple clients → each tracked
- [ ] Session:connected emitted on connect
- [ ] Session:disconnected emitted on disconnect

### Command Event Tests
- [ ] CreateNodeCommand → graph:node-created
- [ ] DeleteNodeCommand → graph:node-deleted
- [ ] LinkNodeCommand → graph:node-linked + unlinked
- [ ] Dispatcher.execute → command:executing + executed
- [ ] Dispatcher.undo → command:undo
- [ ] Dispatcher.redo → command:redo

### Property Event Tests
- [ ] UpdatePropertyCommand → graph:property-changed
- [ ] Old/new values in payload
- [ ] Node ID correct

### Session Isolation Tests
- [ ] Event in session A → not in session B
- [ ] Multiple clients in A → all get event
- [ ] Room naming prevents leakage

### E2E Tests
- [ ] REST POST → WebSocket event
- [ ] Client receives within 100ms
- [ ] Multiple clients all receive
- [ ] Malformed event handled gracefully

---

## Debugging Commands

### Check WebSocket is initialized:
```python
from backend.websocket import get_broadcaster
b = get_broadcaster()
print(f"Broadcaster: {b}")  # Should not be None
```

### Check session context:
```python
from backend.websocket.context import get_current_session
s = get_current_session()
print(f"Session: {s}")  # Should be session ID
```

### Test Socket.IO client connection:
```bash
python -c "
from socketio import SimpleClient
c = SimpleClient()
c.connect('http://localhost:5000', auth={'session_id': 'test'})
print('Connected!')
"
```

### Monitor events in client:
```javascript
socket.onAny((event, ...args) => {
    console.log('Event:', event, 'Data:', args);
});
```

### Verify room membership:
```python
# In Flask app context
from flask_socketio import socketio
rooms = socketio.server.rooms(request.sid)
print(f"Socket {request.sid} in rooms: {rooms}")
```

---

## Time Estimates Per Task

### Foundation Phase (1-2 days)
- Broadcaster module: 2 hours
- Handlers module: 2 hours  
- App.py integration: 1 hour
- Session context: 1 hour
- **Total: 6 hours**

### Emission Phase (1-2 days)
- Dispatcher mods: 2 hours
- Command mods: 3 hours
- GraphService mods: 1 hour
- **Total: 6 hours**

### Session Phase (0.5 days)
- SessionManager: 1 hour
- Route integration: 1 hour
- **Total: 2 hours**

### Testing Phase (2 days)
- Unit tests: 5 hours
- Integration tests: 7 hours
- E2E tests: 5 hours
- **Total: 17 hours**

### Documentation Phase (0.5 days)
- Developer guide: 1 hour
- Client examples: 1 hour
- **Total: 2 hours**

---

## Key Dependencies & Imports

```python
# Core WebSocket
from flask_socketio import SocketIO, emit, join_room, leave_room
from backend.websocket import get_broadcaster, set_broadcaster
from backend.websocket.context import get_current_session, set_current_session

# Testing
from unittest.mock import Mock, patch, call
import pytest
from socketio import SimpleClient

# Type hints
from typing import Optional, Dict, Any
from uuid import UUID
```

---

## Success Indicators

✅ **Phase 2.1 Done When:**
- Broadcaster has 14 working emit methods
- Handlers properly join/leave rooms
- Socket.IO initializes without errors
- First simple test passes

✅ **Phase 2.2 Done When:**
- Dispatcher emits 5 command events
- CreateNodeCommand emits graph:node-created
- Tests for each emission pass
- No business logic changes needed

✅ **Phase 2.3 Done When:**
- Session context works in routes
- Multiple requests get right session
- Events broadcast to right session only

✅ **Phase 2.4 Done When:**
- 50+ tests passing
- Coverage >80%
- E2E test demonstrates full flow
- No performance regression

✅ **Phase 2.5 Done When:**
- Developer guide complete
- Client example working
- All APIs documented
- Code review passed

---

## Common Gotchas

❌ **Don't**: Pass event_emitter as required parameter
✅ **Do**: Make it optional with default None

❌ **Don't**: Emit event inside async task
✅ **Do**: Emit synchronously after command completes

❌ **Don't**: Share session context between threads
✅ **Do**: Use thread-local storage

❌ **Don't**: Broadcast to global room
✅ **Do**: Always use `session_{session_id}` rooms

❌ **Don't**: Crash if WebSocket not initialized
✅ **Do**: Check if broadcaster is None, gracefully skip

---

## Questions & Answers

**Q: What if WebSocket fails to initialize?**
A: Flask app still works fine. REST API functions. Events silently skip (logged).

**Q: What if client loses connection?**
A: Socket.IO auto-reconnects. Client re-authenticates. Missed events not replayed (design decision).

**Q: Can one client break other clients?**
A: No. Each client in separate Socket.IO connection. Session room isolation prevents interference.

**Q: How do we scale to many clients?**
A: Session-based rooms handle N clients per session efficiently. Socket.IO uses efficient broadcasts.

**Q: Do we need Redis for multi-server?**
A: Not for Phase 2. Current design is single-server. Add later if needed (Phase 3+).

**Q: What's the performance impact?**
A: <5% overhead on command execution. Async emissions don't block. Benchmarks included in tests.

