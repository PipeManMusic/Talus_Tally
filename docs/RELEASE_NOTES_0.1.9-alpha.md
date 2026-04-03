# Talus Tally 0.1.9-alpha Release Notes

Release date: 2026-04-03  
Release type: Alpha (pre-release)

## Summary

`0.1.9-alpha` introduces the full Gantt chart view with interactive drag-and-resize scheduling, fixes status initialization across the board, and eliminates all transparency-caused color inconsistencies in the Manpower view.

## Highlights

### Gantt Chart View

- **Full interactive Gantt chart**: Tasks render as horizontal bars on a date-indexed grid with proper day/week/month headers
- **Drag scheduling**: Click and drag task bars to move start/end dates in real time
- **Resize handles**: Grab left or right edges to adjust individual start or end dates
- **Inspector sync**: Dragging or resizing a task in the Gantt view immediately updates the Inspector panel via the graph store
- **Scheduling gate**: Tasks without valid date ranges are gracefully excluded rather than crashing the view

### Status Initialization & AgileView Fix

- **Robust status backfill**: Nodes missing a status property now get a correct default assigned on load, preventing blank Agile columns
- **AgileView column placement**: Status-bearing nodes reliably land in the correct column after initialization, fixing cases where nodes appeared unsorted or missing

### ManpowerView Solid Backgrounds

- All transparent/opacity-based backgrounds (`bg-status-warning/60`, `bg-emerald-500/60`, etc.) replaced with pre-computed solid hex colors
- Capacity column and date cells now show identical colors for the same allocation status
- Legend swatches, status badges, error bar, today column header, and selection highlights all use consistent solid backgrounds
- Eliminates visual artifacts where the same status appeared as different colors depending on parent element background

### CI Improvements

- GitHub Actions workflow now auto-creates a GitHub Release with build artifacts when a version tag is pushed

## Bug Fixes

- Fix Gantt drag/resize not propagating date changes to Inspector panel
- Fix status property not initialized for nodes loaded from older project files
- Fix AgileView columns not reflecting correct status after project load
- Fix ManpowerView colors appearing different due to CSS opacity blending on varying backgrounds
- Fix orphan prevention during node scheduling operations

## Version Metadata

- Frontend package: `0.1.9-alpha`
- Tauri config: `0.1.9-alpha`
- Tauri Rust crate: `0.1.9-alpha`
- Debian package: `0.1.9~alpha1`

## Notable Commits Included

- `fc4209c` — fix: replace all transparent backgrounds with solid hex colors in ManpowerView
- `2e2ae69` — fix: Gantt drag/resize now updates inspector via graph store
- `52f1912` — fix: robust status initialization, backfill, and AgileView column placement
- `a253e6c` — feat: full Gantt view, scheduling gate, status color fix, orphan prevention
- `dfb83cb` — ci: auto-create GitHub Release with artifacts on tag push

## Upgrade / Build Notes

- Desktop dev: `cd frontend && npm install && npm run desktop:dev`
- Installer build scripts:
  - Linux: `./build-deb.sh`
  - macOS: `./build-macos.sh`
