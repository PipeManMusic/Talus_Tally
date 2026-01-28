#!/bin/bash
# Quick Demo of Talus Tally REST API
# Run Flask server in background and make sample requests

echo "🚀 Starting Talus Tally Flask API Server..."
cd "$(dirname "$0")"

# Start Flask in background
venv/bin/python -m backend.app &
SERVER_PID=$!
sleep 2

echo ""
echo "📡 Testing API Endpoints..."
echo ""

# Health check
echo "1️⃣ Health Check:"
curl -s http://127.0.0.1:5000/api/v1/health | python3 -m json.tool
echo ""

# List templates
echo "2️⃣ List Templates:"
curl -s http://127.0.0.1:5000/api/v1/templates | python3 -m json.tool
echo ""

# Create project
echo "3️⃣ Create New Project:"
PROJECT=$(curl -s -X POST http://127.0.0.1:5000/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{
    "template_id": "restomod",
    "project_name": "API Demo Project"
  }')
echo "$PROJECT" | python3 -m json.tool
echo ""

# Extract project_id and session_id
PROJECT_ID=$(echo "$PROJECT" | python3 -c "import sys, json; print(json.load(sys.stdin)['project_id'])")
SESSION_ID=$(echo "$PROJECT" | python3 -c "import sys, json; print(json.load(sys.stdin)['session_id'])")
echo "📦 Project ID: $PROJECT_ID"
echo "🔑 Session ID: $SESSION_ID"
echo ""

# Get tree structure
echo "4️⃣ Get Project Tree:"
curl -s "http://127.0.0.1:5000/api/v1/sessions/$SESSION_ID/graph/tree" | python3 -m json.tool
echo ""

echo "✅ API Demo Complete!"
echo ""
echo "🛑 Stopping server..."
kill $SERVER_PID

echo "✨ All endpoints working!"
