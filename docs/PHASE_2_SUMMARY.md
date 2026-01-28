# Phase 2 WebSocket Implementation - Executive Summary

**Status:** Planning Complete  
**Date:** January 28, 2026  
**Complexity:** Medium  
**Estimated Effort:** 36-41 hours (5-6 days)

---

## Overview

This Phase 2 plan adds **real-time WebSocket support** to the Talus Tally project, enabling clients to receive live notifications when the graph changes, properties update, commands execute, or projects load.

**Current State (Phase 1):**
- ✅ Flask REST API with 15+ endpoints
- ✅ Project management, command execution, graph queries
- ✅ 53 tests passing
- ❌ No real-time notifications (polling required)

**After Phase 2:**
- ✅ Socket.IO WebSocket support
- ✅ 14 event types for graph changes
- ✅ Session-based broadcasting
- ✅ 50+ new tests
- ✅ Full real-time architecture
- ✅ Backward compatible with REST API

---

## What Gets Built

### 1. WebSocket Event System

**14 Event Types** across 4 categories:

| Category | Events | Purpose |
|----------|--------|---------|
| **Graph Structure** | node-created, node-deleted, node-linked, node-unlinked | Track tree changes |
| **Properties** | property-changed, property-deleted | Track data updates |
| **Commands** | executing, executed, failed, undo, redo | Track operations |
| **Sessions** | connected, disconnected | Track users |
| **Projects** | saved, loaded | Track project state |

### 2. Socket.IO Architecture

```
/graph namespace (WebSocket)
├── Rooms: session_{session_id}
├── Events: 14 types (see above)
└── Clients: Broadcast to session rooms only
```

### 3. Code Modules (New)

```
backend/websocket/
├── __init__.py          - Module initialization, broadcaster registry
├── broadcaster.py       - WebSocketBroadcaster class (14 emit methods)
├── handlers.py          - Socket.IO connection/disconnect handlers
├── context.py           - Thread-local session context
└── session_manager.py   - Track active sessions & clients
```

### 4. Integration Points (Modified)

```
backend/app.py                  - Initialize Socket.IO
backend/handlers/dispatcher.py  - Emit command events
backend/handlers/commands/      - Emit node creation/deletion events
backend/api/graph_service.py   - Emit property change events
backend/api/routes.py          - Set session context
```

---

## Key Design Decisions

### ✅ Socket.IO (Already Installed)
- Production-ready, well-documented
- Works in all browsers
- Automatic reconnection & fallback
- Session-based rooms for isolation

### ✅ Session-Based Broadcasting
- Events only broadcast to clients in same session
- Prevents data leakage between users
- Room naming: `session_{session_id}`
- Simple, scalable

### ✅ Dependency Injection Pattern
- Commands don't directly depend on WebSocket
- Broadcaster passed as optional parameter
- Works without WebSocket if not initialized
- Maintains backward compatibility

### ✅ Non-Blocking Emissions
- Events emitted AFTER command completes
- Async broadcasting (no perf impact)
- Graceful failures (logged but not fatal)

### ✅ Thread-Local Session Context
- Each request thread knows its session_id
- Eliminates need to pass session through all layers
- Commands automatically emit to correct session

---

## Implementation Roadmap

### Phase 2.1: Foundation (1-2 days)
**Priority: Critical**
- [ ] Create broadcaster module
- [ ] Create Socket.IO handlers
- [ ] Initialize Socket.IO in Flask app
- [ ] Setup session management
- **Result:** Basic WebSocket infrastructure ready

### Phase 2.2: Event Emissions (1-2 days)
**Priority: Critical**
- [ ] Create session context module
- [ ] Modify dispatcher to emit command events
- [ ] Modify command classes to emit node events
- [ ] Modify graph service to emit property events
- **Result:** All business logic emitting events

### Phase 2.3: Session Management (0.5 days)
**Priority: High**
- [ ] Implement session tracking
- [ ] Update handlers for registration
- [ ] Add session context middleware to routes
- **Result:** Events routed to correct sessions

### Phase 2.4: Testing (2-2.5 days)
**Priority: Critical**
- [ ] 50+ unit/integration/e2e tests
- [ ] Broadcaster tests (14 event types)
- [ ] Handler tests (connection, disconnect, rooms)
- [ ] Command→event integration tests
- [ ] Full E2E REST→Event→Client flows
- **Result:** Comprehensive test coverage

### Phase 2.5: Documentation (0.5 days)
**Priority: High**
- [ ] Module documentation
- [ ] Developer guide with examples
- [ ] JavaScript client example code
- [ ] Event catalog reference
- **Result:** Ready for frontend integration

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    WebSocket Clients                         │
│              (JavaScript, React, etc.)                       │
└────────┬───────────────────────────────────────────┬─────────┘
         │ socket.io-client                          │
         │ ws://localhost:5000/socket.io             │
         │                                            │
┌────────▼────────────────────────────────────────────▼────────┐
│ /graph namespace                                             │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ session_ABC123 (Room)                                    │ │
│ │  ├─ Client 1 (socket.id = xxx)                           │ │
│ │  ├─ Client 2 (socket.id = yyy)                           │ │
│ │  └─ Client 3 (socket.id = zzz)                           │ │
│ │                                                           │ │
│ │ Events emitted to all clients in room:                   │ │
│ │  • graph:node-created                                    │ │
│ │  • graph:property-changed                                │ │
│ │  • command:executed                                      │ │
│ │  • ... (14 types total)                                  │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ Socket.IO Server                                             │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ WebSocketBroadcaster                                     │ │
│ │  • emit_node_created()                                   │ │
│ │  • emit_property_changed()                               │ │
│ │  • emit_command_executed()                               │ │
│ │  • ... (14 methods total)                                │ │
│ └──────────────────────────────────────────────────────────┘ │
└────────┬───────────────────────────────────────────┬─────────┘
         │                                            │
┌────────▼────────────────────────────────────────────▼────────┐
│                    Flask REST API                            │
│                                                              │
│  Handlers emit events after modifying graph:                │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ POST /api/v1/commands/execute                          │ │
│  │  1. Set session context (thread-local)                │ │
│  │  2. Create command                                     │ │
│  │  3. Execute command                                    │ │
│  │  4. Command emits graph:node-created event ──→ WS     │ │
│  │  5. Return response to client                          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Business logic (unchanged):                                │
│  ├─ Dispatcher (emits command events)                       │ │
│  ├─ Commands (emit node/property events)                    │ │
│  ├─ GraphService (property change subscribers)             │ │
│  └─ Routes (set session context)                           │ │
└────────────────────────────────────────────────────────────┘
```

---

## Event Flow Example

### Scenario: Create a Node

**Step 1: Client makes REST request**
```
POST /api/v1/commands/execute
Content-Type: application/json
X-Session-ID: session-abc123

{
  "command": "create_node",
  "blueprint_type_id": "restomod",
  "name": "Engine Block"
}
```

**Step 2: Flask route sets session context**
```python
@api_bp.before_request
def set_session_context():
    set_current_session(request.headers.get('X-Session-ID'))
```

**Step 3: Dispatcher executes command**
```python
dispatcher.execute(CreateNodeCommand(...))
```

**Step 4: Command creates node and emits event**
```python
# Inside CreateNodeCommand.execute()
self.graph.add_node(self.node)

if self.event_emitter:
    session_id = get_current_session()  # Gets 'session-abc123'
    self.event_emitter.emit_node_created(
        session_id,
        self.node.id,
        'Engine Block',
        'restomod'
    )
```

**Step 5: Broadcaster emits to all clients in session**
```python
# In WebSocketBroadcaster
socketio.emit(
    'graph:node-created',
    {
        'node_id': '...',
        'name': 'Engine Block',
        'blueprint_type_id': 'restomod',
        'timestamp': '2026-01-28T...'
    },
    room='session_session-abc123'  # Only clients in this room
)
```

**Step 6: All WebSocket clients in session receive event**
```javascript
socket.on('graph:node-created', (data) => {
    console.log('Node created:', data);
    // Update UI
});
```

**Step 7: REST response sent back**
```json
{
  "success": true,
  "result": "uuid-of-created-node"
}
```

---

## Testing Strategy

### Layer 1: Unit Tests (~5 hours)
- **Broadcaster**: Each event type emits correct payload
- **Handlers**: Connection/disconnect manage rooms
- **Context**: Thread-local storage is safe
- **SessionManager**: Tracks clients correctly

### Layer 2: Integration Tests (~7 hours)
- **Commands**: CreateNodeCommand → graph:node-created
- **Properties**: UpdatePropertyCommand → graph:property-changed
- **Undo/Redo**: Emit correct sequence
- **Multiple clients**: All receive same event

### Layer 3: E2E Tests (~5 hours)
- REST POST → Event → Client receives
- Session isolation (client A doesn't receive client B's events)
- Connection/disconnect sequences
- Error scenarios

### Total Test Coverage: 50+ tests, >80% coverage

---

## Success Metrics

| Metric | Target | Status |
|--------|--------|--------|
| Event types implemented | 14/14 | 📋 Ready |
| Core modules created | 5/5 | 📋 Ready |
| Integration points updated | 5/5 | 📋 Ready |
| Tests written | 50+ | 📋 Ready |
| Test coverage | >80% | 📋 Ready |
| E2E test passing | ✅ | 📋 Ready |
| Performance overhead | <5% | 📋 Ready |
| Documentation complete | ✅ | 📋 Ready |
| Backward compatibility | ✅ | 📋 Ready |

---

## Dependencies

**Already Installed:**
- ✅ `python-socketio==5.10.0`
- ✅ `Flask==3.0.0`

**Auto-installed (no action needed):**
- ✅ `python-engineio==4.8.0` (dependency of python-socketio)

**Optional for advanced features:**
- 🔄 `python-socketio[client]` (for testing with real client)

**No breaking changes to existing dependencies.**

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| WebSocket breaks REST API | High | Separate modules, optional dependency, backward compatible tests |
| Session context gets mixed | High | Thread-local storage, validation, error logging |
| Performance regression | Medium | Async emissions, benchmarking tests, optional feature |
| Testing complexity | Medium | Layer approach (unit→integration→e2e), fixtures, mocks |
| Scalability concerns | Low | Session-based rooms, no global state, tested with many sessions |

**Overall Risk Level: LOW**
- Changes well-isolated
- Extensive testing
- Graceful degradation
- Backward compatible

---

## Next Steps

1. **Review this plan** with team
   - Confirm event types are sufficient
   - Discuss any additional requirements
   - Approve timeline

2. **Prepare environment**
   - Ensure python-socketio installed
   - Create tests/websocket/ directory
   - Create backend/websocket/ directory

3. **Begin Phase 2.1**
   - Start with broadcaster module
   - Implement handlers
   - Initialize Socket.IO in app.py

4. **Daily tracking**
   - Update checklist as items complete
   - Run tests after each component
   - Document any deviations

5. **Review gates**
   - Phase 2.1: Tests green for broadcaster & handlers
   - Phase 2.2: All commands emitting correctly
   - Phase 2.3: Session isolation working
   - Phase 2.4: All tests passing
   - Phase 2.5: Documentation complete

---

## References

**Documentation Files:**
- [PHASE_2_WEBSOCKET_PLAN.md](PHASE_2_WEBSOCKET_PLAN.md) - Detailed implementation plan
- [PHASE_2_CHECKLIST.md](PHASE_2_CHECKLIST.md) - Prioritized task checklist
- [PHASE_2_CODE_EXAMPLES.md](PHASE_2_CODE_EXAMPLES.md) - Actual code patterns

**Related Documentation:**
- [PHASE_1_COMPLETE.md](PHASE_1_COMPLETE.md) - What was built in Phase 1
- [API_CONTRACT.md](API_CONTRACT.md) - REST API specification
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) - Overall architecture

**External References:**
- [Socket.IO Documentation](https://python-socketio.readthedocs.io/)
- [Flask-SocketIO Tutorial](https://blog.miguelgrinberg.com/post/flask-socketio)

---

## Questions?

**For implementation questions**, see [PHASE_2_CODE_EXAMPLES.md](PHASE_2_CODE_EXAMPLES.md)

**For task breakdown**, see [PHASE_2_CHECKLIST.md](PHASE_2_CHECKLIST.md)

**For architecture details**, see [PHASE_2_WEBSOCKET_PLAN.md](PHASE_2_WEBSOCKET_PLAN.md)

