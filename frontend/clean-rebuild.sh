#!/bin/bash
# Clean build artifacts and restart dev environment

cd "$(dirname "$0")"

echo "Stopping any running backend processes..."
pkill -9 -f "python.*backend" 2>/dev/null || true

echo "Cleaning Tauri build artifacts..."
cd src-tauri
cargo clean
cd ..

echo "Removing node_modules/.vite cache..."
rm -rf node_modules/.vite

echo "Ready to start fresh. Run: npm run desktop:dev"
