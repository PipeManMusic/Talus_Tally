"""
Tests for node_labels in serialized graph responses.

node_labels[prop_id] = [label, ...] is injected by _serialize_graph for every
node_reference typed property, so the UI never has to resolve UUIDs to names.

project_talus schema details used here:
  - person lives under personnel_assets
  - episode lives under season
  - episode.assigned_to (type node_reference) points to person nodes
"""

import json
import pytest
from backend.app import create_app


@pytest.fixture
def client():
    app = create_app({"TESTING": True})
    with app.test_client() as c:
        yield c


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _create_project(client, template_id="project_talus"):
    resp = client.post(
        "/api/v1/projects",
        data=json.dumps({"template_id": template_id, "project_name": "Label Test"}),
        content_type="application/json",
    )
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()


def _execute(client, session_id, command_type, data):
    resp = client.post(
        "/api/v1/commands/execute",
        data=json.dumps({
            "session_id": session_id,
            "command_type": command_type,
            "data": data,
        }),
        content_type="application/json",
    )
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()


def _find_node_type(schema, key):
    """Return the node-type dict whose 'key' field equals *key*."""
    return next((nt for nt in schema["node_types"] if nt.get("key") == key), None)


def _walk_nodes(roots, result=None):
    """Recursively flatten a serialized roots list into {id: node}."""
    if result is None:
        result = {}
    for node in roots:
        result[node["id"]] = node
        _walk_nodes(node.get("children", []), result)
    return result


def _get_schema(client):
    resp = client.get("/api/v1/templates/project_talus/schema")
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()


def _create_node(client, session_id, parent_id, blueprint_type_id):
    """Create one node and return its new id (detected by graph diff)."""
    before = _walk_nodes(
        client.get(f"/api/v1/sessions/{session_id}/graph").get_json()["graph"]["roots"]
    )
    result = _execute(client, session_id, "CreateNode", {
        "parent_id": parent_id,
        "blueprint_type_id": blueprint_type_id,
    })
    after = _walk_nodes(result["graph"]["roots"])
    new_ids = set(after) - set(before)
    assert len(new_ids) == 1, f"Expected 1 new node, got {new_ids}"
    return new_ids.pop()


def _build_episode_and_person(client, session_id, root_id, schema):
    """
    Build the minimal hierarchy for assigned_to tests:
        root -> personnel_assets -> person
        root -> season -> episode

    Returns (person_id, episode_id, assigned_to_prop_id, person_name_prop_id).
    """
    personnel_type = _find_node_type(schema, "personnel_assets")
    person_type = _find_node_type(schema, "person")
    season_type = _find_node_type(schema, "season")
    episode_type = _find_node_type(schema, "episode")

    for t, label in (
        (personnel_type, "personnel_assets"),
        (person_type, "person"),
        (season_type, "season"),
        (episode_type, "episode"),
    ):
        assert t is not None, f"project_talus schema must define '{label}' node type"

    # personnel_assets container
    pa_result = _execute(client, session_id, "CreateNode", {
        "parent_id": root_id,
        "blueprint_type_id": personnel_type["id"],
    })
    pa_nodes = _walk_nodes(pa_result["graph"]["roots"])
    personnel_id = next(
        n["id"] for n in pa_nodes.values()
        if n.get("blueprint_type_id") == personnel_type["id"]
    )

    # person under personnel_assets
    person_id = _create_node(client, session_id, personnel_id, person_type["id"])

    # season under root, then episode under season
    season_id = _create_node(client, session_id, root_id, season_type["id"])
    episode_id = _create_node(client, session_id, season_id, episode_type["id"])

    # resolve property ids from schema
    ep_props = episode_type.get("properties", [])
    assigned_to_prop_id = next(
        p["id"] for p in ep_props if p.get("key") == "assigned_to"
    )

    person_props = person_type.get("properties", [])
    person_name_prop_id = next(
        p["id"] for p in person_props if p.get("key") == "name"
    )

    return person_id, episode_id, assigned_to_prop_id, person_name_prop_id


# ---------------------------------------------------------------------------
# tests
# ---------------------------------------------------------------------------

class TestNodeLabelsAbsent:
    """Nodes without node_reference properties must not emit node_labels."""

    def test_root_node_has_no_node_labels(self, client):
        data = _create_project(client)
        root = data["graph"]["roots"][0]
        assert "node_labels" not in root or root.get("node_labels") == {}


class TestNodeLabelsOnAssignedTo:
    """
    When episode.assigned_to references a named person, the serialized episode
    must carry node_labels[assigned_to_prop_id] = [person_name].
    """

    def test_assigned_to_resolves_to_person_name(self, client):
        proj = _create_project(client, "project_talus")
        session_id = proj["session_id"]
        root_id = proj["graph"]["roots"][0]["id"]
        schema = _get_schema(client)

        person_id, episode_id, assigned_to_prop_id, person_name_prop_id = (
            _build_episode_and_person(client, session_id, root_id, schema)
        )

        # Name the person
        _execute(client, session_id, "UpdateProperty", {
            "node_id": person_id,
            "property_id": person_name_prop_id,
            "old_value": "",
            "new_value": "Alice Test",
        })

        # Assign the person to the episode
        _execute(client, session_id, "UpdateProperty", {
            "node_id": episode_id,
            "property_id": assigned_to_prop_id,
            "old_value": [],
            "new_value": [person_id],
        })

        graph_resp = client.get(f"/api/v1/sessions/{session_id}/graph")
        assert graph_resp.status_code == 200, graph_resp.get_json()
        all_nodes = _walk_nodes(graph_resp.get_json()["graph"]["roots"])

        episode_node = all_nodes.get(episode_id)
        assert episode_node is not None, "episode node must appear in the serialized graph"

        node_labels = episode_node.get("node_labels", {})
        assert assigned_to_prop_id in node_labels, (
            f"node_labels must contain '{assigned_to_prop_id}'; "
            f"got keys: {list(node_labels.keys())}"
        )
        labels = node_labels[assigned_to_prop_id]
        assert isinstance(labels, list)
        assert labels == ["Alice Test"], f"Expected ['Alice Test'] but got {labels}"

    def test_assigned_to_falls_back_to_uuid_when_reference_missing(self, client):
        """If the referenced node does not exist, the raw UUID must be used as label."""
        proj = _create_project(client, "project_talus")
        session_id = proj["session_id"]
        root_id = proj["graph"]["roots"][0]["id"]
        schema = _get_schema(client)

        _person_id, episode_id, assigned_to_prop_id, _name_prop_id = (
            _build_episode_and_person(client, session_id, root_id, schema)
        )
        missing_id = "00000000-0000-0000-0000-000000000000"

        _execute(client, session_id, "UpdateProperty", {
            "node_id": episode_id,
            "property_id": assigned_to_prop_id,
            "old_value": [],
            "new_value": [missing_id],
        })

        graph_resp = client.get(f"/api/v1/sessions/{session_id}/graph")
        all_nodes = _walk_nodes(graph_resp.get_json()["graph"]["roots"])
        episode_node = all_nodes[episode_id]

        labels = episode_node.get("node_labels", {}).get(assigned_to_prop_id, [])
        assert len(labels) == 1
        assert labels[0] == missing_id, (
            f"Expected missing UUID '{missing_id}' as fallback label, got '{labels[0]}'"
        )

    def test_unassigned_episode_omits_assigned_to_from_node_labels(self, client):
        """An episode with no assigned_to value must not emit node_labels for it."""
        proj = _create_project(client, "project_talus")
        session_id = proj["session_id"]
        root_id = proj["graph"]["roots"][0]["id"]
        schema = _get_schema(client)

        _person_id, episode_id, assigned_to_prop_id, _name_prop_id = (
            _build_episode_and_person(client, session_id, root_id, schema)
        )
        # Do NOT call UpdateProperty — assigned_to stays empty

        graph_resp = client.get(f"/api/v1/sessions/{session_id}/graph")
        all_nodes = _walk_nodes(graph_resp.get_json()["graph"]["roots"])
        episode_node = all_nodes[episode_id]

        node_labels = episode_node.get("node_labels", {})
        assert assigned_to_prop_id not in node_labels, (
            "node_labels must not contain assigned_to when no person is assigned"
        )

    def test_assigned_to_falls_back_to_node_name_when_no_properties_name(self, client):
        """When the referenced node exists but has no properties.name set, node.name is used."""
        proj = _create_project(client, "project_talus")
        session_id = proj["session_id"]
        root_id = proj["graph"]["roots"][0]["id"]
        schema = _get_schema(client)

        person_id, episode_id, assigned_to_prop_id, _name_prop_id = (
            _build_episode_and_person(client, session_id, root_id, schema)
        )
        # Deliberately leave properties.name empty — node.name defaults to "New Node"

        _execute(client, session_id, "UpdateProperty", {
            "node_id": episode_id,
            "property_id": assigned_to_prop_id,
            "old_value": [],
            "new_value": [person_id],
        })

        graph_resp = client.get(f"/api/v1/sessions/{session_id}/graph")
        all_nodes = _walk_nodes(graph_resp.get_json()["graph"]["roots"])
        person_node = all_nodes.get(person_id, {})
        expected_label = person_node.get("name") or person_id

        episode_node = all_nodes[episode_id]
        labels = episode_node.get("node_labels", {}).get(assigned_to_prop_id, [])
        assert len(labels) == 1
        assert labels[0] == expected_label, (
            f"Expected node.name '{expected_label}' as intermediate fallback, got '{labels[0]}'"
        )
