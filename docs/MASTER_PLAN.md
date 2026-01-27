# Talus Core: Master Architecture
See previous chat for full content.
# Talus Core: The Project Velocity Engine
**Master Architecture & Implementation Roadmap**

## 1. System Vision
Talus Core is a universal, template-driven project management engine designed to prioritize **Flow** over **Lists**.
* **Philosophy:** It does not force a workflow. It executes a **Blueprint** defined by the user (Restomod, Film Production, Music).
* **Goal:** To be the "Game Engine" of productivity—generic power powering specific "Game Modes."
* **Maintainability:** Strictly decoupled layers to allow OSS contribution without breaking the core.

---

## 2. Layered Architecture (The 5 Rings)
The system is built in concentric circles. Dependencies only point **inward**. The UI depends on the API; the API depends on Core. Core depends on nothing.

### Layer 1: CORE (The Domain)
* **Responsibility:** Pure Data Structures. No logic, no I/O, no libraries.
* **Key Components:**
    * `Node`: The Universal Atom (Tasks, Parts, People, Clips).
    * `Blueprint`: The Rulebook (Defines what a Node *is*).
    * `ProjectGraph`: The Container (Holds the Nodes).
    * **AI Hook:** All Core models must serialize to "Context Tokens" for future LLM ingestion.

### Layer 2: INFRA (The Engine Room)
* **Responsibility:** Manipulation, Persistence, and Calculation.
* **Key Components:**
    * `SchemaLoader`: Parses YAML Blueprints -> Configures Core Models.
    * `PersistenceManager`: Saves Graph state -> JSON/SQLite.
    * `VelocityEngine`: The Algorithm (Calculates scores based on Blueprint weights).
    * `ReportEngine`: Jinja2 Renderer (Generates PDFs/CSVs).
    * `LogManager`: Centralized signal flow tracking (Crucial for Debugging).

### Layer 3: API (The Gateway)
* **Responsibility:** The Boundary. Translates external requests into internal actions.
* **Key Components:**
    * `GraphService`: Facade for node operations (`get`, `query`, `export`).
    * `SessionManager`: Handles multi-user states and Undo/Redo cursors.
    * `SyncAdapter`: Future-proofing for live collaboration (CRDTs).

### Layer 4: HANDLERS (The Business Logic)
* **Responsibility:** Intent Translation. Orchestrates the API based on user events.
* **Key Components:**
    * **Command Dispatcher:** Implements the **Command Pattern** (Undo/Redo support).
    * **SelectionManager:** Tracks active focus.

### Layer 5: UI (The Dumb Viewer)
* **Responsibility:** Pixel Pushing. Observes State, draws it. **Zero Logic.**
* **Key Components:**
    * `NodeGraphRenderer`: Visualizes the tree.
    * `PropertyInspector`: Dynamic forms based on Blueprint definitions.

---

## 3. The "Code of Law" (Standards)

### 3.1 Pure TDD Protocol
1.  **Write the Test:** Define the expected behavior in `tests/layer/test_feature.py`.
2.  **Fail:** Verify the test fails.
3.  **Code:** Write the minimum code in `backend/layer/feature.py` to pass.
4.  **Refactor:** Clean up while keeping the test green.

### 3.2 The "Manual" Protocol (Docstrings)
* **Rule:** Every Class and Public Method MUST have a generic Google-style docstring.
* **Why:** We will use `Sphinx` or `MkDocs` to auto-generate the User Manual and Developer Guide from the code itself.

### 3.3 The "Signal Flow" Protocol (Logging)
* **Rule:** Every state change must emit a structured log event.
* **Usage:** Tests will subscribe to the `LogManager` to assert that "Signal A triggered Action B."

---

## 4. Test Hierarchy
The `tests/` folder must mirror the `backend/` folder to ensure isolation.

```text
tests/
├── core/           # Tests for Node, Graph (No I/O)
├── infra/          # Tests for SchemaLoader, VelocityEngine (Mock I/O)
├── api/            # Tests for GraphService (Mock Infra)
├── handlers/       # Tests for CommandDispatcher (Mock API)
└── ui/             # Tests for Rendering (Mock Handlers)