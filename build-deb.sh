#!/bin/bash
# Script to build Talus Tally standalone .deb package
# Automates: frontend build, backend build, packaging

set -e

# Check if running inside Docker
if [ ! -f /.dockerenv ]; then
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
    exec docker run --rm \
        -v "$(pwd):/build" \
        -w /build \
        talus-tally-builder \
        bash build-deb.sh
fi

# Inside Docker - proceed with build
echo "🔨 Building Talus Tally..."

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# Configuration
PYTHON_BIN="${PYTHON_BIN:-python3}"
VERSION="0.1.0"
ARCH="amd64"
PACKAGE_DIR="talus-tally_${VERSION}_${ARCH}"

echo "📋 Build Configuration:"
echo "  Version: $VERSION"
echo "  Architecture: $ARCH"
echo "  Python: $PYTHON_BIN"
echo ""

# Step 1: Build frontend
echo "📦 Step 1/4: Building React frontend..."
cd frontend
npm ci  # Install all dependencies (including dev) needed for build
npm run build
cd ..
echo "✅ Frontend built to frontend/dist"

# Step 1.5: Build Tauri desktop app
echo "📦 Step 1.5/4: Building Tauri desktop app..."
cd frontend
if npx tauri build --no-bundle; then
    echo "✅ Tauri app built"
else
    echo "⚠️  Tauri build failed - will use web browser fallback"
fi
cd ..

# Step 2: Build backend
echo "📦 Step 2/4: Building Python backend with PyInstaller..."
"$PYTHON_BIN" -m pip install -q -r requirements.txt
"$PYTHON_BIN" -m pip install -q "pyinstaller>=6.0.0"
"$PYTHON_BIN" -m PyInstaller --clean talus-tally.spec
echo "✅ Backend binary created at dist/talus-tally-backend"

# Step 3: Create .deb package structure
echo "📦 Step 3/4: Creating .deb package structure..."

rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR/DEBIAN"
mkdir -p "$PACKAGE_DIR/usr/bin"
mkdir -p "$PACKAGE_DIR/usr/share/applications"
mkdir -p "$PACKAGE_DIR/usr/share/icons/hicolor/256x256/apps"
mkdir -p "$PACKAGE_DIR/opt/talus-tally"
mkdir -p "$PACKAGE_DIR/opt/talus_tally"

# Copy backend binary
cp dist/talus-tally-backend "$PACKAGE_DIR/opt/talus-tally/"
chmod +x "$PACKAGE_DIR/opt/talus-tally/talus-tally-backend"

# Copy frontend static files
cp -r frontend/dist "$PACKAGE_DIR/opt/talus-tally/"

# Copy data files and assets (templates, indicators, etc)
echo "📁 Copying application data and assets..."
DATA_TARGET="$PACKAGE_DIR/opt/talus_tally/data"
ASSETS_TARGET="$PACKAGE_DIR/opt/talus_tally/assets"
mkdir -p "$DATA_TARGET" "$ASSETS_TARGET"
cp -r data/* "$DATA_TARGET/" 2>/dev/null || true
cp -r assets/* "$ASSETS_TARGET/" 2>/dev/null || true

# Provide legacy path compatibility via symlinks
ln -s ../talus_tally/data "$PACKAGE_DIR/opt/talus-tally/data"
ln -s ../talus_tally/assets "$PACKAGE_DIR/opt/talus-tally/assets"

# Copy Tauri binary if it exists
for tauri_binary in \
    frontend/src-tauri/target/release/talus-tally \
    frontend/src-tauri/target/release/app; do
    if [ -f "$tauri_binary" ]; then
        cp "$tauri_binary" "$PACKAGE_DIR/opt/talus-tally/talus-tally-app"
        chmod +x "$PACKAGE_DIR/opt/talus-tally/talus-tally-app"
        echo "✅ Copied Tauri binary"
        break
    fi
done

# Create launcher script
cat > "$PACKAGE_DIR/usr/bin/talus-tally" << 'LAUNCHER'
#!/bin/bash
# Talus Tally Desktop Launcher
# Starts backend in background, launches Tauri app, cleans up on exit

LOG_FILE="/tmp/talus-tally.log"

echo "[$(date)] Starting Talus Tally backend" >> "$LOG_FILE"

# Start backend in background
/opt/talus-tally/talus-tally-backend >> "$LOG_FILE" 2>&1 &
BACKEND_PID=$!

# Ensure backend PID is cleaned up on exit
cleanup() {
    if kill -0 $BACKEND_PID 2>/dev/null; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    wait $BACKEND_PID 2>/dev/null || true
}
trap cleanup EXIT

# Detect when backend is ready
READY=0
for i in {1..60}; do
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo "Talus Tally backend exited unexpectedly. See $LOG_FILE for details." >&2
        tail -n 40 "$LOG_FILE" >&2
        exit 1
    fi

    if command -v curl >/dev/null 2>&1 && \
       curl -sf http://127.0.0.1:5000/ >/dev/null 2>&1; then
        READY=1
        break
    fi

    sleep 0.5
done

if [ $READY -ne 1 ]; then
    echo "Talus Tally backend did not become ready. See $LOG_FILE for details." >&2
    tail -n 40 "$LOG_FILE" >&2
    exit 1
fi

# Launch Tauri app if available
if [ -f /opt/talus-tally/talus-tally-app ]; then
    exec /opt/talus-tally/talus-tally-app
fi

# Otherwise open in browser if possible
if command -v xdg-open &> /dev/null; then
    echo "Talus Tally desktop binary missing; falling back to browser." >&2
    xdg-open http://127.0.0.1:5000/ >/dev/null 2>&1
fi

# Keep backend running for browser mode
wait $BACKEND_PID
LAUNCHER
chmod +x "$PACKAGE_DIR/usr/bin/talus-tally"

chmod +x "$PACKAGE_DIR/usr/bin/talus-tally"

# Create desktop entry
mkdir -p "$PACKAGE_DIR/usr/share/applications"
mkdir -p "$PACKAGE_DIR/usr/share/icons/hicolor/256x256/apps"

# Copy icon if it exists
if [ -f "assets/icons/TalusTallyIcon.png" ]; then
    cp "assets/icons/TalusTallyIcon.png" "$PACKAGE_DIR/usr/share/icons/hicolor/256x256/apps/talus-tally.png"
fi

cat > "$PACKAGE_DIR/usr/share/applications/talus-tally.desktop" << 'DESKTOP'
[Desktop Entry]
Name=Talus Tally
Comment=Graph-based project management
Exec=talus-tally
Icon=talus-tally
Terminal=false
Type=Application
Categories=Utility;
DESKTOP

# Copy or create icon (if exists)
if [ -f "assets/icons/TalusTallyIcon.png" ]; then
    cp "assets/icons/TalusTallyIcon.png" "$PACKAGE_DIR/usr/share/icons/hicolor/256x256/apps/talus-tally.png"
fi

# Create control file
cat > "$PACKAGE_DIR/DEBIAN/control" << CONTROL
Package: talus-tally
Version: ${VERSION}
Architecture: ${ARCH}
Maintainer: Talus Tally <support@talustown.com>
Description: Graph-based project management and data visualization
Homepage: https://github.com/talus-tally/talus-tally
Depends: libcurl4, libssl3
CONTROL

# Create postinst script for permissions
cat > "$PACKAGE_DIR/DEBIAN/postinst" << 'POSTINST'
#!/bin/bash
chmod +x /opt/talus-tally/talus-tally-backend
chmod +x /usr/bin/talus-tally
update-desktop-database || true
POSTINST
chmod +x "$PACKAGE_DIR/DEBIAN/postinst"

echo "✅ Package structure created"

# Step 4: Build .deb file
echo "📦 Step 4/4: Building .deb package..."
dpkg-deb --build "$PACKAGE_DIR"
echo "✅ Package created: ${PACKAGE_DIR}.deb"

# Verify the package
echo ""
echo "🔍 Package contents:"
dpkg-deb -c "${PACKAGE_DIR}.deb" 2>/dev/null | head -20 || true
echo "..."

echo ""
echo "✨ Build complete!"

# Step 5: Clean up Tauri build artifacts
echo "🧹 Cleaning up Tauri build artifacts..."
rm -rf frontend/src-tauri/target frontend/src-tauri/target/debug frontend/src-tauri/target/release
echo "✅ Tauri build artifacts removed."

# Step 6: Clean up other build artifacts and caches
echo "🧹 Cleaning up other build artifacts and caches..."
rm -rf build/
rm -rf frontend/.pytest_cache/
rm -rf .pytest_cache/
rm -rf talus-tally_0.1.0_amd64/
echo "✅ Other build artifacts and caches removed."

echo "   Package: ${PACKAGE_DIR}.deb"
echo ""
echo "To install locally (testing):"
echo "   sudo apt install ./${PACKAGE_DIR}.deb"
echo ""
echo "To run:"
echo "   talus-tally"
echo ""

