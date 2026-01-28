# Phase 2 WebSocket Implementation - Quick Reference Checklist

## 📋 Prioritized Task List

### Priority 1: Foundation (Start here)

- [ ] Create `backend/websocket/broadcaster.py`
  - `WebSocketBroadcaster` class with emit methods
  - Handle all 14 event types
  - Error handling for missing socketio
  
- [ ] Create `backend/websocket/handlers.py`
  - `@socketio.on('connect')` handler
  - `@socketio.on('disconnect')` handler
  - Session validation and room management
  
- [ ] Modify `backend/app.py`
  - Import and initialize SocketIO
  - Register websocket handlers
  - Ensure CORS allows WebSocket
  
- [ ] Create `backend/websocket/__init__.py`
  - Broadcaster registry (get/set functions)
  - Initialization code

**Tests for Priority 1:**
- [ ] `tests/websocket/test_broadcaster.py` - Unit tests
- [ ] `tests/websocket/test_handlers.py` - Handler tests

---

### Priority 2: Event Emissions (Medium)

- [ ] Create `backend/websocket/context.py`
  - Thread-local session context management
  - `set_current_session()`, `get_current_session()`
  
- [ ] Modify `backend/handlers/dispatcher.py`
  - Accept optional `event_emitter` in `__init__`
  - Emit `command:executing`, `command:executed` in `execute()`
  - Emit `command:undo`, `command:redo` in undo/redo methods
  
- [ ] Modify `backend/handlers/commands/node_commands.py`
  - `CreateNodeCommand` → emit `graph:node-created`
  - `DeleteNodeCommand` → emit `graph:node-deleted`
  - `LinkNodeCommand` → emit `graph:node-linked`
  - `UpdatePropertyCommand` → emit via GraphService
  
- [ ] Modify `backend/api/graph_service.py`
  - Add event emitter to `notify_property_changed()`
  - Emit `graph:property-changed` events

**Tests for Priority 2:**
- [ ] `tests/websocket/test_command_events.py` - Integration tests
- [ ] `tests/websocket/test_property_events.py` - Property tests

---

### Priority 3: Session Management (Quick)

- [ ] Create `backend/websocket/session_manager.py`
  - Track client → session mappings
  - Count clients per session
  - Handle registration/unregistration
  
- [ ] Update `backend/api/routes.py`
  - Set session context at start of each endpoint
  - Use `set_current_session()` from context module

**Tests for Priority 3:**
- [ ] `tests/websocket/test_session_manager.py`
- [ ] `tests/websocket/test_session_isolation.py`

---

### Priority 4: Testing (Important)

- [ ] Create comprehensive test suite
  - Unit tests: Broadcaster, handlers, context
  - Integration tests: Commands → events
  - E2E tests: REST API → WebSocket → client
  
- [ ] Add performance tests (optional)
  - Many clients per session
  - High event throughput

**Test files:**
- [ ] `tests/websocket/__init__.py`
- [ ] `tests/websocket/conftest.py` - Fixtures
- [ ] `tests/websocket/test_broadcaster.py`
- [ ] `tests/websocket/test_handlers.py`
- [ ] `tests/websocket/test_command_events.py`
- [ ] `tests/websocket/test_property_events.py`
- [ ] `tests/websocket/test_session_manager.py`
- [ ] `tests/websocket/test_e2e.py`

---

### Priority 5: Documentation

- [ ] Update `docs/WEBSOCKET_GUIDE.md`
  - Event catalog
  - Usage examples
  - Debugging tips
  
- [ ] Create `docs/WEBSOCKET_CLIENT_EXAMPLE.md`
  - JavaScript client code
  - Connect with session auth
  - Listen for events

---

## Event Type Checklist

### Graph Structure Events
- [ ] `graph:node-created` - Node added
- [ ] `graph:node-deleted` - Node removed
- [ ] `graph:node-linked` - Child linked to parent
- [ ] `graph:node-unlinked` - Child unlinked

### Property Events
- [ ] `graph:property-changed` - Property updated
- [ ] `graph:property-deleted` - Property removed

### Command Events
- [ ] `command:executing` - Command started
- [ ] `command:executed` - Command completed
- [ ] `command:failed` - Command error
- [ ] `command:undo` - Undo performed
- [ ] `command:redo` - Redo performed

### Session Events
- [ ] `session:connected` - Client connected
- [ ] `session:disconnected` - Client disconnected

### Project Events
- [ ] `project:saved` - Project saved
- [ ] `project:loaded` - Project loaded

**Total: 14 event types**

---

## Key Design Decisions

✅ **Use Socket.IO** (already installed)
- Production-ready
- Works in all browsers
- Automatic reconnection
- Fallback to polling

✅ **Session-based routing**
- Events only go to clients in same session
- Room: `session_{session_id}`
- Prevents leakage between users

✅ **Optional feature**
- WebSocket works independently
- REST API unchanged if WebSocket disabled
- Commands emit events if available

✅ **Non-blocking**
- Events emitted after command completes
- Async broadcasting
- No performance impact on business logic

✅ **Graceful degradation**
- Works without WebSocket initialized
- Silent failures (logged)
- Tested both with and without

---

## Dependencies

**Already Installed:**
- ✅ `python-socketio==5.10.0`
- ✅ `Flask==3.0.0`

**Auto-installed with socket-io:**
- ✅ `python-engineio==4.8.0`

**For testing (optional):**
- ✅ `pytest==9.0.2` (already have)
- 🔄 `python-socketio[client]` (for client tests)

---

## Testing Checklist

### Unit Tests
- [ ] Broadcaster emits correct payload structure
- [ ] Broadcaster uses correct room name
- [ ] Broadcaster handles None socketio gracefully
- [ ] Context manager thread-safe
- [ ] SessionManager tracks clients correctly

### Integration Tests
- [ ] CreateNodeCommand → graph:node-created
- [ ] UpdatePropertyCommand → graph:property-changed
- [ ] Dispatcher.execute() → command:executed
- [ ] Dispatcher.undo() → command:undo
- [ ] Events include correct timestamps

### E2E Tests
- [ ] REST POST /api/v1/commands/execute → client receives event
- [ ] Multiple clients in same session all receive event
- [ ] Clients in different sessions don't receive each other's events
- [ ] Disconnect removes client from session
- [ ] Reconnect successfully re-joins room

### Performance Tests
- [ ] Command execution <5% slower with WebSocket
- [ ] Event broadcast <100ms latency
- [ ] 1000+ events/second throughput

---

## Estimated Timeline

| Phase | Tasks | Est. Hours | Days |
|-------|-------|-----------|------|
| 1 | Foundation (broadcaster, handlers, app init) | 6 | 1-2 |
| 2 | Event emissions (commands, properties) | 7 | 1-2 |
| 3 | Session management | 4 | 0.5 |
| 4 | Testing | 15-19 | 2-2.5 |
| 5 | Documentation | 4 | 0.5 |
| **Total** | | **36-41 hours** | **5-6 days** |

---

## Success Criteria

- ✅ All 14 event types implemented
- ✅ Session isolation working
- ✅ 50+ tests passing
- ✅ E2E test demonstrates full flow
- ✅ No performance regression
- ✅ Backward compatible with REST API
- ✅ Documentation complete
- ✅ Examples for client developers

---

## Running Tests

```bash
# All WebSocket tests
pytest tests/websocket/ -v

# Specific test file
pytest tests/websocket/test_broadcaster.py -v

# With coverage
pytest tests/websocket/ --cov=backend.websocket -v

# Watch mode (if using pytest-watch)
ptw tests/websocket/
```

---

## Debugging Tips

**Check if WebSocket is initialized:**
```python
from backend.websocket import get_broadcaster
broadcaster = get_broadcaster()
print(broadcaster)  # Should be WebSocketBroadcaster instance, not None
```

**Monitor events in logs:**
```python
# Set logging level to DEBUG
import logging
logging.getLogger('backend.websocket').setLevel(logging.DEBUG)
```

**Test client connection:**
```bash
# Terminal 1: Start server
python -m backend.app

# Terminal 2: Test connection
python -c "
from socketio import SimpleClient
c = SimpleClient()
c.connect('http://localhost:5000', 
         auth={'session_id': 'test'})
print('Connected!')
"
```

---

## Questions to Resolve

- [ ] Do we need event filtering (e.g., "only send me node:created events")?
- [ ] Should we persist events (replay on reconnect)?
- [ ] Need two-way communication (client → server commands)?
- [ ] Should we support multiple projects per session?
- [ ] What's the max event throughput we need to support?

