# Frontend Testing & Debugging Workflow

## Goals
- Make frontend bugs as easy to catch and fix as backend bugs.
- Eliminate manual UI hunting/pecking for state issues.
- Ensure all tree/expansion/allowed_children logic is covered by automated tests.
- Provide actionable diagnostics in CI and local dev.

## Workflow Overview

### 1. Unit & Integration Tests (Jest + React Testing Library)
- **Test all core logic**: tree conversion, allowed_children, expansion state, etc.
- **Test rendering**: Sidebar/TreeItem render correct buttons, labels, and expansion for given props.
- **Test edge cases**: empty trees, missing allowed_children, root node transitions, etc.
- **Mock API and store**: No backend or UI needed for most tests.

### 2. E2E Tests (Playwright)
- **Test user flows**: project creation, adding children, UI expansion, etc.
- **Assert DOM state**: Use test IDs and custom markers for tree/expansion/allowed_children.
- **On failure**: Dump relevant DOM and state to output for diagnosis.

### 3. Dev-Only Diagnostics
- **Debug Panel**: Shows live tree, expandedMap, and node props in the UI (dev only).
- **Structured logging**: Use a logging utility that can be inspected in tests.
- **Error boundaries/UI warnings**: Show visible errors for critical state issues.

### 4. CI Integration
- Run all unit, integration, and E2E tests on every PR.
- Fail builds on any regression or unhandled error.

## Implementation Plan
1. Refactor tree/expansion logic into pure functions (exported from a utils file).
2. Write Jest tests for these functions (tree conversion, allowed_children, expansion logic).
3. Refactor Sidebar/TreeItem to use test IDs and expose key state for testing.
4. Add a dev-only Debug Panel to the UI.
5. Enhance Playwright tests to assert on DOM markers and dump state on failure.
6. Add error boundaries and UI warnings for critical state issues.

---

This workflow will make the frontend as robust and testable as the backend, with fast feedback and actionable diagnostics for every bug or regression.
