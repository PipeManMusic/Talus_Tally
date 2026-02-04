# Use Ubuntu 22.04 LTS for GLib 2.72 (required by Tauri >= 2.70)
# Backend is built separately with older GLIBC compatibility
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install all build dependencies in one layer to reduce size
# Complete set for Tauri + PyInstaller builds on Ubuntu 22.04
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    python3-dev \
    python3-pip \
    dpkg-dev \
    debhelper \
    fakeroot \
    curl \
    ca-certificates \
    build-essential \
    pkg-config \
    libssl-dev \
    libgtk-3-dev \
    libglib2.0-dev \
    libwebkit2gtk-4.1-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    git \
    libsoup-3.0-dev \
    libjavascriptcoregtk-4.1-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 from NodeSource (Ubuntu 20.04 apt repos have ancient npm)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Rust with pre-built toolchain (faster than building from source)
# Use 1.85.0+ to support edition2024 feature for Tauri dependencies
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"
# Set PKG_CONFIG_PATH to include system libraries for Tauri builds
ENV PKG_CONFIG_PATH="/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig"
# Pre-download common Rust dependencies for faster builds
RUN cargo install cargo-watch --locked 2>/dev/null || true

# Set working directory and environment variables for build optimization
WORKDIR /build
ENV PYTHON_BIN=python3
ENV CARGO_PROFILE_RELEASE_OPT_LEVEL=3
ENV CARGO_PROFILE_RELEASE_LTO=true
ENV CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1
ENV RUSTFLAGS="-C target-cpu=generic"

# Build script will be mounted here
CMD ["/bin/bash"]
