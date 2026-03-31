#!/bin/bash
# Script to build Talus Tally standalone .deb package
# Automates: frontend build, backend build, packaging

set -euo pipefail

# Check if running inside Docker
if [ "${SKIP_DOCKER:-0}" != "1" ] && [ ! -f /.dockerenv ]; then
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker not found. To guarantee GLIBC compatibility, builds must run in Docker."
        echo "   Install Docker: sudo apt install docker.io"
        exit 1
    fi

    echo "🐳 Building in Docker for GLIBC compatibility..."
    
    export DOCKER_BUILDKIT=1
    docker rmi talus-tally-builder 2>/dev/null || true
    
    echo "Building Docker image..."
    docker buildx build --load -t talus-tally-builder .

    # Run this script inside Docker
    DOCKER_USER_FLAGS=()
    if [ -n "${CI:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ]; then
        echo "🤖 CI detected - running container as root to avoid bind mount permission issues."
        DOCKER_USER_FLAGS=("--user" "0:0")
    else
        echo "👷 Local build detected - mapping host user into container."
        DOCKER_USER_FLAGS=("--user" "$(id -u):$(id -g)")
    fi

    exec docker run --rm \
        "${DOCKER_USER_FLAGS[@]}" \
        -e HOME=/tmp \
        -e CARGO_HOME=/tmp/.cargo \
        -e PATH="/opt/rust/cargo/bin:/tmp/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
        -v "$(pwd):/build" \
        -w /build \
        talus-tally-builder \
        bash build-deb.sh
fi

# Inside Docker - proceed with build
echo "🔨 Building Talus Tally..."

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# Allow npm to retain elevated privileges when running inside Docker; otherwise
# it downgrades to nobody and cannot write to the bind-mounted workspace.
export npm_config_unsafe_perm=true

# ── Version bump ──────────────────────────────────────────────────────
# If TALUS_VERSION is set, update tauri.conf.json before building.
# Usage:  TALUS_VERSION=0.1.4 ./build-deb.sh
if [ -n "${TALUS_VERSION:-}" ]; then
    TAURI_CONF="frontend/src-tauri/tauri.conf.json"
    echo "📌 Setting version to ${TALUS_VERSION} in ${TAURI_CONF}"
    # Use Python (guaranteed present via backend venv) for safe JSON editing
    python3 -c "
import json, sys
conf_path = '${TAURI_CONF}'
with open(conf_path) as f:
    cfg = json.load(f)
cfg['version'] = '${TALUS_VERSION}'
with open(conf_path, 'w') as f:
    json.dump(cfg, f, indent=2)
    f.write('\n')
print(f'  version set to {cfg[\"version\"]}')
"
fi

echo "📦 Step 1/3: Installing frontend dependencies"
pushd frontend >/dev/null
# Remove any host-owned node_modules that the bind mount may carry in,
# which causes EACCES errors when npm ci tries to unlink files.
rm -rf node_modules
npm ci
popd >/dev/null

echo "📦 Step 2/3: Bundling with Tauri (deb)"
pushd frontend >/dev/null
npx tauri build --bundles deb
popd >/dev/null

echo "📦 Step 3/3: Collecting .deb artifact"
DEB_SOURCE=$(ls -t frontend/src-tauri/target/release/bundle/deb/*.deb 2>/dev/null | head -n 1 || true)
if [ -z "$DEB_SOURCE" ]; then
    echo "❌ No .deb artifact found. Check Tauri build output for errors." >&2
    exit 1
fi

# Normalize filename: lowercase + hyphens (Tauri uses productName which may have spaces)
DEB_BASENAME=$(basename "$DEB_SOURCE")
DEB_NORMALIZED=$(echo "$DEB_BASENAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
cp "$DEB_SOURCE" "./$DEB_NORMALIZED"
echo "✅ Debian package copied to $DEB_NORMALIZED"

