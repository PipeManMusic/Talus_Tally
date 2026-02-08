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
TAURI_BUILD_LOG="../.tauri-build.log"
rm -f "$TAURI_BUILD_LOG"
if npx tauri build --bundles none > "$TAURI_BUILD_LOG" 2>&1; then
    tail -20 "$TAURI_BUILD_LOG"
    echo "✅ Tauri app built"
else
    tail -20 "$TAURI_BUILD_LOG"
    echo "⚠️  Tauri build failed - will use web browser fallback"
fi
rm -f "$TAURI_BUILD_LOG"
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

# Copy backend binary
cp dist/talus-tally-backend "$PACKAGE_DIR/opt/talus-tally/"
chmod +x "$PACKAGE_DIR/opt/talus-tally/talus-tally-backend"

# Copy frontend static files
cp -r frontend/dist "$PACKAGE_DIR/opt/talus-tally/"

# Copy data files and assets (templates, indicators, etc)
echo "📁 Copying application data and assets..."
mkdir -p "$PACKAGE_DIR/opt/talus-tally/data"
mkdir -p "$PACKAGE_DIR/opt/talus-tally/assets"
cp -r data/* "$PACKAGE_DIR/opt/talus-tally/data/" 2>/dev/null || true
cp -r assets/* "$PACKAGE_DIR/opt/talus-tally/assets/" 2>/dev/null || true

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

# Start backend in background
/opt/talus-tally/talus-tally-backend > /tmp/talus-tally.log 2>&1 &
BACKEND_PID=$!

# Trap to cleanup on exit
cleanup() {
    kill $BACKEND_PID 2>/dev/null || true
    wait $BACKEND_PID 2>/dev/null || true
}
trap cleanup EXIT

# Wait for backend to start
for i in {1..30}; do
    if curl -s http://127.0.0.1:5000/ > /dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

# Launch Tauri app if available
if [ -f /opt/talus-tally/talus-tally-app ]; then
    exec /opt/talus-tally/talus-tally-app
# Otherwise open in browser
elif command -v xdg-open &> /dev/null; then
    xdg-open http://127.0.0.1:5000/
    # Keep backend running
    wait $BACKEND_PID
else
    # Fallback: just keep backend running
    wait $BACKEND_PID
fi
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
dpkg-deb -c "${PACKAGE_DIR}.deb" | head -20
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
rm -rf frontend/node_modules/
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

