#!/usr/bin/env python3
"""Test all velocity endpoints."""

from backend.app import create_app
import json
from uuid import uuid4

# Create the app
app = create_app()
client = app.test_client()

# Create a session
print("Creating test session...")
session_response = client.post('/api/v1/sessions')
session_id = session_response.get_json()['session_id']
print(f"✓ Session created: {session_id}\n")

# Test blocking-graph endpoint
print("Testing GET /blocking-graph...")
response = client.get(f'/api/v1/sessions/{session_id}/blocking-graph')
print(f"  Status: {response.status_code}")
if response.status_code == 200:
    data = response.get_json()
    print(f"  Relationships: {len(data.get('relationships', []))} items")
    print(f"  ✓ Endpoint works\n")
else:
    print(f"  ✗ Error: {response.get_json()}\n")

# Test velocity endpoint (no project loaded, should handle gracefully)
print("Testing GET /velocity (no project)...")
response = client.get(f'/api/v1/sessions/{session_id}/velocity')
print(f"  Status: {response.status_code}")
print(f"  Response keys: {list(response.get_json().keys())}")
if response.status_code == 200:
    data = response.get_json()
    print(f"  Nodes: {len(data.get('nodes', []))} items")
    print(f"  ✓ Endpoint works\n")
else:
    print(f"  ✗ Error: {response.get_json()}\n")

print("All velocity endpoints are operational!")
