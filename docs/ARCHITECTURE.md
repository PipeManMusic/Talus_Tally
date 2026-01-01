# Talus Tally: Architecture & Developer Guide (V1.1)

## 🎯 Project Goal
Talus Tally is a **Financial Velocity Project Management System** designed to optimize the restoration of a **Classic Ford Bronco II**. 

It serves as a "Force Multiplier" for decision-making by floating "Quick Wins" (High Value / Low Cost) to the top of the roadmap automatically.

## 🧠 Core Logic: The "Triple-Threat" Algorithm
The `PriorityEngine` (`backend/engine.py`) calculates a dynamic score for every task:

1.  **Hierarchy Base:** `(SubProject Priority * 100) + (WorkPackage Importance * 10)`
2.  **Technical Weight:** Added directly from the `Task.importance` (1-10).
3.  **Financial Velocity:** A modifier based on the "Bang for Buck" ratio.
    * *Effect:* A $15 critical repair outranks a $500 cosmetic upgrade.

## 🏗 System Architecture (V1.0 Release)
The system is a **Local-First Desktop Application** built on Python 3.13.

### 1. Data Layer (Single Source of Truth)
* **File:** `data/talus_master.json`
* **Schema:** Pydantic V2 Models (`backend/models.py`).
* **Persistence:** The app saves state immediately upon **Adding**, **Completing**, or **Sorting** tasks.

### 2. The Backend ("The Brain")
* **Manager (`backend/manager.py`):** Handles logic for Creating tasks, Completing tasks, and managing dependencies.
* **Engine (`backend/engine.py`):** The mathematical core that sorts the list. It is stateless and pure (Input Project -> Output Sorted List).

### 3. The Frontend ("Control Center")
* **Framework:** PySide6 (Qt for Python).
* **Main Window (`frontend/app.py`):**
    * **Tree View:** Hierarchical display of SubProjects -> WorkPackages -> Tasks.
    * **Smart Selectors:** Dropdowns that map semantic English ("Safety / Critical") to Math (10).
    * **Context Menus:** Right-click support for "Mark Complete".
    * **Velocity Sort:** A toolbar button that triggers the Engine and **saves** the optimized order to disk.

## 🛠 Developer Workflow: Strict TDD
We follow a strict **Test-Driven Development** cycle using `pytest` and `pytest-qt`.

1.  **RED:** Write a test in `tests/` that defines desired behavior (e.g., "Sort button saves order").
2.  **GREEN:** Implement the minimum code in `frontend/` or `backend/` to pass the test.
3.  **REFACTOR:** Clean up code while keeping tests green.

## 📂 Key Directory Structure
```text
Talus Tally/
├── data/
│   └── talus_master.json    # The Database
├── backend/
│   ├── models.py            # Pydantic Schemas
│   ├── manager.py           # CRUD Logic
│   └── engine.py            # Sorting Math
├── frontend/
│   └── app.py               # GUI Entry Point
├── tests/
│   ├── test_gui.py          # Interface Tests
│   ├── test_manager.py      # Logic Tests
│   └── test_persistence.py  # File I/O Tests
└── ARCHITECTURE.md          # This File