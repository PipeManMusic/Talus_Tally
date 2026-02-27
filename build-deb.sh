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
        echo "👷 Local build detected - using builder user inside the container."
    fi

    exec docker run --rm \
        "${DOCKER_USER_FLAGS[@]}" \
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

echo "📦 Step 1/3: Installing frontend dependencies"
pushd frontend >/dev/null
npm ci
popd >/dev/null

# Ensure correct icon is used for Tauri build
if [ -f assets/icons/TalusTallyIcon.png ]; then
    cp assets/icons/TalusTallyIcon.png frontend/src-tauri/icons/icon.png
fi

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

cp "$DEB_SOURCE" .
echo "✅ Debian package copied to $(basename "$DEB_SOURCE")"

