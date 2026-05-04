# Talus Tally 0.1.11-alpha Release Notes

**Release Date:** May 4, 2026
**Type:** Alpha
**Status:** Pre-release

## Overview

`0.1.11-alpha` introduces **Node Templates** — reusable subtree definitions that can be saved in a project and instantiated anywhere in the tree where their root type is allowed. This release also lands a large amount of in-progress UX work: multi-select with copy/paste, Agile and Manpower views, CSV upsert, a filter store, breadcrumb-driven Inspector navigation, and a spreadsheet editor for batch edits.

## Highlights

### Node Templates (new)

- **Backend**: `NodeTemplate` / `NodeTemplateNode` dataclasses with validation; four commands (Create, Update, Delete, Instantiate) wired through the dispatcher; `GET /sessions/<id>/node-templates` (with optional `?parent_type=<uuid>` filter); session storage and project-file hydration.
- **Frontend**: full-window editor (Tools → Node Templates) styled to match the Template Editor (TitleBar, dark theme, accent buttons, split-pane). Templates persist inside the project file under `node_templates`.
- **TreeView**: right-click context menu now shows an **Insert Template** section listing only templates whose root type is in the parent's `allowed_children`.

### Other UX work

- **Multi-select + copy/paste** in TreeView with new e2e specs.
- **Agile View** and **Manpower View** completed; tab visibility preferences via new `uiPrefsStore`.
- **CSV upsert** mode in the Import CSV dialog plus `UnblockedStatusPrompt`.
- **Filter store / FilterBar** with engine improvements; **Inspector breadcrumbs** for clickable parent navigation.
- **Spreadsheet Editor Modal** for batch property edits.
- **Settings dialog** polish and template-editor normalization helpers.

### Bug fixes

- Creating node templates failed with `NodeTemplate requires id, name, and root` — client now generates a UUID before the request.
- Project root types could not be used as a node-template root — `rootCandidateTypes` now returns all node types.
- `ReferenceError: Cannot access uninitialized variable` at project open caused by a TDZ capture in the `openProject` callback.

## Versions

- Frontend package: `0.1.11-alpha`
- Tauri config: `0.1.11-alpha`
- Tauri Rust crate: `0.1.11-alpha`
- Debian package: `0.1.11~alpha-1`

## Test Coverage

- Backend: 539 passed, 1 skipped
- Frontend (vitest): 278 passed
