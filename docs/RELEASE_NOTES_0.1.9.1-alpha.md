# Talus Tally 0.1.9.1-alpha Release Notes

Release date: 2026-04-06  
Release type: Alpha hotfix (pre-release)

## Summary

`0.1.9.1-alpha` is a hotfix that restores the `is_person` feature lost during a template editor round-trip, and fixes the reconciliation engine so legacy-keyed properties (like `estimated_cost` and `actual_cost`) are no longer incorrectly orphaned.

## Fixes

### Template Editor Round-Trip Safety

- The `is_person` feature on the person node type was dropped when the template YAML was re-saved with baked-in UUIDs. This caused the manpower engine to find zero people. Feature is now restored and all node-type/property UUIDs are baked into the YAML so future editor round-trips won't regenerate them.

### Legacy-Key Property Orphaning

- The reconciliation engine (`OrphanManager.reconcile_graph_with_template`) previously only recognized UUID keys in its allowed-property set. Properties stored under legacy string IDs (e.g., `estimated_cost`, `actual_cost`) were incorrectly orphaned — affecting 127 nodes with orphaned `estimated_cost` and 111 nodes with orphaned `actual_cost`.
- Reconciliation now accepts both UUID and legacy ID as allowed keys, preventing future orphaning.
- Active properties stored under legacy IDs are automatically re-keyed to their canonical UUID.
- Previously orphaned legacy-keyed properties are restored under the correct UUID key on project load.

## Version Metadata

- Frontend package: `0.1.9.1-alpha`
- Tauri config: `0.1.9.1-alpha`
- Tauri Rust crate: `0.1.9.1-alpha`
- Debian package: `0.1.9.1~alpha1`

## Notable Commits Included

- `a69854c` — fix: restore is_person feature, fix legacy-key orphaning in reconciliation

## Upgrade / Build Notes

- Desktop dev: `cd frontend && npm install && npm run desktop:dev`
- Installer build scripts:
  - Linux: `./build-deb.sh`
  - macOS: `./build-macos.sh`
