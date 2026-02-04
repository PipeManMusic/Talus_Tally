import pytest
import requests
import yaml
import os
from backend.infra.schema_loader import SchemaLoader

API_URL = "http://localhost:5000/api/v1"

def create_project_and_get_tree():
    # Create a new session and project (adjust as needed for your API)
    resp = requests.post(f"{API_URL}/sessions")
    assert resp.ok, f"Failed to create session: {resp.text}"
    session_id = resp.json()["session_id"]

    # Create a new project (adjust template as needed)
    resp = requests.post(f"{API_URL}/projects", json={
        "session_id": session_id,
        "template_id": "restomod",
        "project_name": "Test Project"
    })
    assert resp.ok, f"Failed to create project: {resp.text}"
    project = resp.json()
    return project["graph"]


def get_node_types_with_status(template_path):
    loader = SchemaLoader()
    blueprint = loader.load(template_path)
    types_with_status = set()
    for node_type in blueprint.node_types:
        props = getattr(node_type, '_extra_props', {}).get('properties', [])
        for prop in props:
            if prop.get('id') == 'status':
                types_with_status.add(node_type.id)
    return types_with_status

def find_nodes_missing_indicators(tree, types_with_status):
    missing = []
    def check_node(node):
        if node.get('blueprint_type_id') in types_with_status:
            if node.get('indicator_id') is None or node.get('indicator_set') is None:
                missing.append(node)
        for child in node.get('children', []):
            check_node(child)
    for root in tree['roots']:
        check_node(root)
    return missing

def test_all_nodes_have_indicators():
    # Use the same template as the backend test setup
    template_path = os.path.join(os.path.dirname(__file__), '../../data/templates/restomod.yaml')
    types_with_status = get_node_types_with_status(template_path)
    tree = create_project_and_get_tree()
    missing = find_nodes_missing_indicators(tree, types_with_status)
    assert not missing, f"Nodes missing indicator_id or indicator_set: {missing}"
