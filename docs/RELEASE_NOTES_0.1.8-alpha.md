# Talus Tally 0.1.8-alpha Release Notes

Release date: 2026-03-30  
Release type: Alpha (pre-release)

## Summary

`0.1.8-alpha` is a major stability and data-integrity release. The UUID-based property system introduced in 0.1.7 is now fully harmonized across all views and the backend. Manpower and Agile views receive significant UX improvements including context menus, confirmation prompts, and auto-scroll. Project switching is now safe with a proper save dialog.

## Highlights

### Node Type & Property UUID Migration

- Complete UUID migration for node types and properties across the entire stack
- Feature macros integration for automatic property injection (scheduling, budgeting)
- Property UUID resolution in UpdateProperty handler prevents semantic/UUID key mismatch
- Template reconciliation now restores orphaned properties instead of losing them

### Manpower View Enhancements

- **Context menus**: Right-click on person rows, task sub-rows, or date column headers for targeted Clear/AutoCalc actions
- **Date-filtered operations**: Clear or recalculate allocations for specific dates only
- **Confirmation prompts**: All destructive clear operations now require confirmation
- **Auto-scroll to today**: View automatically scrolls so the current date is the leftmost visible column
- **UUID property harmony**: Allocation reads/writes consistently use UUID keys, preventing dual-key data corruption

### Agile Board Fix

- Releases (and other nodes) no longer disappear from the Done column when their velocity score is zero
- Any node with a status property value now appears on the board regardless of velocity or estimated hours

### Save Safety

- Switching projects or creating a new project with unsaved changes now shows a full Save/Save As/Don't Save/Cancel dialog instead of a basic browser confirm
- The dialog blocks the action until the user makes a choice, fixing a timing bug where the project would switch before the prompt could be acted on

### Inspector & Property Fixes

- Feature macro property collision with user-defined properties is now disambiguated (e.g., agile status vs. user status)
- Filter dropdowns display property labels instead of raw UUIDs
- Blocking relationships correctly display in Inspector
- Velocity score display and refresh after property changes

## Bug Fixes

- Fix chart ResponsiveContainer negative dimensions on project switch
- Fix clear manpower endpoint node lookup (UUID key instead of string)
- Remove unused ID fields from template editor
- Persist lastFilePath to localStorage so Save survives app restart
- Add SIGTERM/SIGINT signal handlers to backend for graceful shutdown

## Version Metadata

- Frontend package: `0.1.8-alpha`
- Tauri config: `0.1.8-alpha`
- Tauri Rust crate: `0.1.8-alpha.1`
- Debian package: `0.1.8~alpha1`

## Notable Commits Included

- `411a220` — feat: manpower context menus, UUID property harmony, save prompts, agile/manpower fixes
- `57ba154` — fix: add SIGTERM/SIGINT signal handlers to backend for graceful shutdown
- `4dd951e` — fix: filter dropdowns show property labels instead of UUIDs
- `31c8782` — fix: clear manpower endpoint node lookup uses UUID key
- `8837661` — fix: remove unused ID fields from template editor
- `3973d9d` — fix: persist lastFilePath to localStorage
- `326a89f` — fix: chart ResponsiveContainer negative dimensions
- `8b679aa` — feat: refresh tool views on project load, add manpower clear & filtered AutoCalc
- `e263263` — fix: restore orphaned properties during template reconciliation
- `ef8f204` — feat: property UUID migration, legacy cleanup, and bug fixes
- `ee1f587` — feat: Node Type UUID migration and feature macros integration

## Upgrade / Build Notes

- Desktop dev: `cd frontend && npm install && npm run desktop:dev`
- Installer build scripts:
  - Linux: `./build-deb.sh`
  - macOS: `./build-macos.sh`
