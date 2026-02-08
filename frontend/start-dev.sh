#!/bin/bash
# Talus Tally Development Startup Script
# Starts both backend and frontend for desktop development

set -e

# Get to the project root (parent of frontend/)
cd "$(dirname "$0")/.."

# Kill any existing backend processes
echo "Checking for existing backend processes..."
pkill -9 -f "python.*backend.app" 2>/dev/null || true
sleep 1

# Verify port 5000 is free
if lsof -i :5000 >/dev/null 2>&1; then
    echo "ERROR: Port 5000 is still in use"
    lsof -i :5000
    exit 1
fi

# Start backend daemon
echo "Starting backend daemon..."
TALUS_DAEMON=1 .venv/bin/python -m backend.app </dev/null >logs/backend.log 2>&1 &
BACKEND_PID=$!
disown

# Wait and verify backend started
sleep 2

if ! ps -p $BACKEND_PID >/dev/null 2>&1; then
    echo "✗ Backend failed to start - check logs/backend.log"
    tail -20 logs/backend.log
    exit 1
fi

echo "✓ Backend started (PID: $BACKEND_PID)"

# Start Vite dev server (this will stay in foreground)
echo "Starting Vite dev server..."
cd frontend
exec npm run dev
