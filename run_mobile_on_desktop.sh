#!/bin/bash
set -e

# Ensure we are in the project root
cd "$(dirname "$0")"

# Check if venv exists
if [ ! -d ".venv" ]; then
    echo "Error: .venv directory not found."
    exit 1
fi

# Activate Virtual Environment
source .venv/bin/activate

echo "📱  Launching Mobile Interface on Desktop..."
echo "=========================================="
echo "Note: Resize the window to phone-size to simulate the mobile experience."

# Run the mobile app entry point
export PYTHONPATH=.
python frontend/mobile/app.py
