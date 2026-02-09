#!/usr/bin/env python3
"""Test the velocity endpoints."""

from backend.app import create_app
import json
from uuid import uuid4

# Create the app
app = create_app()

# Create a test client
client = app.test_client()

# First, create a session
print("Creating test session...")
session_response = client.post('/api/v1/sessions')
print(f"Session response: {session_response.status_code}")
session_data = session_response.get_json()
session_id = session_data['session_id']
print(f"Session ID: {session_id}")

# Test the blocking-graph endpoint with no project loaded
print(f"\nTesting blocking-graph endpoint...")
response = client.get(f'/api/v1/sessions/{session_id}/blocking-graph')
print(f"Status: {response.status_code}")
print(f"Response: {response.get_json()}")

# Test with empty relationships
if response.status_code == 200:
    data = response.get_json()
    print(f"Relationships: {data.get('relationships', [])}")
    print("✓ Blocking-graph endpoint works!")
else:
    print(f"✗ Error: {response.get_json()}")
