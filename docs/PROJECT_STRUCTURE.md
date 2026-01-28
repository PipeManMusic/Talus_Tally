# Project Structure After Qt Removal

```
Tallus Tally/
├── backend/                          # Pure Python business logic (API-first)
│   ├── core/                         # Layer 1: Domain models
│   │   ├── node.py                   # Node data structure
│   │   └── graph.py                  # ProjectGraph
│   ├── infra/                        # Layer 2: Infrastructure
│   │   ├── persistence.py            # Save/load projects
│   │   ├── schema_loader.py          # YAML template parsing
│   │   ├── velocity.py               # Score calculation
│   │   ├── reporting.py              # PDF/CSV generation
│   │   ├── logging.py                # Debug event tracking
│   │   └── indicator_catalog.py      # SVG indicator management
│   ├── handlers/                     # Layer 4: Commands & business logic
│   │   ├── dispatcher.py             # Command dispatcher (undo/redo)
│   │   ├── commands/
│   │   │   ├── node_commands.py      # CreateNode, DeleteNode, etc.
│   │   │   └── macro_commands.py     # Complex multi-step commands
│   │   └── command.py                # Command base class
│   ├── api/                          # Layer 3: Public API
│   │   ├── graph_service.py          # Node queries + notifications
│   │   ├── project_manager.py        # Project CRUD + templates
│   │   └── session.py                # Session management
│   ├── app.py                        # Layer 5: Flask/FastAPI server (FUTURE)
│   ├── __init__.py
│   └── __pycache__/
│
├── frontend/                         # Separate React app (FUTURE)
│   ├── src/
│   │   ├── api/                      # API client library
│   │   ├── components/               # React components (Tree, Inspector, etc.)
│   │   ├── hooks/                    # Custom React hooks
│   │   ├── context/                  # Global state management
│   │   └── App.tsx
│   ├── public/
│   ├── package.json
│   └── .gitignore
│
├── data/                             # Template definitions (source of truth)
│   ├── definitions/
│   │   └── meta_schema.yaml          # Blueprint schema spec
│   └── templates/
│       └── restomod.yaml             # Example: Restomod project template
│
├── assets/                           # Static resources
│   ├── fonts/                        # Custom fonts
│   ├── icons/                        # Icon assets
│   └── indicators/                   # SVG indicator system
│       ├── catalog.yaml              # Indicator definitions
│       └── status_*.svg              # Individual indicator SVGs
│
├── tests/                            # Test suite (backend only)
│   ├── core/                         # Tests for Layer 1 (Node, Graph)
│   │   ├── test_node.py              # ✅ All passing
│   │   └── test_graph.py             # ✅ All passing
│   ├── infra/                        # Tests for Layer 2
│   │   ├── test_persistence.py       # ✅ All passing
│   │   ├── test_schema_loader.py     # ✅ All passing
│   │   ├── test_velocity.py          # ✅ All passing
│   │   ├── test_reporting.py         # ✅ All passing
│   │   ├── test_logging.py           # ✅ All passing
│   │   └── test_indicator_catalog.py # ✅ All passing
│   ├── handlers/                     # Tests for Layer 4 (Commands)
│   │   ├── test_commands.py          # ✅ All passing
│   │   └── test_macro_commands.py    # ✅ All passing
│   ├── api/                          # Tests for Layer 3 (API)
│   │   ├── test_graph_service.py     # ✅ All passing
│   │   └── test_session.py           # ✅ All passing
│   ├── ui/                           # Tests for Layer 5 logic (NO Qt!)
│   │   ├── test_app_structure.py     # ✅ All passing
│   │   ├── test_indicator_integration.py  # ✅ All passing
│   │   ├── test_inspector_logic.py   # ✅ All passing
│   │   ├── test_property_update_flow.py   # ✅ All passing
│   │   ├── test_renderer_logic.py    # ✅ All passing
│   │   ├── test_tree_adapter.py      # ✅ All passing
│   │   └── test_wizard_logic.py      # ✅ All passing
│   └── conftest.py                   # Shared test fixtures
│
├── docs/                             # Documentation
│   ├── MASTER_PLAN.md                # Architecture (6 layers)
│   ├── ROADMAP.md                    # Implementation phases (updated)
│   ├── API_CONTRACT.md               # REST API specification (NEW)
│   ├── REFACTOR_STRATEGY.md          # Refactoring plan (NEW)
│   ├── PHASE_0_COMPLETE.md           # Phase 0 summary (NEW)
│   └── IMPLEMENTATION_STATUS.md      # Old status (may be deprecated)
│
├── logs/                             # Runtime logs
├── requirements.txt                  # Python dependencies (to be updated)
├── run_app.py                        # DEPRECATED (was Qt launcher)
├── Tallus Tally.code-workspace       # VS Code workspace config
└── README.md                         # Project overview
```

---

## Key Changes from Previous Structure

### ❌ REMOVED
- `backend/ui/qt/` - All Qt Widgets code
  - `main.py` - Qt main window
  - `tree_model.py` - Qt tree model
  - `inspector.py` - Qt inspector widget
  - `wizard.py` - Qt wizard dialog
  - `theme.py` - Qt theme
- `tests/ui/qt/` - All Qt tests
  - `test_main_window.py`
  - `test_tree_model.py`
  - `test_inspector_widget.py`
  - `test_integration.py`
  - `test_persistence_wiring.py`
  - `test_qt_launch.py`

### ✅ KEPT
- `backend/api/` - API layer (still pure Python, no UI)
- `backend/handlers/` - Commands & dispatcher
- `backend/core/` - Domain models
- `backend/infra/` - Infrastructure
- `tests/core/`, `tests/infra/`, `tests/handlers/`, `tests/api/` - Backend tests
- `tests/ui/test_*.py` - Logic tests (not Qt-dependent)

### 🆕 ADDED
- `frontend/` - React application (separate repo)
- `backend/app.py` - Flask/FastAPI server (FUTURE)
- `docs/REFACTOR_STRATEGY.md` - Implementation plan
- `docs/API_CONTRACT.md` - REST API specification
- `docs/PHASE_0_COMPLETE.md` - Phase 0 summary

---

## Architecture Overview

```
┌─────────────────────────────────────┐
│    Frontend (React)                 │  Layer 6: UI
│  Tree | Inspector | Toolbar         │
│  (Separate repo - frontend/)        │
└─────────────────┬───────────────────┘
                  │
         HTTP/REST + WebSocket
                  │
┌─────────────────▼───────────────────┐
│    Flask/FastAPI Server             │  Layer 5: REST API Bridge
│    /api/v1/projects                 │
│    /api/v1/commands                 │
│    /api/v1/graph                    │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│    Python Backend (backend/)        │  Layers 1-4
│  ┌─────────────────────────────────┐│
│  │ Layer 3: API                    ││
│  │ GraphService, ProjectManager    ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ Layer 4: Handlers               ││
│  │ CommandDispatcher, Commands     ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ Layer 2: Infra                  ││
│  │ Persistence, Schemas, Velocity  ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ Layer 1: Core                   ││
│  │ Node, Graph, Blueprint          ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

---

## What Didn't Change

All business logic remains unchanged:
- ✅ Command pattern (undo/redo)
- ✅ Blueprint system
- ✅ Velocity calculation
- ✅ Persistence
- ✅ Template management
- ✅ Indicator system

**Only the UI framework changed:** Qt Widgets → React

---

## Next Steps

1. **Phase 1:** Build Flask API server wrapping Layer 3-4
2. **Phase 2:** Add WebSocket for real-time updates
3. **Phase 3:** Build React frontend using API
4. **Phase 4:** Package as desktop app (Tauri/Electron)

See `REFACTOR_STRATEGY.md` for detailed plan.
