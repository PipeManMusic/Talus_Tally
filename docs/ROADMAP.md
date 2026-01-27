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

* [ ] **5.1 Build Graph Service**
    * File: `backend/api/graph_service.py`
    * Logic: High-level methods (`get_tree`, `search_nodes`).

* [ ] **5.2 Build Session Manager**
    * File: `backend/api/session.py`
    * Logic: Manage "Active Blueprint" and "Current Selection".

---

## Phase 6: The UI (The Viewer)
**Goal:** Visual interface.

* [ ] **6.1 Build "Wizard" Dialog**
    * Logic: Read `Blueprint.wizard_questions` -> Render Form -> Generate Config.

* [ ] **6.2 Build Tree Renderer**
    * Logic: Recursive draw of `GraphService.get_tree()`.

* [ ] **6.3 Build Property Inspector**
    * Logic: Listen to Selection -> Look up Node Type -> Render specific fields (Currency, Text, Markdown).