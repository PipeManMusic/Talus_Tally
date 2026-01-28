# Phase 2.4: End-to-End Integration Testing Plan

**Target:** Comprehensive WebSocket client integration testing with real multi-client scenarios  
**Baseline:** 77 tests (Phase 1: 53, Phase 2.1: 14, Phase 2.2: 10)  
**Projected New Tests:** 18-24 tests (90-101 total)  
**Duration:** 2-3 sprints  

---

## Executive Summary

Phase 2.4 closes the gap between isolated unit tests and production behavior by testing the complete request lifecycle: REST API calls → Command execution → Event broadcasting → WebSocket delivery to multiple clients. This phase validates multi-client scenarios, session lifecycle, error handling, and backwards compatibility.

---

## 1. High-Level E2E Test Categories

### Category A: Multi-Client Event Synchronization (5 tests)
**Goal:** Verify that events are broadcast correctly across multiple connected clients.

- **A1: Two clients receive same event** - Create node on one client, verify both receive broadcast
- **A2: Selective room routing** - Clients in different sessions don't receive cross-session events  
- **A3: Event ordering preservation** - Multiple commands maintain order across clients
- **A4: Client receives its own events** - Creator receives confirmation of own action
- **A5: Broadcast during client join** - New client joining doesn't miss recent events

---

### Category B: Session Lifecycle Management (4 tests)
**Goal:** Test complete session journey: creation → activity tracking → cleanup.

- **B1: Session creation with WebSocket join** - Create session via REST, join via WebSocket
- **B2: Activity tracking with multiple clients** - Activity timestamp updates with client actions
- **B3: Client count accuracy** - active_clients metadata tracks joins/disconnects correctly
- **B4: Inactive session cleanup** - Sessions with no active clients and old timestamps are removed

---

### Category C: REST API → WebSocket Integration (4 tests)
**Goal:** Verify that REST API calls trigger proper WebSocket broadcasts.

- **C1: Graph operation REST call broadcasts** - POST /api/v1/nodes broadcasts to all clients in session
- **C2: Command execution broadcasts events** - REST dispatcher.execute() emits correct events
- **C3: Template operations broadcast** - Template loading/switching broadcasts to session
- **C4: Project operations broadcast** - create_project/load_project trigger broadcasts

---

### Category D: Error Handling & Edge Cases (4 tests)
**Goal:** Test resilience and graceful degradation.

- **D1: Invalid session join handling** - Invalid session_id in join_session doesn't crash
- **D2: Client disconnect during broadcast** - Disconnecting mid-operation is handled gracefully
- **D3: Malformed WebSocket messages** - Invalid emit data doesn't crash server
- **D4: Network interruption recovery** - Client reconnection properly re-joins session room

---

### Category E: Backwards Compatibility (2 tests)
**Goal:** Verify REST-only clients work without WebSocket.

- **E1: REST-only CRUD operations** - All operations work without WebSocket connection
- **E2: Hybrid client scenarios** - Mix of WebSocket and REST-only clients in same session

---

### Category F: Cross-Layer Integration Flows (3 tests)
**Goal:** Test realistic end-to-end workflows.

- **F1: Multi-step workflow with multiple clients** - Complex operations (create → link → update) with 3+ clients
- **F2: Undo/Redo with broadcast** - Undo/Redo commands broadcast correct state changes
- **F3: Concurrent operations** - Two clients modify graph simultaneously, verify consistency

---

## 2. Detailed Test Scenarios

### Category A: Multi-Client Event Synchronization

#### A1: Two Clients Receive Same Event
```
Scenario: Create node, verify both clients get broadcast
Setup:
  - Create session
  - Connect 2 clients to same session room
Execute:
  - Client 1 calls POST /api/v1/nodes
  - CreateNodeCommand executes
  - emit_node_created() broadcasts to session room
Verify:
  - Client 1 receives 'node-created' event
  - Client 2 receives identical 'node-created' event
  - Event timestamp identical on both
  - Event data matches: session_id, node_id, parent_id, name, type
```

#### A2: Selective Room Routing
```
Scenario: Two sessions, events don't cross
Setup:
  - Create 2 sessions
  - Connect client A1 → session A
  - Connect client B1 → session B
Execute:
  - Client A1 creates node
Execute:
Verify:
  - Client A1 receives event
  - Client B1 does NOT receive event
  - Verify Socket.IO room isolation
```

#### A3: Event Ordering Preservation
```
Scenario: 5 sequential commands, verify order across clients
Setup:
  - Create session
  - Connect 2 clients
Execute:
  - Client 1 issues: CreateNode, UpdateProperty, LinkNode, CreateNode, DeleteNode
  - Each broadcasts to both clients
Verify:
  - Both clients receive events in identical order
  - Event timestamps are monotonically increasing
  - Use event.sequence_number (if available) or timestamp comparison
```

#### A4: Client Receives Its Own Events
```
Scenario: Verify originating client gets confirmation
Setup:
  - Create session
  - Connect 1 client
Execute:
  - Client executes CreateNodeCommand via REST
  - Event broadcasts to session (including originating client)
Verify:
  - Client receives broadcast event
  - Event contains originating_client_id (optional)
  - Can be used for UI update confirmation
```

#### A5: Broadcast During Client Join
```
Scenario: Late-joining client handles in-flight events
Setup:
  - Create session
  - Connect client 1, execute 3 commands, emit events
  - Client 1 still observing events
Execute:
  - Connect client 2 to same session
  - Client 2 joins room (on_join_session)
  - Client 1 continues sending commands
Verify:
  - Client 2 successfully joins without errors
  - Client 2 receives all events after join
  - Note: Doesn't receive pre-join events (acceptable for this phase)
```

---

### Category B: Session Lifecycle Management

#### B1: Session Creation with WebSocket Join
```
Scenario: Full lifecycle from REST creation to WebSocket join
Execute:
  - POST /api/v1/sessions → returns session_id
  - WebSocket client calls on_join_session({"session_id": session_id})
  - join_room(session_id) executes
Verify:
  - Socket.IO room exists: session_id
  - _session_clients[session_id] contains client sid
  - socketio_handlers.get_session_client_count(session_id) == 1
  - _session_metadata[session_id]['active_clients'] == 1
```

#### B2: Activity Tracking with Multiple Clients
```
Scenario: last_activity updates with each operation
Setup:
  - Create session with 2 clients
  - Wait 2 seconds
Execute:
  - Client 1: Create node (calls _update_session_activity)
  - Check metadata last_activity
  - Wait 1 second
  - Client 2: Update property
  - Check metadata last_activity again
Verify:
  - First operation updates last_activity to time1
  - Second operation updates last_activity to time2
  - time2 > time1 (by ~1 second)
  - _session_metadata[session_id]['last_activity'] tracks all client activity
```

#### B3: Client Count Accuracy
```
Scenario: active_clients metadata stays in sync
Setup:
  - Create session
Execute:
  - Connect client 1 → active_clients = 1
  - Connect client 2 → active_clients = 2
  - Connect client 3 → active_clients = 3
  - Disconnect client 2 → active_clients = 2
  - Disconnect client 1 → active_clients = 1
  - Disconnect client 3 → active_clients = 0
Verify:
  - After each join: get_session_client_count() == expected
  - After each disconnect: get_session_client_count() == expected
  - _session_metadata[session_id]['active_clients'] == get_session_client_count()
```

#### B4: Inactive Session Cleanup
```
Scenario: Sessions with no clients and old activity are removed
Setup:
  - Create session A at T=0
  - Set _session_metadata[A]['last_activity'] to T-25hours
  - Set _session_metadata[A]['active_clients'] = 0
  - Create session B at T=1hour
  - Set _session_metadata[B]['last_activity'] to T-1hour
  - Set _session_metadata[B]['active_clients'] = 0
Execute:
  - Call _cleanup_inactive_sessions(max_inactive_hours=24)
Verify:
  - Session A is removed from _sessions
  - Session A is removed from _session_metadata
  - Session B is removed (also old)
  - Both check out
  - Active sessions still exist
```

---

### Category C: REST API → WebSocket Integration

#### C1: Graph Operation REST Call Broadcasts
```
Scenario: POST /api/v1/nodes broadcasts to all session clients
Setup:
  - Create session
  - Connect 2 clients to session
Execute:
  - Client 1: POST /api/v1/{session_id}/nodes
  - Request body: {"blueprint_type_id": "task", "name": "Test", "parent_id": null}
  - Route handler executes dispatcher.execute(CreateNodeCommand)
  - Command.execute() triggers emit_node_created()
Verify:
  - Both clients receive 'node-created' event
  - Event data: {session_id, node_id, parent_id, name, type}
  - HTTP response also returns created node
```

#### C2: Command Execution Broadcasts Events
```
Scenario: Complex command triggers correct event sequence
Setup:
  - Create session with 2 clients
  - Create 2 nodes (parent, child)
Execute:
  - Client 1: POST /api/v1/{session_id}/nodes/{node_id}/properties
  - Update 'status' property
  - Triggers UpdatePropertyCommand
  - Command.execute() emits events
Verify:
  - Clients receive event(s) for property update
  - Event contains: node_id, property_name, old_value, new_value
```

#### C3: Template Operations Broadcast
```
Scenario: Loading template broadcasts to all clients
Setup:
  - Create session with 2 clients
  - Have a project loaded
Execute:
  - Client 1: POST /api/v1/{session_id}/project/template
  - Body: {"template_id": "restomod"}
  - Routes handler calls project_manager.load_template()
  - Should broadcast template-loaded event
Verify:
  - Both clients receive 'template-loaded' event
  - Event contains template metadata
```

#### C4: Project Operations Broadcast
```
Scenario: Creating/loading project broadcasts to session
Setup:
  - Create session with 2 clients
Execute:
  - Client 1: POST /api/v1/{session_id}/projects
  - Body: {"name": "New Project", "template_id": "restomod"}
  - Project created, broadcaster emits event
Verify:
  - Both clients receive 'project-created' event
  - Event contains project metadata
```

---

### Category D: Error Handling & Edge Cases

#### D1: Invalid Session Join Handling
```
Scenario: Joining non-existent session doesn't crash
Setup:
  - Create WebSocket client
  - Don't create session via REST
Execute:
  - on_join_session({"session_id": "fake-uuid-that-doesnt-exist"})
Verify:
  - Server doesn't crash
  - Client receives error event or graceful rejection
  - Session isn't created in _session_clients
```

#### D2: Client Disconnect During Broadcast
```
Scenario: Client disconnects while broadcast is in progress
Setup:
  - Create session with 3 clients
Execute:
  - Client 1: POST /api/v1/nodes (triggers broadcast)
  - During broadcast, Client 2 disconnects
  - on_disconnect() fires for Client 2
Verify:
  - Broadcast completes for Clients 1 and 3
  - Client 2 properly removed from _session_clients
  - No orphaned references
  - No exceptions logged
```

#### D3: Malformed WebSocket Messages
```
Scenario: Invalid message data doesn't crash server
Execute:
  - Send on_join_session({}) [missing session_id]
  - Send on_join_session({"session_id": None})
  - Send on_join_session("not-a-dict")
Verify:
  - Server emits error event back to client
  - No exceptions raised
  - Client can continue using other features
```

#### D4: Network Interruption Recovery
```
Scenario: Client reconnects and re-joins session
Setup:
  - Create session
  - Client connects and joins
Execute:
  - Simulate disconnect (client.disconnect())
  - _session_clients[session_id] should remove client
  - Client reconnects with new sid
  - Client calls on_join_session again
Verify:
  - Client successfully re-joins room
  - _session_clients[session_id] now has new sid
  - Client receives subsequent broadcasts
```

---

### Category E: Backwards Compatibility

#### E1: REST-Only CRUD Operations
```
Scenario: All operations work without WebSocket
Execute:
  - Create session via REST (no WebSocket connection)
  - POST /api/v1/{session_id}/nodes [no listener]
  - POST /api/v1/{session_id}/projects [no listener]
  - GET /api/v1/{session_id}/graph
  - DELETE /api/v1/{session_id}/nodes/{node_id}
Verify:
  - All operations succeed
  - No errors due to missing WebSocket
  - Broadcasts still execute (just no listeners)
  - Session metadata tracks activity
```

#### E2: Hybrid Client Scenarios
```
Scenario: REST-only client + WebSocket client in same session
Setup:
  - Create session
  - Connect Client A via REST only (test_client)
  - Connect Client B via WebSocket (socketio_client)
Execute:
  - Client A: POST /api/v1/nodes
  - Client B should receive broadcast
  - Client B: POST /api/v1/nodes (via REST layer)
  - Client A should also receive via... (REST doesn't receive broadcasts)
Verify:
  - REST client operations work
  - WebSocket client receives broadcasts
  - Both can coexist in same session
  - Note: REST client won't receive broadcasts, which is expected
```

---

### Category F: Cross-Layer Integration Flows

#### F1: Multi-Step Workflow with Multiple Clients
```
Scenario: Realistic workflow with 3 clients collaborating
Setup:
  - Create session
  - Connect 3 WebSocket clients
Execute:
  Step 1 (Client 1): POST /api/v1/{session_id}/projects
    - Create project → broadcasts project-created
  Step 2 (Client 2): POST /api/v1/{session_id}/nodes
    - Create root node → broadcasts node-created
  Step 3 (Client 3): POST /api/v1/{session_id}/nodes/{parent}/children
    - Create child node → broadcasts node-created
  Step 4 (Client 1): POST /api/v1/{session_id}/nodes/{child}/links
    - Link to sibling → broadcasts link-created
  Step 5 (Client 2): POST /api/v1/{session_id}/nodes/{node}/properties
    - Update property → broadcasts property-updated
Verify:
  - All 3 clients receive all 5 events in order
  - Graph state is consistent across all clients
  - Session metadata updated with each operation
```

#### F2: Undo/Redo with Broadcast
```
Scenario: Undo operations broadcast state changes
Setup:
  - Create session with 2 clients
  - Create node via Client 1
Execute:
  - Client 1: POST /api/v1/{session_id}/undo
  - Dispatcher.undo() executes, emits undo event
  - Client 1: POST /api/v1/{session_id}/redo
  - Dispatcher.redo() executes, emits redo event
Verify:
  - Both clients receive undo event
  - Both clients receive redo event
  - Graph state synchronized
  - Can verify by checking node deleted/recreated
```

#### F3: Concurrent Operations
```
Scenario: Two clients modify graph simultaneously
Setup:
  - Create session with 2 clients
  - Create parent node
Execute:
  Parallel:
    - Client 1: POST /api/v1/nodes (create child under parent)
    - Client 2: POST /api/v1/nodes (create child under parent)
  Wait for both to complete
Verify:
  - Both operations succeed
  - Both clients receive both node-created events
  - Graph has 2 new nodes with correct parent
  - No race conditions
  - Event ordering is consistent on both clients
```

---

## 3. Technical Approach for Multi-Client Testing

### 3.1 Testing Framework Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Pytest + python-socketio test client                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  @pytest.fixture                                            │
│  def app():                                                 │
│      return create_app()                                    │
│                                                              │
│  @pytest.fixture                                            │
│  def rest_client(app):  # Flask test client (REST only)     │
│      return app.test_client()                               │
│                                                              │
│  @pytest.fixture                                            │
│  def socketio_client_factory(app):                          │
│      socketio = app.extensions['socketio']                  │
│      def create_client():                                   │
│          return socketio.test_client(app)                   │
│      return create_client                                   │
│                                                              │
│  Test function:                                             │
│      client1 = socketio_client_factory()                    │
│      client2 = socketio_client_factory()                    │
│      client1.emit('join_session', ...)                      │
│      client2.emit('join_session', ...)                      │
│      # Now both connected to same session room              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Multi-Client Test Pattern

```python
# Pattern for testing multiple clients
def test_multi_client_scenario(socketio_client_factory, rest_client):
    """Template for multi-client tests."""
    
    # 1. Setup: Create session via REST
    response = rest_client.post('/api/v1/sessions')
    session_id = response.json['session_id']
    
    # 2. Create multiple WebSocket clients
    client1 = socketio_client_factory()
    client2 = socketio_client_factory()
    client3 = socketio_client_factory()
    
    # 3. Connect all to same session room
    client1.emit('join_session', {'session_id': session_id})
    client2.emit('join_session', {'session_id': session_id})
    client3.emit('join_session', {'session_id': session_id})
    
    # 4. Register event listeners
    events1, events2, events3 = [], [], []
    client1.on('node-created', lambda data: events1.append(data))
    client2.on('node-created', lambda data: events2.append(data))
    client3.on('node-created', lambda data: events3.append(data))
    
    # 5. Execute action from one client
    rest_client.post(f'/api/v1/{session_id}/nodes', 
                     json={'blueprint_type_id': 'task', 'name': 'Test'})
    
    # 6. Verify all clients received event
    assert len(events1) == 1
    assert len(events2) == 1
    assert len(events3) == 1
    assert events1[0] == events2[0] == events3[0]
```

### 3.3 Event Capture Strategy

```python
# Helper to capture events with timeout
class EventCapture:
    def __init__(self, socketio_client):
        self.events = []
        self.client = socketio_client
    
    def listen(self, event_name):
        """Register listener for event_name."""
        self.client.on(event_name, lambda data: self.events.append(data))
    
    def wait_for(self, event_name, count=1, timeout=2.0):
        """Wait for N events, raise if timeout."""
        import time
        start = time.time()
        while True:
            matching = [e for e in self.events if e.get('type') == event_name]
            if len(matching) >= count:
                return matching[:count]
            if time.time() - start > timeout:
                raise TimeoutError(f"Expected {count} {event_name} events, got {len(matching)}")
            time.sleep(0.01)
    
    def clear(self):
        """Clear captured events."""
        self.events = []

# Usage:
capture1 = EventCapture(client1)
capture1.listen('node-created')
# ... trigger action ...
events = capture1.wait_for('node-created', count=1, timeout=2.0)
assert events[0]['node_id'] == expected_id
```

### 3.4 Session Fixture Pattern

```python
@pytest.fixture
def e2e_session(rest_client):
    """Create a session and provide utilities."""
    response = rest_client.post('/api/v1/sessions')
    session_id = response.json['session_id']
    
    yield {
        'session_id': session_id,
        'rest_client': rest_client,
    }
    
    # Cleanup: verify cleanup functions work
    # (could trigger cleanup and verify session removed)

def test_with_e2e_session(e2e_session, socketio_client_factory):
    session_id = e2e_session['session_id']
    rest_client = e2e_session['rest_client']
    
    client = socketio_client_factory()
    client.emit('join_session', {'session_id': session_id})
    # ... test code ...
```

---

## 4. Estimated Test Count

### Breakdown by Category

| Category | Tests | Details |
|----------|-------|---------|
| **A: Multi-Client Sync** | 5 | Event broadcast, ordering, room isolation |
| **B: Session Lifecycle** | 4 | Creation, activity, cleanup |
| **C: REST→WebSocket** | 4 | API integration with broadcasts |
| **D: Error Handling** | 4 | Invalid joins, disconnects, malformed data |
| **E: Backwards Compat** | 2 | REST-only, hybrid scenarios |
| **F: Cross-Layer Flows** | 3 | Complex workflows, undo/redo, concurrency |
| **Total Phase 2.4** | **22** | Core E2E tests |

### Optional Advanced Tests (Phase 2.4.5)
- Stress testing (100+ clients)
- Performance benchmarking (event latency <100ms)
- Load testing with rapid connects/disconnects
- State consistency verification (CRCs)

---

## 5. Dependencies Required

### Core Dependencies (Already in requirements.txt)
- ✅ `Flask==3.0.0`
- ✅ `Flask-SocketIO==5.6.0`
- ✅ `python-socketio==5.10.0`
- ✅ `pytest==9.0.2`

### Additional Dependencies Needed

```
# Add to requirements.txt
pytest-timeout==2.1.0          # Prevent hanging tests
pytest-asyncio==0.21.0        # For async event handling (optional)
pytest-mock==3.10.0           # For mocking (optional but useful)
python-engineio==4.8.0        # Ensure compatible version
```

### Optional Enhancements
```
pytest-xdist==3.5.0           # Parallel test execution
pytest-cov==4.1.0             # Coverage reporting
pytest-html==3.2.0            # HTML test reports
```

### Installation
```bash
pip install -r requirements.txt
# Add new dependencies:
pip install pytest-timeout==2.1.0
```

---

## 6. File Structure for Phase 2.4

```
tests/
├── api/
│   ├── test_flask_endpoints.py        (existing - 13 tests)
│   ├── test_graph_service.py          (existing - 8 tests)
│   ├── test_session.py                (existing - 9 tests)
│   ├── test_socketio.py               (existing - 14 tests)
│   └── test_e2e_integration.py        ← NEW (22 tests)
│       ├── TestMultiClientSync        (5 tests)
│       ├── TestSessionLifecycle       (4 tests)
│       ├── TestRESTWebSocketIntegration (4 tests)
│       ├── TestErrorHandling          (4 tests)
│       ├── TestBackwardsCompat        (2 tests)
│       └── TestCrossLayerFlows        (3 tests)
│
├── conftest.py                        (extend with E2E fixtures)
│
└── integration/                       (optional: separate folder)
    └── test_realistic_scenarios.py    (extended workflows)
```

---

## 7. Validation Criteria for Phase 2.4 Completion

### 7.1 Test Metrics
- [ ] All 22 core E2E tests passing (100% success rate)
- [ ] Test execution time < 30 seconds (for full suite)
- [ ] Code coverage for test_e2e_integration.py > 85%
- [ ] All Socket.IO namespace handlers exercised
- [ ] All broadcaster functions called in tests

### 7.2 Functional Coverage
- [ ] Multi-client event broadcasting verified
- [ ] Session lifecycle (create → activity → cleanup) end-to-end
- [ ] REST API → WebSocket integration verified for all major operations
- [ ] Error cases don't crash server
- [ ] REST-only clients still work
- [ ] Backwards compatibility confirmed

### 7.3 Code Quality
- [ ] No new linting errors (pylint, flake8)
- [ ] Type hints for all test functions (optional but preferred)
- [ ] Clear docstrings for each test method
- [ ] Descriptive assertion messages
- [ ] Proper cleanup (fixtures, teardown)

### 7.4 Documentation
- [ ] Test names clearly indicate what's tested
- [ ] Docstrings explain scenario + expected behavior
- [ ] Comments for complex test logic (event ordering, timing)
- [ ] README updated with Phase 2.4 info

### 7.5 Performance Requirements
- [ ] No tests exceed 5 seconds each
- [ ] Multi-client tests handle 10+ concurrent clients
- [ ] Event propagation latency tracked (informational)

---

## 8. Implementation Roadmap

### Sprint 1: Foundation & Category A-B
**Week 1-2: 13 tests**
- [ ] Extend conftest.py with multi-client fixtures
- [ ] Implement test_e2e_integration.py skeleton
- [ ] Category A: Multi-Client Sync (5 tests)
- [ ] Category B: Session Lifecycle (4 tests)
- [ ] Update requirements.txt
- [ ] Initial test run and debugging

### Sprint 2: Categories C-D  
**Week 2-3: 8 tests**
- [ ] Category C: REST→WebSocket Integration (4 tests)
- [ ] Category D: Error Handling (4 tests)
- [ ] Integration with existing phase tests
- [ ] Debugging and refinement

### Sprint 3: Categories E-F
**Week 3-4: 9+ tests**
- [ ] Category E: Backwards Compatibility (2 tests)
- [ ] Category F: Cross-Layer Flows (3 tests)
- [ ] Stress testing (optional: 2-3 advanced tests)
- [ ] Final validation and documentation
- [ ] Phase 2.4 completion review

---

## 9. Success Metrics

### Before Phase 2.4
```
Total Tests: 77
  Phase 1: 53 tests
  Phase 2.1: 14 tests (Socket.IO foundation)
  Phase 2.2: 10 tests (Event integration)
  Phase 2.3: 0 new tests (session mgmt code)
```

### After Phase 2.4
```
Total Tests: 99-101
  Phase 1: 53 tests (unchanged)
  Phase 2.1: 14 tests (unchanged)
  Phase 2.2: 10 tests (unchanged)
  Phase 2.3: 0 tests (reuse existing fixtures)
  Phase 2.4: 22 tests (new E2E integration)
  Optional: 0-3 additional advanced tests
```

### Coverage Goals
- **WebSocket namespace handlers:** 100%
- **Broadcasting functions:** 100%
- **Session management routes:** 95%+
- **Error handlers:** 90%+

---

## 10. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Multi-client tests are flaky (timing issues) | Use pytest-timeout, explicit waits, deterministic ordering |
| Cleanup not working properly | Verify _sessions and _session_metadata are empty after tests |
| Socket.IO client connection issues | Test with both test_client and real socketio_client |
| Event ordering unpredictable | Capture timestamps, use sequence numbers, test ordering explicitly |
| Performance degradation with multi-clients | Monitor test execution time, limit to 10 concurrent per test |
| REST client doesn't receive broadcasts | Document as expected; only WebSocket clients receive broadcasts |

---

## 11. Next Steps After Phase 2.4

### Phase 2.5: Performance & Stress Testing
- Load testing (100+ concurrent clients)
- Event latency benchmarking
- Memory profiling
- Network resilience testing

### Phase 3: UI Integration
- Frontend WebSocket client implementation
- Real browser testing
- End-to-end with actual UI

### Phase 4: Production Hardening
- Rate limiting
- Authentication/Authorization
- Database persistence
- Monitoring and observability

---

## Appendix A: Sample Test Template

```python
# tests/api/test_e2e_integration.py

import pytest
import uuid
import time
from backend.app import create_app


@pytest.fixture
def app():
    """Create test app."""
    app = create_app()
    app.config['TESTING'] = True
    return app


@pytest.fixture
def rest_client(app):
    """REST test client."""
    return app.test_client()


@pytest.fixture
def socketio_client_factory(app):
    """Factory for creating WebSocket test clients."""
    socketio = app.extensions['socketio']
    def factory():
        return socketio.test_client(app)
    return factory


@pytest.fixture
def session_id(rest_client):
    """Create a session for testing."""
    response = rest_client.post('/api/v1/sessions')
    return response.json['session_id']


class TestMultiClientEventSync:
    """Category A: Multi-Client Event Synchronization."""
    
    def test_two_clients_receive_same_event(self, rest_client, socketio_client_factory, session_id):
        """A1: Create node, verify both clients get broadcast."""
        # Setup: Connect 2 clients
        client1 = socketio_client_factory()
        client2 = socketio_client_factory()
        
        events1, events2 = [], []
        client1.on('node-created', lambda d: events1.append(d))
        client2.on('node-created', lambda d: events2.append(d))
        
        client1.emit('join_session', {'session_id': session_id})
        client2.emit('join_session', {'session_id': session_id})
        
        # Execute: Create node via REST (broadcasts to session room)
        rest_client.post(f'/api/v1/{session_id}/nodes',
                        json={'blueprint_type_id': 'task', 'name': 'Test'})
        
        # Verify: Both clients received event
        time.sleep(0.1)  # Allow event propagation
        assert len(events1) == 1
        assert len(events2) == 1
        assert events1[0] == events2[0]
```

---

## Appendix B: Debugging Commands

```bash
# Run all Phase 2.4 tests
python -m pytest tests/api/test_e2e_integration.py -v

# Run specific test
python -m pytest tests/api/test_e2e_integration.py::TestMultiClientSync::test_two_clients_receive_same_event -v

# Run with output capture (see print statements)
python -m pytest tests/api/test_e2e_integration.py -v -s

# Run with coverage
python -m pytest tests/api/test_e2e_integration.py --cov=backend --cov-report=html

# Run with timeout (fail if takes > 10s)
python -m pytest tests/api/test_e2e_integration.py --timeout=10

# Run all tests
python -m pytest tests/ -v --tb=short
```

---

## Summary Table

| Aspect | Details |
|--------|---------|
| **Duration** | 2-3 sprints (3-4 weeks) |
| **New Tests** | 22 core + 0-3 optional |
| **Total Tests After** | 99-101 |
| **Focus** | Multi-client WebSocket + REST integration |
| **Key Tech** | Socket.IO test client, event listeners, pytest fixtures |
| **Success Criteria** | All tests passing, E2E flows verified, backwards compat confirmed |
| **Risk Level** | Medium (flaky timing issues possible, mitigated with explicit waits) |

