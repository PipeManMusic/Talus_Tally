#!/bin/bash
set -e  # Exit on error

# Ensure we are in the project root
cd "$(dirname "$0")"

# Check if venv exists
if [ ! -d ".venv" ]; then
    echo "Error: .venv directory not found."
    exit 1
fi

# Activate Virtual Environment
source .venv/bin/activate

echo "🚀  Talus Tally Mobile Deployment Helper"
echo "========================================"

# Check if briefcase is installed
if ! command -v briefcase &> /dev/null; then
    echo "Installing Briefcase..."
    pip install briefcase
fi

echo "📱  Creating Android App..."
briefcase create android

echo "🔨  Building Android App..."
briefcase build android

echo "▶️   Running in Emulator..."
briefcase run android
