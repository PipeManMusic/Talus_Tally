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

# Create non-root builder user and workspace mountpoint
RUN useradd -m builder
RUN mkdir -p /build && chown -R builder:builder /build
ENV CARGO_HOME="/home/builder/.cargo"
ENV RUSTUP_HOME="/home/builder/.rustup"
ENV PATH="${CARGO_HOME}/bin:${PATH}"
USER builder
WORKDIR /build
# Install Rust inside the builder user's home for proper permissions
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
# Set PKG_CONFIG_PATH to include system libraries for Tauri builds
ENV PKG_CONFIG_PATH="/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig"
# Pre-download common Rust dependencies for faster builds
RUN cargo install cargo-watch --locked 2>/dev/null || true
ENV PYTHON_BIN=python3
ENV CARGO_PROFILE_RELEASE_OPT_LEVEL=3
ENV CARGO_PROFILE_RELEASE_LTO=true
ENV CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1
ENV RUSTFLAGS="-C target-cpu=generic"

# Build script will be mounted here
CMD ["/bin/bash"]
