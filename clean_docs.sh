#!/bin/bash
# Clean and organize documentation for Talus Tally

set -e

mkdir -p docs/archive docs/architecture docs/api docs/guides docs/development

# Move archive files
mv -v PHASE_*.md PHASE_*.txt PROJECT_STATUS*.md PROJECT_STATUS*.txt CHANGES_SUMMARY.md docs/archive/ 2>/dev/null || true
mv -v ROADMAP_CLEAN.md MASTER_PLAN.md PHASE_3_PLAN.md docs/archive/ 2>/dev/null || true

# Move architecture docs
mv -v VELOCITY_SYSTEM_DESIGN.md BACKEND_FORMATTING_ARCHITECTURE.md ARCHITECTURE_STRUCTURED_EDITOR.md docs/architecture/ 2>/dev/null || true

# Move API docs
mv -v API_CONTRACT.md WEBSOCKET_PROTOCOL.md docs/api/ 2>/dev/null || true
mv -v API_CONTRACT.md.old WEBSOCKET_PROTOCOL.md.old docs/api/ 2>/dev/null || true

# Move guides
mv -v ASSET_SYSTEM_GUIDE.md MARKUP_FORMATTING_GUIDE.md COMPONENT_LIBRARY_GUIDE.md INTEGRATION_GUIDE.md docs/guides/ 2>/dev/null || true

# Move development docs
mv -v FRONTEND_QUICK_START.md DEV_ENVIRONMENT.md FRONTEND_TESTING_WORKFLOW.md REFACTOR_STRATEGY.md docs/development/ 2>/dev/null || true
mv -v frontend/README.md docs/development/ 2>/dev/null || true

echo "Documentation cleanup complete."