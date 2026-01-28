# Phase 2 Implementation Plan: WebSocket Real-Time Events

**Status:** Planning  
**Date:** January 28, 2026  
**Scope:** Add real-time WebSocket events for graph changes and command execution

---

## Executive Summary

This phase adds **Socket.IO-based WebSocket support** to enable real-time client notifications for graph changes. Instead of clients polling the REST API, they'll receive live events when:
- Nodes are created, deleted, or modified
- Properties change
- Commands execute
- Undo/redo operations occur
- Project state changes

**Key Design Principles:**
- Session-based event broadcasting (events only go to clients in the same session)
- Non-blocking integration with existing Flask app
- Minimal changes to existing business logic
- Leverages existing `LogManager` and `GraphService` infrastructure

---

## 1. WebSocket Namespace & Event Architecture

### 1.1 Socket.IO Namespace Structure

**Primary Namespace: `/graph`**
- Purpose: All graph-related changes (nodes, structure, properties)
- Session Management: Clients join room `session_{session_id}` upon connection
- Rooms per Session: Isolates events to only clients in the same session

```
Socket.IO Root Namespace (/):
├── /graph
│   ├── Rooms: session_{session_id}
│   └── Events: (see 1.2 below)
```

### 1.2 Event Types & Payloads

#### **Graph Structure Events**

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `graph:node-created` | Server→Client | `{project_id, node_id, name, blueprint_type_id, parent_id, timestamp}` | New node added to graph |
| `graph:node-deleted` | Server→Client | `{project_id, node_id, timestamp}` | Node removed from graph |
| `graph:node-linked` | Server→Client | `{project_id, parent_id, child_id, timestamp}` | Child linked to parent |
| `graph:node-unlinked` | Server→Client | `{project_id, parent_id, child_id, timestamp}` | Child unlinked from parent |

#### **Property Events**

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `graph:property-changed` | Server→Client | `{project_id, node_id, property_id, old_value, new_value, timestamp}` | Node property updated |
| `graph:property-deleted` | Server→Client | `{project_id, node_id, property_id, timestamp}` | Property removed |

#### **Command Execution Events**

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `command:executing` | Server→Client | `{project_id, command_id, command_type, timestamp}` | Command started |
| `command:executed` | Server→Client | `{project_id, command_id, command_type, result, timestamp}` | Command completed |
| `command:failed` | Server→Client | `{project_id, command_id, command_type, error, timestamp}` | Command failed |
| `command:undo` | Server→Client | `{project_id, command_id, timestamp}` | Undo performed |
| `command:redo` | Server→Client | `{project_id, command_id, timestamp}` | Redo performed |

#### **Session Events**

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `session:connected` | Server→Client | `{session_id, client_count, timestamp}` | Client connected to session |
| `session:disconnected` | Server→Client | `{session_id, client_count, timestamp}` | Client disconnected from session |
| `session:project-changed` | Server→Client | `{session_id, project_id, timestamp}` | Active project changed |

#### **Project Events**

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `project:saved` | Server→Client | `{project_id, timestamp}` | Project saved to disk |
| `project:loaded` | Server→Client | `{project_id, graph, timestamp}` | New project loaded |

### 1.3 Connection Flow

```python
# Client-side (pseudo-code)
socket = io.connect('http://localhost:5000', {
    'path': '/socket.io',
    'query': {'session_id': 'abc-123-def'}
})

socket.on('connect', () => {
    console.log('Connected to /graph namespace')
})

socket.on('graph:node-created', (data) => {
    // Update local state
})
```

---

## 2. Flask + Socket.IO Integration

### 2.1 Architecture Overview

**New Module:** `backend/websocket/`
```
backend/websocket/
├── __init__.py
├── handlers.py          # Event handlers for Socket.IO
├── broadcaster.py       # Event broadcasting logic
└── session_manager.py   # WebSocket session tracking
```

### 2.2 Integration Points

**Location:** `backend/app.py` - Create app initialization
```python
from flask import Flask
from flask_socketio import SocketIO

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Register WebSocket handlers
from backend.websocket.handlers import setup_websocket_handlers
setup_websocket_handlers(socketio)

# Run with: socketio.run(app, port=5000)
```

**Key Design:**
- SocketIO wrapper initialized in `create_app()` 
- Global `socketio` instance accessible to broadcasters
- Handlers registered via blueprint-style setup function
- All existing Flask code unchanged

### 2.3 New Module: `backend/websocket/broadcaster.py`

Provides helper functions to emit events:

```python
class WebSocketBroadcaster:
    """Broadcasts graph change events to connected clients."""
    
    def __init__(self, socketio):
        self.socketio = socketio
    
    def emit_node_created(self, session_id: str, node_id: UUID, 
                         name: str, blueprint_type_id: str, 
                         parent_id: UUID = None) -> None:
        """Broadcast node creation to session."""
        self.socketio.emit(
            'graph:node-created',
            {
                'node_id': str(node_id),
                'name': name,
                'blueprint_type_id': blueprint_type_id,
                'parent_id': str(parent_id) if parent_id else None,
                'timestamp': datetime.utcnow().isoformat()
            },
            room=f'session_{session_id}'
        )
    
    # Similar methods for other events...
```

**Global Instance:**
```python
# In backend/websocket/__init__.py
_broadcaster = None

def get_broadcaster():
    """Get the global broadcaster instance."""
    return _broadcaster

def set_broadcaster(socketio):
    """Initialize the broadcaster (called from app.py)."""
    global _broadcaster
    _broadcaster = WebSocketBroadcaster(socketio)
```

---

## 3. Event Emission from Business Logic

### 3.1 Integration Points

**1. Command Dispatcher** (`backend/handlers/dispatcher.py`)
```python
def execute(self, command: Command) -> Any:
    # Existing code...
    result = command.execute()
    
    # NEW: Emit command:executed event
    self._emit_command_executed_event(command, result)
    
    return result
```

**2. Graph Service** (`backend/api/graph_service.py`)
```python
def notify_property_changed(self, node_id: UUID, property_id: str, new_value: Any):
    # Existing subscriber logic...
    
    # NEW: Emit graph:property-changed event to WebSocket
    self._emit_property_changed_event(node_id, property_id, new_value)
```

**3. Node Commands** (`backend/handlers/commands/node_commands.py`)
- `CreateNodeCommand.execute()` → emit `graph:node-created`
- `DeleteNodeCommand.execute()` → emit `graph:node-deleted`
- `LinkNodeCommand.execute()` → emit `graph:node-linked`
- `UpdatePropertyCommand.execute()` → already calls GraphService

**4. Project Manager** (`backend/api/project_manager.py`)
- On project load → emit `project:loaded`
- On project save → emit `project:saved`

### 3.2 Avoiding Circular Dependencies

**Solution:** Use dependency injection pattern
- Commands don't directly depend on WebSocket
- Broadcaster is passed as optional parameter
- If no broadcaster, events are silently skipped
- Maintains backward compatibility

**Pattern:**
```python
class CreateNodeCommand(Command):
    def __init__(self, blueprint_type_id: str, name: str, 
                 graph=None, blueprint=None, 
                 event_emitter=None):  # NEW
        self.event_emitter = event_emitter
    
    def execute(self) -> UUID:
        # Create node...
        if self.event_emitter:
            self.event_emitter.emit_node_created(...)
        return self.node.id
```

### 3.3 Session Context Management

**Challenge:** Business logic doesn't know the session_id

**Solution:** Thread-local session context
```python
# In backend/websocket/context.py
_session_context = threading.local()

def set_current_session(session_id: str):
    _session_context.session_id = session_id

def get_current_session() -> str:
    return getattr(_session_context, 'session_id', None)

# In API routes:
@api_bp.route('/commands/execute', methods=['POST'])
def execute_command():
    session_id = request.headers.get('X-Session-ID')
    set_current_session(session_id)  # Set context
    
    # Execute command (business logic emits to current session)
    dispatcher.execute(command)
```

---

## 4. Broadcasting to Clients

### 4.1 Session-Based Routing

**Key Constraint:** Events only broadcast to clients in the same session

**Implementation:**
```python
# In handler (backend/websocket/handlers.py)
@socketio.on('connect', namespace='/graph')
def handle_connect(auth):
    session_id = auth.get('session_id') if auth else None
    
    if not session_id:
        disconnect()
        return False
    
    # Join room named after session
    join_room(f'session_{session_id}')
    
    # Track this client
    _register_client(session_id, request.sid)
    
    emit('session:connected', {
        'session_id': session_id,
        'client_count': get_session_client_count(session_id),
        'timestamp': datetime.utcnow().isoformat()
    })
```

### 4.2 Broadcaster Methods

```python
class WebSocketBroadcaster:
    
    def emit_to_session(self, session_id: str, event: str, 
                        payload: dict) -> None:
        """Emit to all clients in a session."""
        self.socketio.emit(
            event,
            payload,
            room=f'session_{session_id}',
            namespace='/graph'
        )
    
    def get_session_client_count(self, session_id: str) -> int:
        """Get number of connected clients in session."""
        # Uses socketio.server.rooms to count
        pass
```

### 4.3 Error Handling

```python
# Broadcaster gracefully handles missing sessions
def emit_to_session(self, session_id: str, event: str, payload: dict):
    if not self.socketio:
        return  # WebSocket not initialized
    
    try:
        self.socketio.emit(event, payload, 
                          room=f'session_{session_id}',
                          namespace='/graph')
    except Exception as e:
        logger.error(f"Failed to emit {event}: {e}")
```

---

## 5. Test Strategy

### 5.1 Unit Tests

**File:** `tests/websocket/test_broadcaster.py`
```python
def test_emit_node_created():
    """Test event payload structure."""
    broadcaster = WebSocketBroadcaster(MockSocketIO())
    broadcaster.emit_node_created(
        'session-123', 
        UUID('...'), 
        'New Node', 
        'restomod'
    )
    # Assert socketio.emit called with correct args

def test_emit_respects_session_boundaries():
    """Test events don't leak between sessions."""
    # Verify room is session_{session_id}

def test_silent_failure_no_socketio():
    """Test broadcaster works without WebSocket initialized."""
    broadcaster = WebSocketBroadcaster(None)
    broadcaster.emit_node_created(...)  # Should not crash
```

### 5.2 Integration Tests

**File:** `tests/websocket/test_socket_integration.py`
```python
def test_command_emission_on_execute():
    """Test command execution emits WebSocket events."""
    socketio_mock = Mock()
    dispatcher = CommandDispatcher(graph, socketio_mock)
    
    command = CreateNodeCommand('blueprint', 'Node 1')
    dispatcher.execute(command)
    
    # Assert socketio.emit called with graph:node-created

def test_property_change_emission():
    """Test property updates emit events."""
    # Similar to above

def test_session_isolation():
    """Test events don't broadcast to other sessions."""
    # Connect two clients to different sessions
    # Emit event to session 1
    # Verify only session 1 client receives it
```

### 5.3 End-to-End Tests

**File:** `tests/websocket/test_websocket_e2e.py`
```python
def test_client_receives_node_created_event():
    """Full integration: REST API → Event → WebSocket client."""
    client = socketio_test_client(app, namespace='/graph')
    
    # POST to create node via REST
    requests.post('http://localhost:5000/api/v1/commands/execute',
                 data={'command': 'create_node', ...})
    
    # Assert client received graph:node-created
    events = client.get_received(namespace='/graph')
    assert events[0]['args'][0] == 'graph:node-created'

def test_undo_redo_events():
    """Test command stack events."""
    # Execute, then undo, then redo
    # Verify events in correct order
```

### 5.4 Client-Simulation Tests

Use `python-socketio` test client:
```python
from socketio import SimpleClient

def test_with_real_socketio_client():
    """Test with real Socket.IO client (not mock)."""
    client = SimpleClient()
    
    # Connect with session auth
    client.connect('http://localhost:5000',
                  auth={'session_id': 'test-session'})
    
    # Listen for events
    received_events = []
    client.on('graph:node-created', lambda data: received_events.append(data))
    
    # Trigger event via REST API
    # ...
    
    # Assert event received
    assert len(received_events) > 0
```

### 5.5 Performance Tests

**File:** `tests/websocket/test_performance.py`
```python
def test_broadcast_throughput():
    """Test event broadcasting doesn't bottleneck."""
    # Create 100 clients in same session
    # Emit 1000 events
    # Measure latency (should be <100ms)

def test_memory_with_many_sessions():
    """Test broadcaster memory usage with many sessions."""
    # Create 1000 sessions
    # Verify memory usage is reasonable
```

---

## 6. Dependencies & Compatibility

### 6.1 Required Packages

**Already Installed:**
- `python-socketio==5.10.0` ✅
- `Flask==3.0.0` ✅

**Additional Required:**
- `python-engineio==4.8.0` (dependency of socket-io, usually auto-installed)
- `python-socketio[client]==5.10.0` (for testing, optional)

### 6.2 Optional for Production

```
# requirements.txt additions (optional)
python-socketio[asyncio_client]==5.10.0  # For async client support
```

### 6.3 Python Version Requirements

- Minimum: **Python 3.8**
- Tested on: **Python 3.9, 3.10, 3.11**
- Works with: **PySide6, Flask, pytest**

### 6.4 Browser Compatibility

Client-side Socket.IO library (for frontend):
```html
<script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
<!-- or: npm install socket.io-client -->
```

Supports all modern browsers + WebSocket fallback via polling.

---

## 7. Implementation Checklist

### Phase 2.1: Foundation (Simple - 2 days)

- [ ] **2.1.1** Create `backend/websocket/__init__.py` with broadcaster registry
  - Complexity: **Simple**
  - Time: 1 hour
  - Files: New module structure

- [ ] **2.1.2** Implement `backend/websocket/broadcaster.py`
  - Complexity: **Simple**
  - Time: 2 hours
  - Includes: Event emission methods for all event types
  - Tests: Unit tests for broadcaster

- [ ] **2.1.3** Integrate Socket.IO into `backend/app.py`
  - Complexity: **Simple**
  - Time: 1 hour
  - Changes: Initialize SocketIO in `create_app()`
  - Backward compatible: Existing Flask routes unchanged

- [ ] **2.1.4** Create `backend/websocket/handlers.py` with connection/disconnect
  - Complexity: **Simple**
  - Time: 2 hours
  - Includes: Room management, session routing
  - Tests: Connection handler tests

**Subtotal Phase 2.1: ~6 hours**

### Phase 2.2: Command Emission (Medium - 1-2 days)

- [ ] **2.2.1** Create `backend/websocket/context.py` for session context
  - Complexity: **Simple**
  - Time: 1 hour
  - Pattern: Thread-local session management

- [ ] **2.2.2** Modify `backend/handlers/dispatcher.py` to emit events
  - Complexity: **Medium**
  - Time: 2 hours
  - Changes: Add event emission in `execute()`, `undo()`, `redo()`
  - Dependency injection: Optional event_emitter parameter
  - Backward compatible: Works without WebSocket

- [ ] **2.2.3** Modify command classes to emit events
  - Complexity: **Medium**
  - Time: 3 hours
  - Files: `backend/handlers/commands/node_commands.py`, `macro_commands.py`
  - Each command emits specific graph:* events
  - Integration tests: Command execution → WebSocket events

- [ ] **2.2.4** Modify `backend/api/graph_service.py` property emissions
  - Complexity: **Simple**
  - Time: 1 hour
  - Change: Add property-changed event in `notify_property_changed()`
  - Tests: Property change integration tests

**Subtotal Phase 2.2: ~7 hours**

### Phase 2.3: Session Management (Medium - 1 day)

- [ ] **2.3.1** Create `backend/websocket/session_manager.py`
  - Complexity: **Simple**
  - Time: 1.5 hours
  - Tracks: Client → Session mappings, client counts
  - Methods: Register, unregister, list_clients, client_count

- [ ] **2.3.2** Hook session manager into connection/disconnect handlers
  - Complexity: **Simple**
  - Time: 1 hour
  - Updates: `handlers.py` to use SessionManager

- [ ] **2.3.3** Implement session context middleware in routes
  - Complexity: **Simple**
  - Time: 1.5 hours
  - File: Update routes to set session context on each request
  - Ensures: Commands emit to correct session

**Subtotal Phase 2.3: ~4 hours**

### Phase 2.4: Testing (Medium - 2 days)

- [ ] **2.4.1** Create `tests/websocket/` directory structure
  - Complexity: **Simple**
  - Time: 0.5 hour
  - Files: `__init__.py`, `conftest.py` (WebSocket fixtures)

- [ ] **2.4.2** Write broadcaster unit tests
  - Complexity: **Simple**
  - Time: 2 hours
  - File: `tests/websocket/test_broadcaster.py`
  - Coverage: All event types, edge cases

- [ ] **2.4.3** Write Socket.IO integration tests
  - Complexity: **Medium**
  - Time: 3 hours
  - File: `tests/websocket/test_handlers.py`
  - Tests: Connection, disconnect, room isolation

- [ ] **2.4.4** Write command-to-event integration tests
  - Complexity: **Medium**
  - Time: 3 hours
  - File: `tests/websocket/test_command_events.py`
  - Tests: Each command type emits correct events

- [ ] **2.4.5** Write end-to-end tests
  - Complexity: **Complex**
  - Time: 4 hours
  - File: `tests/websocket/test_e2e.py`
  - Tests: Full REST → Event → Client flows

- [ ] **2.4.6** Write performance/stress tests (optional)
  - Complexity: **Complex**
  - Time: 3 hours
  - File: `tests/websocket/test_performance.py`
  - Tests: Many sessions, high event throughput

**Subtotal Phase 2.4: ~15.5 hours (with optional: ~18.5 hours)**

### Phase 2.5: Documentation & Polish (Simple - 1 day)

- [ ] **2.5.1** Update `backend/websocket/__init__.py` documentation
  - Complexity: **Simple**
  - Time: 1 hour
  - Content: Module overview, usage examples

- [ ] **2.5.2** Create `docs/WEBSOCKET_GUIDE.md` for developers
  - Complexity: **Simple**
  - Time: 1 hour
  - Content: Event catalog, client example, debugging

- [ ] **2.5.3** Create `docs/WEBSOCKET_CLIENT_EXAMPLE.md`
  - Complexity: **Simple**
  - Time: 1 hour
  - Content: JavaScript client code examples

- [ ] **2.5.4** Update `PHASE_2_COMPLETE.md` with results
  - Complexity: **Simple**
  - Time: 1 hour
  - Content: What was built, test results, metrics

**Subtotal Phase 2.5: ~4 hours**

### Phase 2.6: Optional Enhancements (for later phases)

- [ ] **2.6.1** Add reconnection handling & message queuing
  - Complexity: **Complex**
  - Time: 4 hours
  - Benefit: Better UX for slow/unstable connections

- [ ] **2.6.2** Add event filtering/subscriptions
  - Complexity: **Medium**
  - Time: 2 hours
  - Benefit: Clients receive only events they care about

- [ ] **2.6.3** Add server-to-client request/reply pattern
  - Complexity: **Medium**
  - Time: 3 hours
  - Benefit: Two-way communication for future features

- [ ] **2.6.4** Add distributed session support (Redis)
  - Complexity: **Complex**
  - Time: 4 hours
  - Benefit: Multi-server deployments

---

## Implementation Summary

| Phase | Component | Complexity | Est. Hours | Status |
|-------|-----------|------------|-----------|--------|
| 2.1 | Foundation (broadcaster, app, handlers) | Simple | 6 | 📋 Ready to start |
| 2.2 | Command & property emissions | Medium | 7 | 🔄 Depends on 2.1 |
| 2.3 | Session management | Simple | 4 | 🔄 Depends on 2.1, 2.2 |
| 2.4 | Testing (unit, integration, e2e) | Medium-Complex | 15-19 | 🔄 Can start after 2.3 |
| 2.5 | Documentation & polish | Simple | 4 | 🔄 Final step |
| **Total** | **Phase 2 Complete** | **Medium** | **36-41 hours** | 📋 Ready |

**Recommended Schedule:**
- **Day 1-2:** Phase 2.1 (Foundation)
- **Day 2-3:** Phase 2.2 (Emissions)
- **Day 3:** Phase 2.3 (Sessions)
- **Day 4-5:** Phase 2.4 (Testing)
- **Day 5:** Phase 2.5 (Documentation)

---

## Risk Mitigation

### 1. Backward Compatibility

**Risk:** WebSocket changes break existing REST API

**Mitigation:**
- All WebSocket code in separate module
- Optional dependency injection for event emitters
- Existing routes work unchanged if WebSocket not initialized
- Tests ensure REST API still works with/without WebSocket

### 2. Session Context Management

**Risk:** Events emitted to wrong session or crash if session unknown

**Mitigation:**
- Thread-local context (not shared across threads)
- Graceful failure: Events silently dropped if no session
- Validation: Verify session_id before routing
- Logging: All emissions logged for debugging

### 3. Performance Impact

**Risk:** Event emission slows down command execution

**Mitigation:**
- Broadcaster uses async emit (non-blocking)
- Optional feature: Can disable for high-throughput scenarios
- Tests: Benchmark command execution ±WebSocket
- Design: Events emitted after command completes

### 4. Testing Complexity

**Risk:** WebSocket testing is hard, tests become flaky

**Mitigation:**
- Layer testing: Unit → Integration → E2E
- Mock Socket.IO for unit tests
- Real Socket.IO client for e2e tests
- Conftest fixtures: Reusable test setup

---

## Success Criteria

**Phase 2 is complete when:**

1. ✅ All 5 namespaces implemented and tested
2. ✅ All event types emit correctly from business logic
3. ✅ Session isolation working (no event leaks)
4. ✅ 50+ tests passing (broadcaster, handlers, integration)
5. ✅ E2E test demonstrates: REST API → Event → Client receives
6. ✅ Documentation complete with client examples
7. ✅ Existing tests still pass (backward compatible)
8. ✅ No performance regression in command execution

**Metrics to Measure:**
- Command execution time: Baseline vs. with WebSocket (<5% overhead)
- Event latency: Event emitted to client received (<100ms typical)
- Memory per session: <1MB per session with 10+ clients
- Test coverage: >80% WebSocket code coverage

---

## Next Steps

1. **Review this plan** with team/stakeholders
2. **Approve scope** - confirm all event types needed
3. **Begin Phase 2.1** - Foundation implementation
4. **Daily standup:** Track progress against timeline
5. **Phase reviews:** Test completion before moving to next phase

