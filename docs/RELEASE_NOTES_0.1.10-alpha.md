# Talus Tally 0.1.10-alpha Release Notes

Release date: 2026-04-16  
Release type: Alpha (pre-release)

## Summary

`0.1.10-alpha` is a feature release focusing on template editor improvements, export capabilities, Inspector enhancements, and Gantt chart polish. It also includes several bug fixes for template macro handling and UI reliability.

## Features

### Template Editor Overhaul

- Explicit **Save button** replaces auto-save — no more accidental template mutations.
- Full **CRUD operations** for node types and properties within the template editor.
- Template **validation** before save to catch structural issues early.
- **Node type editor** improvements for a smoother editing experience.

### CSV Export

- New **CSV export templates** and improved export engine.
- Included `detailing_task_list.csv.j2` template for generating project manager task lists.

### Inspector Breadcrumb Trail

- Shows the **parent hierarchy** (root › child › … › selected) in the Inspector panel.
- Clicking any ancestor navigates to that node.
- Long paths (>5 levels) are truncated with an ellipsis.

### Gantt Chart Polish

- Bar text labels are now **centered** within bars.
- Text visibility is **scale-aware** — labels appear at zoom levels where the bar is wide enough in pixels, rather than using a fixed percentage threshold.

### Loading & Error Screen

- **Window controls** (close button) added to the loading and backend error screens so the app can be closed if the backend fails to start.

## Fixes

- **Template macro deduplication**: stale fields are refreshed and duplicate properties are merged instead of duplicated.
- **Manpower**: auto-add `is_person` feature to person node types that are missing it.

## Other

- MIT license file and disclosure added to About dialog.

## Version Metadata

- Frontend package: `0.1.10-alpha`
- Tauri config: `0.1.10-alpha`
- Tauri Rust crate: `0.1.10-alpha`
- Debian package: `0.1.10~alpha1`
