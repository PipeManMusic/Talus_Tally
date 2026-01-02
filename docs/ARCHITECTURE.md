# Talus Tally - Architecture & Roadmap

## Project Goal
A "Financial Velocity" based project management tool for vehicle restoration, prioritizing tasks by "Bang for Buck."

## 🚀 Current Status: V1.1 (Stable)
The application has reached the V1.1 milestone, delivering a robust set of safety, visual, and workflow features.

### V1.1 Features Delivered
* **Visual Feedback:**
    * **Progress Bars:** Visual completion tracking for Sub-Projects (Tree View) and Global Project (Status Bar).
    * **Cost Tally:** Real-time summary of `Estimated` vs `Actual` costs in the status bar.
    * **Icons:** Standardized UI icons for all actions.
* **Workflow Tools:**
    * **Drag & Drop:** Full support for moving Tasks between Work Packages via mouse interaction.
    * **Shopping List:** Generates a text-based report of all open tasks (`BACKLOG`, `IN_PROGRESS`, `BLOCKED`), grouped by status and summed by cost. Supports export to `.txt`.
    * **Context Menus:** Right-click support for "Complete", "Edit", and "Delete" on all items.
* **Safety & Persistence:**
    * **Git Integration:** Manual "Push to Git" button for version control.
    * **Safety Net:** "Unsaved Changes" confirmation dialog on exit.
    * **Data Integrity:** Immediate save-on-write for critical actions.

## 🔮 V1.2 Roadmap: The Android Expansion
The next phase focuses on mobilizing the application for "Garage Mode"—accessing data while working on the vehicle.

### Strategic Decisions
* **Tech Stack:** **BeeWare (Toga)**.
    * *Rationale:* Allows direct import of the existing `backend/` logic (Manager, Engine, Models) without rewriting in Java/Kotlin/Dart. Maximizes code reuse for a single-developer team.
* **Data Sync:** **FolderSync / Dropsync**.
    * *Rationale:* Maintains the "Local-First" architecture. The Android app will read from a local directory on the phone, which a background utility keeps verified with Dropbox. No complex API authentication required within the app itself.

### Planned Architecture Changes
1.  **Shared Backend:** The `backend/` folder will be packaged as a common library used by both platforms.
2.  **Frontend Split:** (Completed)
    * `frontend/desktop/`: The existing PySide6 application.
    * `frontend/mobile/`: The new Toga application.
3.  **Touch UI:** Mobile interfaces will focus on "Read & Check" (Viewing list, checking off tasks) rather than complex data entry.

## 🧠 Core Logic: The "Triple-Threat" Algorithm
The `PriorityEngine` (`backend/engine.py`) calculates a dynamic score for every task:

1.  **Hierarchy Base:** `(SubProject Priority * 100) + (WorkPackage Importance * 10)`
2.  **Technical Weight:** Added directly from the `Task.importance` (1-10).
3.  **Financial Velocity:** A modifier based on the "Bang for Buck" ratio.
    * *Effect:* A $15 critical repair outranks a $500 cosmetic upgrade.

## 🏗 System Architecture
The system is a **Local-First Application** built on Python 3.13.

### 1. Data Layer (Single Source of Truth)
* **File:** `data/talus_master.json`
* **Schema:** Pydantic V2 Models (`backend/models.py`).
* **Status Enum:** `BACKLOG`, `PENDING`, `IN_PROGRESS`, `BLOCKED`, `COMPLETE`.

### 2. The Backend ("The Brain")
* **Manager (`backend/manager.py`):** Handles CRUD logic and the complex **Move Task** logic (re-parenting objects safely).
* **Engine (`backend/engine.py`):** The mathematical core that sorts the list.
* **Git Manager (`backend/git_manager.py`):** Handles automated commits and pushes to the repository.

### 3. The Frontend ("Control Center")
* **Desktop:** PySide6 (Qt for Python). Optimized for planning, data entry, and file management.
* **Mobile (Planned):** BeeWare (Toga). Optimized for viewing lists and checking off items in the shop.

## 🛠 Developer Workflow: The "Full-Overwrite" Protocol
To eliminate merge conflicts and indentation errors, we utilize a strict **Full-File Overwrite Strategy** paired with automated verification.

### The AI Assistant's Role
1.  **Analysis:** The AI analyzes the request and existing code.
2.  **Generation:** The AI generates the **Complete File Content** for the target file.

### The Developer's Role (You)
1.  **Trigger Edit:** Run `python dev.py edit <filename>`.
2.  **Overwrite:** Select All -> Paste -> Save -> Close.
3.  **Verification:** The `dev.py` script automatically runs the associated test suite.

### Critical Test Harnesses
* **Data Integrity:** `tests/test_persistence.py` (JSON I/O)
* **GUI Logic:** `tests/test_gui.py` (PySide6 Interactions)
* **Complex Interactions:** `tests/test_drag_drop.py` (Verify data consistency after moves)
* **Reporting:** `tests/test_shopping_list.py` (Verify aggregation logic)
* **Safety:** `tests/test_safety.py` (Verify dirty-state handling)

## 📂 Key Directory Structure
```text
Talus Tally/
├── data/
│   └── talus_master.json    # The Database
├── backend/
│   ├── models.py            # Pydantic Schemas
│   ├── manager.py           # CRUD & Move Logic
│   ├── engine.py            # Sorting Math
│   └── git_manager.py       # Git Automation
├── frontend/
│   └── app.py               # GUI Entry Point (DragDropTree, ShoppingListDialog)
├── tests/
│   ├── test_gui.py          # Interface Tests
│   ├── test_drag_drop.py    # Drag & Drop Logic
│   ├── test_shopping_list.py# Shopping List Logic
│   └── test_persistence.py  # CRITICAL: Database I/O Verification
└── docs/
    └── ARCHITECTURE.md      # This File