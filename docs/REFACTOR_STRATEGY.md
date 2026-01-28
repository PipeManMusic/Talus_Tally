# Refactor Strategy: Qt → Web-Based Frontend

## Phase 0: Cleanup & Documentation (THIS PHASE)
**Goal:** Remove technical debt and clarify intent before starting major refactoring.

### 0.1 Remove Qt-Dependent Tests
**Status:** READY TO EXECUTE
- **Delete:** `tests/ui/qt/` (all files)
  - `test_integration.py`
  - `test_persistence_wiring.py`
  - `test_inspector_widget.py`
  - `test_main_window.py`
  - `test_tree_model.py`
  - `test_qt_launch.py`
- **Keep:** `tests/ui/test_*.py` (pure logic tests)
  - `test_app_structure.py`
  - `test_indicator_integration.py`
  - `test_inspector_logic.py`
  - `test_property_update_flow.py`
  - `test_renderer_logic.py`
  - `test_tree_adapter.py`
  - `test_wizard_logic.py`

**Why:** These test backend behavior (Commands, GraphService, API layer), not Qt rendering. They WILL still work with Flask API endpoints.

### 0.2 Update MASTER_PLAN.md
**Changes:**
- Add **Phase 5.5: The REST API (The Bridge)**
  - Responsibility: Expose Core/Infra/Handlers/API as JSON endpoints
  - Key Components: Flask/FastAPI application layer
  - What stays out: All business logic (remains in Layers 1-4)
- Clarify that **UI Layer now exists outside backend** (separate repo)
- Document API contract expectations
- Remove any Qt-specific references

### 0.3 Update ROADMAP.md
**Changes:**
- Add **Phase 6.5: REST API Layer**
  - Build Flask/FastAPI server
  - Expose ProjectManager, CommandDispatcher, GraphService as endpoints
  - Implement WebSocket for real-time subscriptions (GraphService notifications)
- Add **Phase 7: React Frontend**
  - Create React app (separate repo)
  - Build components for tree, inspector, toolbar
  - Implement API client library
- Clarify Phase 6 (Old "UI") is now deprecated

### 0.4 Create API Contract Document
**New File:** `docs/API_CONTRACT.md`
- REST endpoint specifications
- JSON schemas for requests/responses
- WebSocket message formats
- Authentication/session management
- Example client code

---

## Phase 1: Flask API Server (FOUNDATION)
**Goal:** Expose backend as REST API. All logic stays in backend; API just wraps it.

### 1.1 Create Flask Application
**File:** `backend/app.py`
**Responsibility:** 
- Initialize Flask app
- Set up CORS, request logging
- Define global error handlers
- Create helper functions for async/background tasks

**Test-First:** Write failing tests in `tests/api/test_flask_endpoints.py` for each endpoint

### 1.2 Implement Project Endpoints
**Endpoints:**
```
POST   /api/projects/new              → Create new project
GET    /api/projects/<id>             → Load project
POST   /api/projects/<id>/save        → Save project
GET    /api/projects/<id>/export      → Export (PDF/JSON)
GET    /api/templates                 → List available templates
GET    /api/templates/<id>/schema     → Get template schema
```

**Implementation Pattern:**
```python
@app.route('/api/projects/new', methods=['POST'])
def new_project():
    template_id = request.json['template_id']
    project_name = request.json['project_name']
    
    # Use backend API (not Qt)
    project_manager = ProjectManager()
    graph = project_manager.create_new_project(template_id, project_name)
    
    return {'project_id': ..., 'graph': graph.to_dict()}
```

**Key Insight:** API layer takes JSON, calls backend API, returns JSON. No Qt involved.

### 1.3 Implement Command Endpoints
**Endpoints:**
```
POST   /api/commands/execute          → Execute single command + undo/redo
POST   /api/commands/batch            → Execute multiple commands atomically
GET    /api/commands/undo             → Undo last command
GET    /api/commands/redo             → Redo last command
```

**Implementation:**
```python
@app.route('/api/commands/execute', methods=['POST'])
def execute_command():
    command_type = request.json['command_type']
    command_data = request.json['data']
    
    # Route through CommandDispatcher
    dispatcher = CommandDispatcher(session_graph)
    result = dispatcher.execute(command_type, command_data)
    
    return {'success': True, 'graph': session_graph.to_dict()}
```

### 1.4 Implement Graph Query Endpoints
**Endpoints:**
```
GET    /api/graph/nodes               → Get all nodes
GET    /api/graph/nodes/<id>          → Get specific node
GET    /api/graph/tree                → Get tree structure
POST   /api/graph/search              → Search nodes
GET    /api/graph/export/<format>     → Export (JSON/CSV/PDF)
```

**Test-First:** Write tests that verify API returns same data as backend API

---

## Phase 2: WebSocket Layer (NOTIFICATIONS)
**Goal:** Real-time state updates for multi-user/multi-tab scenarios.

### 2.1 Implement GraphService Subscriptions
**Mechanism:** 
- Flask-SocketIO for WebSocket support
- Client connects: `socket.connect()` → server registers listener
- Server broadcasts: When GraphService notifies, emit to all connected clients

### 2.2 Event Stream
**Events:**
```
property-changed      → {node_id, property_id, old_value, new_value}
node-created          → {node_id, parent_id, blueprint_type_id}
node-deleted          → {node_id}
command-executed      → {command_type, was_undone, undo_available, redo_available}
```

---

## Phase 3: React Frontend (UI)
**Goal:** Modern, responsive, maintainable frontend.

### 3.1 Scaffold React App
```bash
cd frontend/
npx create-react-app . --template typescript
```

**Folder Structure:**
```
frontend/
├── src/
│   ├── api/
│   │   ├── client.ts         # Axios client wrapper
│   │   ├── projects.ts       # Project API methods
│   │   ├── commands.ts       # Command API methods
│   │   └── graph.ts          # Graph query API methods
│   ├── components/
│   │   ├── Tree.tsx          # Tree view component
│   │   ├── Inspector.tsx      # Property inspector
│   │   ├── Toolbar.tsx        # Top toolbar
│   │   └── Dialogs/          # Reusable dialogs
│   ├── hooks/
│   │   ├── useGraphService.ts     # GraphService subscription hook
│   │   ├── useCommandDispatcher.ts # Command execution hook
│   │   └── useSession.ts          # Session management
│   ├── context/
│   │   ├── GraphContext.tsx        # Global graph state
│   │   └── SessionContext.tsx      # User session state
│   └── App.tsx                     # Root component
├── public/
└── package.json
```

### 3.2 Test-First: API Client Tests
**File:** `frontend/src/api/__tests__/client.test.ts`
- Mock API responses
- Verify request/response serialization
- Test error handling

### 3.3 Test-First: Component Tests
**File:** `frontend/src/components/__tests__/Tree.test.tsx`
- Use React Testing Library
- Test component rendering (without backend)
- Test event handlers
- Mock API calls

---

## Phase 4: Desktop Packaging
**Goal:** Distribute as desktop app (Windows/Mac/Linux).

### 4.1 Choose Tauri or Electron
**Tauri (Recommended):**
- Smaller bundle size
- Better performance
- Rust backend integration possible
- Less memory overhead

**Electron (Alternative):**
- Larger bundle size
- More widely used
- Easier debugging
- Heavier memory footprint

### 4.2 Package React App
- Build React (`npm run build`)
- Configure Tauri/Electron to serve it
- Test on Windows/Mac/Linux

---

## Execution Priority: Smart Start

### **FIRST (This Session):**
1. **Remove Qt tests** → Clean codebase
2. **Update docs** → Align intent with new architecture
3. **No code changes yet** → Just housekeeping

### **SECOND (Next Session):**
1. **Create `backend/app.py`** with basic Flask server
2. **Write failing tests** for project endpoints
3. **Implement endpoints** one at a time (TDD)
4. **Verify all backend tests still pass**

### **THIRD:**
1. **Add WebSocket layer** for real-time updates
2. **Implement GraphService subscriptions**
3. **Test multi-client scenarios**

### **FOURTH:**
1. **Scaffold React app**
2. **Build API client library**
3. **Implement Tree component** (test-first)
4. **Implement Inspector component** (test-first)

### **FIFTH:**
1. **Package with Tauri/Electron**
2. **Test on all platforms**
3. **Release v1.0**

---

## Why This Order?

| Phase | Why First? |
|-------|-----------|
| **Remove Qt Tests** | Prevents accumulating tech debt. Bad tests = future work. |
| **Update Docs** | Ensures team (and future you) knows the intent. Prevents confusion. |
| **Flask API** | Backend logic is already solid. API just wraps it. Low risk. |
| **WebSocket** | Optional for v1, but needed for future collaboration features. |
| **React** | Depends on API being stable. Fast iteration once API is ready. |
| **Packaging** | Last step. Needs everything else working first. |

---

## Testing Strategy Throughout

**Backend Tests (Unchanged):**
- `tests/core/` → Data structures (PASS ✅)
- `tests/infra/` → Persistence, schemas, velocity (PASS ✅)
- `tests/handlers/` → Commands, dispatcher (PASS ✅)
- `tests/api/` → GraphService, ProjectManager (PASS ✅)
- `tests/ui/test_*.py` → Pure logic, no Qt (PASS ✅, still work with API)

**New API Tests (TDD):**
- `tests/api/test_flask_endpoints.py` → Start with failing tests
- Each endpoint: Test request → Mock backend → Assert response

**Frontend Tests (TDD):**
- `frontend/src/api/__tests__/` → API client tests
- `frontend/src/components/__tests__/` → Component tests
- Mock backend API calls

**Integration Tests (Final):**
- `tests/integration/test_e2e.py` → Full stack (Flask + React)
- Selenium or Playwright for UI testing

---

## Key Principles

1. **Backend is the source of truth.** API just wraps it.
2. **Test-First.** Write failing tests before touching code.
3. **One phase at a time.** Don't skip steps.
4. **No tech debt.** Remove Qt tests BEFORE starting new work.
5. **Documentation first.** Update docs to reflect intent BEFORE implementation.
6. **Keep it simple.** Each endpoint does ONE thing.

---

## Success Criteria

- ✅ Qt tests removed, codebase clean
- ✅ Docs updated with new architecture
- ✅ Flask API serves all backend functionality
- ✅ All backend tests still pass
- ✅ React frontend communicates with API
- ✅ Can create/edit/save projects via frontend
- ✅ Undo/redo works through API
- ✅ Deployable as desktop app (Tauri/Electron)
- ✅ Can extend to mobile with same backend
