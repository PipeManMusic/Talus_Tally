````markdown
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
* **Responsibility:** Manipulation, Persistence, Calculation, and Debugging.
* **Key Components:**
    * `SchemaLoader`: Parses YAML Blueprints -> Configures Core Models.
    * `PersistenceManager`: Saves Graph state -> JSON/SQLite.
    * `VelocityEngine`: The Algorithm (Calculates scores based on Blueprint weights).
    * `ReportEngine`: Jinja2 Renderer (Generates PDFs/CSVs).
    * `LogManager`: **FOR DEBUGGING ONLY.** Centralized event tracking of internal signal flow. Used by tests to verify "Signal A triggered Action B." NOT used for UI communication.

### Layer 3: API (The Gateway)
* **Responsibility:** The Boundary. Translates external requests into internal actions AND notifies observers of state changes.
* **Key Components:**
    * `GraphService`: Facade for node operations (`get`, `query`, `export`). **Provides observer pattern methods:**
        * `subscribe_to_property_changes(callback)`: Register to receive notifications when properties change
        * `notify_property_changed(node_id, property_id, new_value)`: Called by Commands to notify all subscribers
    * `SessionManager`: Handles multi-user states and Undo/Redo cursors.
    * `SyncAdapter`: Future-proofing for live collaboration (CRDTs).

### Layer 4: HANDLERS (The Business Logic)
* **Responsibility:** Intent Translation. Orchestrates the API based on user events.
* **Key Components:**
    * **Command Dispatcher:** Implements the **Command Pattern** (Undo/Redo support).
    * **SelectionManager:** Tracks active focus.

### Layer 5: REST API (The Bridge)
* **Responsibility:** Translate Python backend to JSON endpoints. No logic, pure API exposure.
* **Key Components:**
    * Flask/FastAPI application layer
    * Request/response serialization
    * WebSocket subscription bridge (for GraphService notifications)
    * No Qt or UI code here

### Layer 6: UI (The Dumb Viewer - Separate Repo)
* **Responsibility:** Pixel Pushing. Observes State via API, draws it. **Zero Logic.**
* **Technologies:** React/Vue (JavaScript/TypeScript)
* **Key Components:**
    * Tree component (renders node graph)
    * Inspector component (displays/edits properties)
    * Toolbar (UI for commands)
* **Important:** UI code lives in SEPARATE repository (`frontend/`) from backend

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

### 3.3 The "Signal Flow" Protocol (Logging & Notifications)

**LogManager (For Testing & Debugging):**
* **Rule:** Every Command execution must emit a structured log event via `LogManager`.
* **Usage:** Tests ONLY use `LogManager` to verify that "Command A triggered Effect B" in the backend.
* **NOT for UI:** The UI does NOT subscribe to LogManager. LogManager is internal infrastructure for testing.
* **Typical Events:** `EXECUTE_START`, `EXECUTE_COMPLETE` (from Dispatcher). Commands may emit their own events for debugging.

**API Layer State Notifications (For UI Communication):**
* **Rule:** State changes that affect the UI MUST trigger API notifications via the service layer.
* **Implementation:** Services (e.g., `GraphService`) provide `subscribe_to_property_changes(callback)` for UI observers.
* **Commands are responsible:** When a Command modifies state, it calls the API service to notify subscribers.
* **UI Responsibility:** The UI subscribes to API services and reacts to notifications. The UI is the "Dumb Viewer."

**Example Flow:**
```
User edits property in Inspector
  ↓
Inspector emits Qt signal
  ↓
handle_property_change() creates UpdatePropertyCommand
  ↓
Command executes:
  - Modifies node.properties (state change)
  - Calls graph_service.notify_property_changed() (notify API subscribers)
  ↓
Qt Main Window receives callback from graph_service
  ↓
Tree view refreshes to display updated property
```

---

## 4. Critical Architecture Distinction: LogManager vs API Notifications

**DO NOT CONFUSE THESE TWO SYSTEMS:**

### LogManager (INFRA Layer - For Tests)
```python
# This is for DEBUGGING and testing the system
LogManager().emit(source="Command", event_type="EXECUTE", payload={...})
# Test code subscribes to this to verify internal behavior
```
- Used by Dispatcher to log command execution
- Used by backend code for structured debugging  
- Tests read LogManager history to assert "Signal A triggered Effect B"
- **NEVER directly used by UI**

### API Service Notifications (API Layer - For UI)
```python
# This is for UI consumption - a direct observer pattern
GraphService.subscribe_to_property_changes(callback)  # UI subscribes
GraphService.notify_property_changed(node_id, prop_id, value)  # Commands notify
```
- Used by Services to notify UI of state changes
- UI subscribes to these notifications
- Callbacks are invoked directly (not polled)
- This is how the "Dumb Viewer" gets its data

### The Difference
| Aspect | LogManager | API Notifications |
|--------|-----------|-------------------|
| Layer | INFRA (internal) | API (external boundary) |
| Purpose | Debugging & Testing | UI Communication |
| Who reads it? | Tests | UI Components |
| Flow | Events are logged, then read | Subscribers are called directly |
| Coupling | Internal infrastructure | API contract |

---

## 6. Data Identification Strategy: UUIDs for Blueprint References

**Problem Solved:** String-based matching for blueprint options (properties, allowed values) becomes fragile and error-prone as templates grow complex. Renaming an option breaks stored data.

**Solution:** Use UUIDs as the canonical identifier for all blueprint reference data (option values, etc.). Templates remain human-readable; UUIDs are generated on load.

### 6.1 Where UUIDs Are Used
- **Option Values** - Each option in a select property has a UUID (e.g., `status` property has options with UUIDs)
- **Stored Data** - Node properties store UUID references, not string values
- **Template Files** - Kept clean (human-readable), no UUIDs in YAML
- **API Contracts** - All blueprint queries use UUID lookups

### 6.2 UUID Generation & Lifecycle
1. **Template Definition** (YAML) - Human-readable only. Example:
   ```yaml
   - id: "status"
     type: "select"
     options:
       - name: "Not Started"
         bullet: "◯"
       - name: "In Progress"
         bullet: "◐"
   ```

2. **Load Time** - `SchemaLoader` generates stable UUIDs for each option:
   ```python
   # SchemaLoader.load() generates UUID based on:
   # hash(node_type_id + property_id + option_name)
   # This ensures UUIDs are stable across reloads
   ```

3. **API Layer** - `Blueprint` class provides methods:
   ```python
   blueprint.get_option_by_uuid(property_id, uuid) -> {"name": "...", "bullet": "..."}
   blueprint.get_option_uuid(property_id, option_name) -> uuid
   ```

4. **Data Layer** - Nodes store UUIDs:
   ```python
   node.properties = {"status": "550e8400-e29b-41d4-a716-446655440000"}  # UUID, not "In Progress"
   ```

5. **UI Layer** - Inspector/Renderer use UUID lookups:
   ```python
   # Inspector stores/retrieves UUIDs
   # Renderer looks up UUID to get display name and bullet
   ```

### 6.3 Benefits
- ✅ **No String Matching** - All lookups are UUID-based, eliminating typo/case bugs
- ✅ **Template Evolution** - Can rename option text without breaking saved data
- ✅ **Stable References** - UUIDs are deterministic (based on content hash)
- ✅ **API Validation** - Commands can verify UUIDs exist before executing
- ✅ **Backward Compatible** - YAML templates are unchanged; complexity is internal

---

## 7. Visual Indicator System - Semantic Status Communication

**Problem Solved:** Status representation needs to be:
- Consistent (no unicode character size variations)
- Themed (colors + styling for semantic meaning)
- Reusable (same indicators across templates)
- Elegant (restrained design, not overdecorated)

**Solution:** Separate indicator assets with centralized catalog defining theming.

### 7.1 Architecture

**Three layers:**

1. **Indicator Catalog** (`assets/indicators/catalog.yaml`)
   - Defines all indicator sets (status, priority, etc.)
   - Maps indicator IDs to SVG files
   - Defines default theme (colors, text styling)

2. **SVG Assets** (`assets/indicators/*.svg`)
   - Minimal vector graphics (24x24, stroke-based)
   - Program-specific visual language
   - Colors applied programmatically

3. **Templates** (`data/templates/*.yaml`)
   - Reference indicator set by name
   - Map options to indicator IDs
   - Optionally override colors/styling per option

### 7.2 Catalog Structure

**`assets/indicators/catalog.yaml`:**
```yaml
indicator_sets:
  status:
    description: "Task/item status indicators"
    indicators:
      - id: "empty"
        file: "status_empty.svg"
      - id: "partial"
        file: "status_partial.svg"
      - id: "filled"
        file: "status_filled.svg"
      - id: "alert"
        file: "status_alert.svg"
    
    default_theme:
      empty:
        indicator_color: "#888888"
        text_color: "#888888"
      partial:
        indicator_color: "#4A90E2"
        text_color: "#4A90E2"
        text_style: "bold"
      filled:
        indicator_color: "#7ED321"
        text_color: "#7ED321"
        text_style: "strikethrough"
      alert:
        indicator_color: "#F5A623"
        text_color: "#F5A623"
```

### 7.3 Template Integration

**`restomod.yaml`:**
```yaml
- id: "status"
  type: "select"
  indicator_set: "status"
  options:
    - name: "Not Started"
      indicator: "empty"
    - name: "In Progress"
      indicator: "partial"
    - name: "Done"
      indicator: "filled"
    - name: "Blocked"
      indicator: "alert"
      # Optional color override: text_color: "#FF0000"
```

### 7.4 Rendering Pipeline

1. **Load Time** - SchemaLoader resolves:
   - Indicator set references to catalog entries
   - Indicator IDs to SVG file paths
   - Color/style from default theme (with option overrides)

2. **Display Time** - Renderer:
   - Loads SVG by UUID reference (content-based caching)
   - Applies color programmatically to stroke
   - Applies text color and styling to tree node text
   - Returns HTML with styled indicator + text

3. **Extensibility** - New templates can:
   - Use existing indicator sets
   - Create new sets with same SVG shape library
   - Override colors per status
   - Contribute SVGs following style guide

### 7.5 Design Philosophy

- **Restraint:** Color + indicator + text styling. No shadows, sizes, opacity levels.
- **Consistency:** Program-specific visual language, not borrowed from generic UI packs.
- **Contribution-friendly:** Style guide in catalog, SVG patterns in docs.
- **Themeable but guided:** Defaults make sense; override when necessary.

---

## 8. Test Hierarchy
The `tests/` folder must mirror the `backend/` folder to ensure isolation.

```text
tests/
├── core/           # Tests for Node, Graph (No I/O)
├── infra/          # Tests for SchemaLoader, VelocityEngine (Mock I/O)
├── api/            # Tests for GraphService (Mock Infra) - Verify notifications fire
├── handlers/       # Tests for CommandDispatcher (Mock API) - Verify LogManager events
└── ui/             # Tests for Rendering (Mock GraphService)
```

**Important:** 
- Tests in `handlers/` verify Commands work by checking **LogManager events**
- Tests in `ui/` verify UI refresh by mocking **API service callbacks**
- They use DIFFERENT notification systems for different purposes
````
