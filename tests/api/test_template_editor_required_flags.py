from backend.app import create_app


def test_editor_get_template_preserves_person_required_flags():
    app = create_app({"TESTING": True})
    with app.test_client() as client:
        response = client.get('/api/v1/templates/editor/project_talus')
        assert response.status_code == 200, response.get_json()

        template = response.get_json()
        person_node = next((nt for nt in template.get('node_types', []) if nt.get('id') == 'person'), None)
        assert person_node is not None

        person_props = {prop.get('id'): prop for prop in person_node.get('properties', [])}
        assert person_props['email'].get('required') is True
        assert person_props['capacity_monday'].get('required') is True
