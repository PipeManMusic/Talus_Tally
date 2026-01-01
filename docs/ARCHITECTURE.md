# Talus Tally: Architecture & Developer Guide

## 🎯 Project Goal
Talus Tally is a **Financial Velocity Project Management System** designed to assist in the restoration of a **Classic Ford Bronco II**. 

It prioritizes tasks based on three factors:
1.  **Hierarchy:** (Structure) What part of the truck is this?
2.  **Financial Velocity:** (Money) High value, low cost items ("Quick Wins").
3.  **Timeline Priority:** (Time) Tasks that **block** other tasks must happen first.

## 🧠 Core Logic: The "Triple-Threat" Algorithm
The `PriorityEngine` (`backend/engine.py`) calculates a score based on:

1.  **Hierarchy Score:** `(SubProject Priority * 100) + (WorkPackage Importance * 10) + Task Importance`
2.  **Financial Velocity:** `(Budget Priority / (Cost + 1))`
    * *Effect:* Cheap, critical items float to the top.
3.  **Dependency Boost (New):** If Task A **blocks** Task B, Task A inherits a score boost.

## 🏗 System Architecture (Evolution 2.0)
The system is evolving into a **Hybrid Desktop/API Application**.

1.  **Data Source:** `data/talus_master.json` (Single Source of Truth).
2.  **Business Logic (The Manager):** `backend/manager.py` (New).
    * **Role:** Centralizes logic (Create, Block, Complete) for API and GUI.
3.  **Interfaces:**
    * **API:** `backend/main.py`
    * **Desktop GUI:** `frontend/` (PySide6)
4.  **Automation:** `backend/translator.py` & `injector.py` update `README.md`.

## 🛠 Developer Workflow: TDD (Red-Green-Refactor)
1.  **RED:** Write test -> Watch fail.
2.  **GREEN:** Write code -> Watch pass.
3.  **REFACTOR:** Clean up.
