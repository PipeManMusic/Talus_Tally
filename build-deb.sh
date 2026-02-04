#!/bin/bash
# Script to create a standalone .deb package for Talus Tally using PyInstaller

set -e

# Check if we're running inside Docker or if Docker is available
if [ ! -f /.dockerenv ]; then
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker not found. To guarantee compatibility on all systems, builds must run in Docker."
        echo "   Install Docker first: sudo apt install docker.io"
        exit 1
    fi

    echo "🐳 Building in Docker for GLIBC compatibility..."

    # Ensure Docker buildx is installed
    if ! docker buildx version &> /dev/null; then
        echo "📦 Installing Docker buildx..."
        mkdir -p ~/.docker/cli-plugins
        BUILDX_VERSION=$(curl -s https://api.github.com/repos/docker/buildx/releases/latest | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/')
        curl -sL "https://github.com/docker/buildx/releases/download/v${BUILDX_VERSION}/buildx-v${BUILDX_VERSION}.linux-amd64" -o ~/.docker/cli-plugins/docker-buildx
        chmod +x ~/.docker/cli-plugins/docker-buildx
        echo "✅ Docker buildx installed"
    fi

    # Enable BuildKit for faster, more efficient builds
    export DOCKER_BUILDKIT=1

    # Always rebuild Docker image to ensure latest dependencies
    echo "Rebuilding Docker image with latest dependencies..."
    docker rmi talus-tally-builder 2>/dev/null || true
    
    # Build Docker image with buildx
    echo "Building Docker image..."
    docker buildx build --load -t talus-tally-builder .

    # Run this script inside Docker
    exec docker run --rm \
        -v "$(pwd):/build" \
        -w /build \
        talus-tally-builder \
        bash build-deb.sh
fi

# Proceed with build
echo "🔨 Building Talus Tally standalone package..."

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "🔨 Building Tauri application..."
cd frontend

# Build with timeout (45 minutes) and better error handling
if timeout 2700 npm run desktop:build 2>&1; then
    echo "✅ Tauri build succeeded"
else
    BUILD_EXIT=$?
    if [ $BUILD_EXIT -eq 124 ]; then
        echo "⚠️  Tauri build timeout after 45 minutes - continuing with backend-only build"
    else
        echo "⚠️  Tauri build failed with exit code $BUILD_EXIT - continuing with backend-only build"
    fi
fi
cd ..

echo "📦 Building standalone backend with PyInstaller..."
PYTHON_BIN="${PYTHON_BIN:-python3}"

# Install app dependencies and pyinstaller in the selected Python environment
"$PYTHON_BIN" -m pip install -r requirements.txt
"$PYTHON_BIN" -m pip install "pyinstaller>=6.0.0"

# Build standalone executable
"$PYTHON_BIN" -m PyInstaller --clean talus-tally.spec

echo "📦 Creating Debian package structure..."

# Create package directory
PACKAGE_DIR="talus-tally_0.1.0_amd64"
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR/DEBIAN"
mkdir -p "$PACKAGE_DIR/usr/bin"
mkdir -p "$PACKAGE_DIR/usr/share/applications"
mkdir -p "$PACKAGE_DIR/usr/share/icons/hicolor/256x256/apps"
mkdir -p "$PACKAGE_DIR/usr/share/icons/hicolor/scalable/apps"
mkdir -p "$PACKAGE_DIR/opt/talus-tally"

# Copy standalone backend executable
echo "📁 Copying standalone backend..."
if [ -f "dist/talus-tally-backend" ]; then
    cp dist/talus-tally-backend "$PACKAGE_DIR/opt/talus-tally/"
    chmod +x "$PACKAGE_DIR/opt/talus-tally/talus-tally-backend"
else
    echo "❌ PyInstaller build failed - backend executable not found"
    exit 1
fi

# Copy Tauri application (prefer AppImage for bundled dependencies)
echo "🖥️ Copying Tauri application..."
TAURI_BINARY=""
TAURI_APPIMAGE=""

for candidate in \
    frontend/src-tauri/target/release/bundle/appimage/*.AppImage; do
    if [ -f "$candidate" ]; then
        TAURI_APPIMAGE="$candidate"
        break
    fi
done

if [ -n "$TAURI_APPIMAGE" ]; then
    cp "$TAURI_APPIMAGE" "$PACKAGE_DIR/opt/talus-tally/talus-tally.AppImage"
    chmod +x "$PACKAGE_DIR/opt/talus-tally/talus-tally.AppImage"
elif [ -f "frontend/src-tauri/target/release/talus-tally" ]; then
    TAURI_BINARY="frontend/src-tauri/target/release/talus-tally"
elif [ -f "frontend/src-tauri/target/release/app" ]; then
    TAURI_BINARY="frontend/src-tauri/target/release/app"
fi

if [ -n "$TAURI_APPIMAGE" ]; then
    # Create launcher that starts both backend and AppImage frontend
    cat > "$PACKAGE_DIR/usr/bin/talus-tally" << 'EOF'
#!/bin/bash
# Start backend in background
/opt/talus-tally/talus-tally-backend &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 2

# Start frontend (AppImage bundles dependencies)
/opt/talus-tally/talus-tally.AppImage --appimage-extract-and-run

# Cleanup: kill backend when frontend exits
kill $BACKEND_PID 2>/dev/null || true
EOF
    chmod +x "$PACKAGE_DIR/usr/bin/talus-tally"

    # Also provide explicit launcher for desktop entry detection
    cp "$PACKAGE_DIR/usr/bin/talus-tally" "$PACKAGE_DIR/usr/bin/talus-tally-launcher"
    chmod +x "$PACKAGE_DIR/usr/bin/talus-tally-launcher"
elif [ -n "$TAURI_BINARY" ]; then
    cp "$TAURI_BINARY" "$PACKAGE_DIR/usr/bin/talus-tally"
    chmod +x "$PACKAGE_DIR/usr/bin/talus-tally"
    
    # Create launcher that starts both backend and frontend
    cat > "$PACKAGE_DIR/usr/bin/talus-tally-launcher" << 'EOF'
#!/bin/bash
# Start backend in background
/opt/talus-tally/talus-tally-backend &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 2

# Start frontend
if [ -f /opt/talus-tally/talus-tally.AppImage ]; then
    /opt/talus-tally/talus-tally.AppImage --appimage-extract-and-run
else
    /usr/bin/talus-tally
fi

# Cleanup: kill backend when frontend exits
kill $BACKEND_PID 2>/dev/null || true
EOF
    chmod +x "$PACKAGE_DIR/usr/bin/talus-tally-launcher"
else
    echo "⚠️  Tauri binary not found - creating backend-only launcher"
    cat > "$PACKAGE_DIR/usr/bin/talus-tally" << 'EOF'
#!/bin/bash
exec /opt/talus-tally/talus-tally-backend
EOF
    chmod +x "$PACKAGE_DIR/usr/bin/talus-tally"
fi

# Copy icons
echo "🎨 Copying application icons..."
cp assets/icons/TalusTallyIcon.png "$PACKAGE_DIR/usr/share/icons/hicolor/256x256/apps/talus-tally.png"
cp assets/icons/TalusTallyIcon.svg "$PACKAGE_DIR/usr/share/icons/hicolor/scalable/apps/talus-tally.svg"

# Create desktop entry
echo "🖥️ Creating desktop entry..."
EXEC_CMD="/usr/bin/talus-tally"
if [ -f "$PACKAGE_DIR/usr/bin/talus-tally-launcher" ]; then
    EXEC_CMD="/usr/bin/talus-tally-launcher"
fi

cat > "$PACKAGE_DIR/usr/share/applications/talus-tally.desktop" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Talus Tally
Comment=Production workflow and asset tracker
Exec=$EXEC_CMD
Icon=talus-tally
Terminal=false
Categories=Office;ProjectManagement;
EOF

# Create DEBIAN control file
echo "📋 Creating package metadata..."
cat > "$PACKAGE_DIR/DEBIAN/control" << EOF
Package: talus-tally
Version: 0.1.0
Section: utils
Priority: optional
Architecture: amd64
Maintainer: Daniel Worth <your-email@example.com>
Description: Talus Tally - Production Workflow Tracker
 A standalone hierarchical project management and asset tracking application.
 All dependencies are bundled - no Python or other runtime required.
EOF

# Create postinst script
cat > "$PACKAGE_DIR/DEBIAN/postinst" << 'EOF'
#!/bin/bash
set -e
update-desktop-database || true
gtk-update-icon-cache /usr/share/icons/hicolor/ || true
exit 0
EOF
chmod +x "$PACKAGE_DIR/DEBIAN/postinst"

# Create changelog
mkdir -p "$PACKAGE_DIR/DEBIAN"
cat > "$PACKAGE_DIR/DEBIAN/changelog.gz" << EOF
talus-tally (0.1.0) stable; urgency=low

  * Initial alpha release
  * Standalone executable with all dependencies bundled
  * React/Tauri desktop frontend
  * Flask/SocketIO backend
  * YAML-based workflow templates

 -- Daniel Worth <your-email@example.com>  $(date -R)
EOF

# Build the .deb package
echo "🔨 Building .deb package..."
dpkg-deb --build "$PACKAGE_DIR"

echo "✅ Standalone package created: talus-tally_0.1.0_amd64.deb"
ls -lh talus-tally_0.1.0_amd64.deb

if [ ! -f /.dockerenv ] && ! command -v docker &> /dev/null; then
    echo ""
    echo "⚠️  NOTE: Package was built with GLIBC $(ldd --version | head -1 | awk '{print $NF}')"
    echo "   For better compatibility with older systems (like Chromebooks),"
    echo "   install Docker and rebuild: sudo apt install docker.io"
fi

echo ""
echo "📦 Package contents:"
echo "   - Standalone backend: /opt/talus-tally/talus-tally-backend (no Python needed)"
echo "   - Tauri frontend: /usr/bin/talus-tally"
echo "   - Desktop launcher: talus-tally in application menu"
