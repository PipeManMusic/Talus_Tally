# Talus Core: Implementation Roadmap
See previous chat for full content.
# Talus Core: Implementation Roadmap
**The Backwards Plan: From Vision to Execution**

This document outlines the step-by-step execution plan to build Talus Core. It is designed to be executed in order, ensuring that dependencies are built before the features that rely on them.

---

## Phase 1: The Blueprint (The Source of Truth)
**Goal:** Establish the data definitions (YAML) before writing Python code. We cannot write the `Node` class until we know what fields it must support.

* [ ] **1.1 Define Meta-Schema**
    * Create `data/definitions/meta_schema.yaml`.
    * Define valid property types (text, number, currency, select).
    * Define node capability flags (has_inventory, has_media).

* [ ] **1.2 Author "Restomod Creator" Blueprint**
    * Create `data/templates/restomod.yaml`.
    * Define complex nodes: `Junkyard Part`, `Script Concept`, `Shoot Day`.
    * Define logic: Velocity weights and Report templates.

* [ ] **1.3 Author "Music Production" Blueprint**
    * Create `data/templates/music_production.yaml`.
    * Verify the schema handles completely different needs (Gear, Tracks, Sessions).

---

## Phase 2: The Core (The DNA)
**Goal:** Build the pure Python data structures. No I/O allowed here.

* [ ] **2.1 Implement Generic Node**
    * File: `backend/core/node.py`
    * Class `Node`: Support `properties` dict, `children` list, and `blueprint_type_id`.
    * Test: `tests/core/test_node.py` (Verify property storage).

* [ ] **2.2 Implement Project Graph**
    * File: `backend/core/graph.py`
    * Class `ProjectGraph`: Support O(1) lookup by ID and "Inverted Index" (find parents).
    * Test: `tests/core/test_graph.py`.

---

## Phase 3: The Infra (The Engine Room)
**Goal:** Build the machinery that manipulates the Core.

* [ ] **3.1 Build Schema Loader**
    * File: `backend/infra/schema_loader.py`
    * Logic: Read YAML -> Validate against Meta-Schema -> Return `Blueprint` object.
    * Test: `tests/infra/test_schema_loader.py` (Load `restomod.yaml`).

* [ ] **3.2 Build Persistence Manager**
    * File: `backend/infra/persistence.py`
    * Logic: Serialize `ProjectGraph` to JSON.
    * Test: `tests/infra/test_persistence.py` (Save/Load cycle).

* [ ] **3.3 Build Velocity Engine**
    * File: `backend/infra/velocity.py`
    * Logic: Traverse Graph -> Apply Blueprint Math -> Assign Scores.
    * Test: `tests/infra/test_velocity.py` (Verify "Quick Win" sorting).

* [ ] **3.4 Build Report Engine**
    * File: `backend/infra/reporting.py`
    * Logic: Jinja2 Context Injection -> Render String.
    * Test: `tests/infra/test_reporting.py` (Generate a mock "Call Sheet").

---

## Phase 4: The Handlers (The Business Logic)
**Goal:** Build the Command System to safely modify the graph.

* [ ] **4.1 Implement Command Dispatcher**
    * File: `backend/handlers/dispatcher.py`
    * Logic: Execute Command -> Stack for Undo -> Emit Log Event.

* [ ] **4.2 Implement Basic Commands**
    * File: `backend/handlers/commands/node_commands.py`
    * Commands: `CreateNode`, `DeleteNode`, `LinkNode`.
    * Test: `tests/handlers/test_commands.py` (Verify Undo functionality).

* [ ] **4.3 Implement "Kit" Logic**
    * File: `backend/handlers/commands/macro_commands.py`
    * Command: `ApplyKit` (Finds a Kit Node -> Clones children to Target Node).

---

## Phase 5: The API (The Gateway)
**Goal:** Expose the logic to the outside world (UI or CLI).

* [x] **5.1 Build Graph Service**
    * File: `backend/api/graph_service.py`
    * Logic: High-level methods (`get_tree`, `search_nodes`).
    * Status: COMPLETE ✅

* [x] **5.2 Build Session Manager**
    * File: `backend/api/session.py`
    * Logic: Manage "Active Blueprint" and "Current Selection".
    * Status: COMPLETE ✅

* [x] **5.3 Build Project Manager**
    * File: `backend/api/project_manager.py`
    * Logic: Create/load/save projects, manage templates.
    * Status: COMPLETE ✅

---

## Phase 5.5: The REST API (The Bridge)
**Goal:** Expose Python backend as JSON/REST API for web-based UI.

* [ ] **5.5.1 Create Flask Application**
    * File: `backend/app.py`
    * Logic: Initialize Flask, set up routes, error handlers, middleware.
    * Test: `tests/api/test_flask_endpoints.py` (Verify endpoints work).

* [ ] **5.5.2 Implement Project Endpoints**
    * Endpoints: `POST /api/projects/new`, `GET /api/projects/<id>`, etc.
    * Logic: Wrap ProjectManager API, serialize to JSON.
    * Test: TDD - write failing tests first.

* [ ] **5.5.3 Implement Command Endpoints**
    * Endpoints: `POST /api/commands/execute`, `GET /api/commands/undo`, etc.
    * Logic: Wrap CommandDispatcher, serialize results.
    * Test: TDD - write failing tests first.

* [ ] **5.5.4 Implement Graph Query Endpoints**
    * Endpoints: `GET /api/graph/nodes`, `GET /api/graph/tree`, etc.
    * Logic: Wrap GraphService, serialize results.
    * Test: TDD - write failing tests first.

* [ ] **5.5.5 Implement WebSocket Layer**
    * Logic: Real-time GraphService subscriptions via SocketIO.
    * Events: `property-changed`, `node-created`, `command-executed`.
    * Test: Test multi-client synchronization.

---

## Phase 6: The React Frontend (The Viewer)
**Goal:** Modern, responsive web-based UI (separate repo).

* [ ] **6.1 Scaffold React App**
    * Location: `frontend/` folder (separate from backend)
    * Setup: TypeScript, Vite, testing libraries.
    * Test: TDD - component tests use React Testing Library.

* [ ] **6.2 Build API Client Library**
    * File: `frontend/src/api/client.ts`
    * Logic: Axios wrapper, request/response serialization, error handling.
    * Test: Mock API responses, verify serialization.

* [ ] **6.3 Build Tree Component**
    * Logic: Render node graph hierarchically.
    * Features: Expand/collapse, drag-and-drop, context menu.
    * Test: TDD - test without backend (mock API).

* [ ] **6.4 Build Inspector Component**
    * Logic: Display/edit node properties based on blueprint.
    * Features: Dynamic forms, save/cancel, validation.
    * Test: TDD - test without backend (mock API).

* [ ] **6.5 Build Toolbar**
    * Logic: Undo/redo buttons, file menu, view options.
    * Features: Command routing through API.
    * Test: TDD - verify button clicks trigger API calls.

* [ ] **6.6 Implement GraphService Subscriptions**
    * Logic: Hook into WebSocket, update tree/inspector in real-time.
    * Features: Multi-tab synchronization, live collaboration prep.
    * Test: Test real-time updates in multiple tabs.

---

## Phase 7: Desktop Packaging
**Goal:** Distribute as desktop app (Windows/Mac/Linux).

* [ ] **7.1 Choose Packaging Strategy**
    * Option A: Tauri (lightweight, Rust backend)
    * Option B: Electron (widely-used, larger footprint)
    * Decision: TBD based on performance requirements.

* [ ] **7.2 Package React App**
    * Logic: Build React (`npm run build`), configure Tauri/Electron.
    * Test: Test on Windows, Mac, Linux.
    * Release: Publish installers.