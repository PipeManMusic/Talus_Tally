#!/bin/bash
# Script to build a signed macOS .dmg installer for Talus Tally
# This mirrors the Linux build flow so local and CI builds behave identically.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

PYTHON_BIN="${PYTHON_BIN:-python3}"
NPM_BIN="${NPM_BIN:-npm}"
TAURI_BUNDLES="${TAURI_BUNDLES:-dmg}"

log() {
  echo "[macOS build] $1"
}

ensure_icon() {
  local source_icon="assets/icons/TalusTallyIcon.png"
  local target_icon="frontend/src-tauri/icons/icon.png"
  if [[ -f "$source_icon" ]]; then
    cp "$source_icon" "$target_icon"
  fi
}

log "Building Talus Tally macOS installer"

log "Step 1/3: Installing frontend dependencies"
pushd frontend >/dev/null
$NPM_BIN ci
popd >/dev/null

ensure_icon

log "Step 2/3: Bundling Tauri app"
pushd frontend >/dev/null
npx tauri build --bundles "$TAURI_BUNDLES"
popd >/dev/null

log "Step 3/3: Collecting .dmg artifact"
BUNDLE_DIR="frontend/src-tauri/target/release/bundle/dmg"
if [[ ! -d "$BUNDLE_DIR" ]]; then
  echo "❌ No dmg bundle directory at $BUNDLE_DIR" >&2
  exit 1
fi
LATEST_DMG="$(ls -t "$BUNDLE_DIR"/*.dmg 2>/dev/null | head -n 1 || true)"
if [[ -z "$LATEST_DMG" ]]; then
  echo "❌ No dmg artifact found in $BUNDLE_DIR" >&2
  exit 1
fi
DEST_DIR="build/macos"
mkdir -p "$DEST_DIR"
DEST_PATH="$DEST_DIR/talus-tally-macos.dmg"
cp "$LATEST_DMG" "$DEST_PATH"

log "✅ macOS installer ready: $DEST_PATH"
