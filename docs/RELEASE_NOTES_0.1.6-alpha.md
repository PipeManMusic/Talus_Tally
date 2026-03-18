# Talus Tally 0.1.6-alpha Release Notes

Release date: 2026-03-18  
Release type: Alpha (pre-release)

## Summary

`0.1.6-alpha` focuses on product readiness and UX clarity:

- A full GitHub-facing README rewrite with product-first messaging
- Real UI screenshots added for immediate visual onboarding
- Orphan node/property workflows finalized for safer project recovery
- Inspector readability improvements for orphan/read-only data

## Highlights

### Product Positioning & First Impression

- Replaced the previous technical-heavy README with a concise, sales-oriented overview
- Clarified current platform state (standalone Tauri desktop app)
- Clarified future direction (distributed enterprise web/backend stack)
- Added real screenshots of the main workspace, tree/properties panel, and template editor

### Orphan UX Finalization

- Standardized orphan visuals (warning markers + ghosted style) across views
- Fixed classification so property-orphaned nodes are not treated as fully orphaned node types
- Improved orphaned property visibility in Inspector so preserved data is recoverable
- Improved Inspector contrast for orphan/read-only fields and labels

### Packaging & Release Metadata

- Version metadata aligned for this alpha cut:
  - Frontend package: `0.1.6-alpha`
  - Tauri config: `0.1.6-alpha`
  - Tauri Rust crate: `0.1.6-alpha`
  - Debian package metadata: `0.1.6~alpha1`

## Notable Commits Included

- `c869025` — Finalize orphan UX, inspector readability, and related feature updates
- `9ea0d30` — Rewrite GitHub README with product-first messaging and screenshots
- `5699ae4` — Improve orphaned inspector label contrast

## Upgrade / Build Notes

- Desktop dev: `cd frontend && npm install && npm run desktop:dev`
- Installer build scripts remain:
  - Linux: `./build-deb.sh`
  - macOS: `./build-macos.sh`
  - Windows: `pwsh ./build-windows.ps1`

## Alpha Notice

This is an alpha release intended for early validation and feedback. Behavior, APIs, and packaging details may evolve before stable release.
