#!/bin/bash
# Talus Tally Backend Startup Script
# Properly launches backend as a daemon process without terminal job control issues

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check for existing backend processes and clean them up
echo "Checking for existing backend processes..."
pkill -9 -f "python.*backend.app" 2>/dev/null || true
sleep 1

# Verify port 5000 is free
if lsof -i :5000 >/dev/null 2>&1; then
    echo "ERROR: Port 5000 is still in use"
    lsof -i :5000
    exit 1
fi

# Start backend as daemon
# - TALUS_DAEMON=1 tells the app to disable the reloader
# - </dev/null detaches stdin to prevent terminal input issues
# - Redirect output to log file
# - & puts it in background
# - disown removes it from job control entirely
echo "Starting backend daemon..."
TALUS_DAEMON=1 .venv/bin/python -m backend.app </dev/null >logs/backend.log 2>&1 &
BACKEND_PID=$!
disown

# Wait a moment and verify it started
sleep 2

if ps -p $BACKEND_PID >/dev/null 2>&1; then
    echo "✓ Backend started successfully (PID: $BACKEND_PID)"
    
    # Check if it's responding
    if curl -s http://localhost:5000/api/v1/health >/dev/null 2>&1; then
        echo "✓ Backend health check passed"
    else
        echo "⚠ Backend started but not responding to health checks yet"
    fi
else
    echo "✗ Backend failed to start - check logs/backend.log"
    tail -20 logs/backend.log
    exit 1
fi
