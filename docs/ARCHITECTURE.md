python3 -c '
import os
os.makedirs("docs", exist_ok=True)

content = """# Talus Tally: Architecture & Developer Guide

## 🎯 Project Goal
Talus Tally is a **Financial Velocity Project Management System** designed to assist in the restoration of a **Classic Ford Bronco II**. It prioritizes tasks not just by "Importance," but by "Bang for the Buck" (Financial Velocity).

## 🧠 Core Logic: "Financial Velocity"
The heart of the application is the `PriorityEngine` in `backend/engine.py`.
It sorts tasks based on a custom algorithm:
1.  **Hierarchy Score:** Base priority derived from SubProject -> WorkPackage -> Task.
2.  **Velocity Boost:** `(Budget Priority / (Cost + 1))`.
    * *Effect:* High-priority items that are CHEAP float to the top ("Quick Wins").
    * *Effect:* Expensive items require massive importance to outrank cheap ones.

## 🏗 System Architecture
The system follows a **Unidirectional Data Flow**:

1.  **Data Source:** `data/talus_master.json` (The Single Source of Truth).
2.  **API Layer:** `backend/main.py` (FastAPI) reads/writes JSON.
3.  **Translator:** `backend/translator.py` converts the Object Model -> Markdown.
4.  **Injector:** `backend/injector.py` surgically updates `README.md`.
    * **Safety Mechanism:** Uses `` and `` tags.
    * **Constraint:** NEVER overwrites outside these tags.

## 🛠 Developer Workflow

### 1. Running Tests (The "Green State" Check)
Always run the full test suite before committing logic changes.
```bash
pytest