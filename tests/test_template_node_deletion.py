import pytest
import yaml
from pathlib import Path
from backend.infra.template_persistence import TemplatePersistence

def test_node_type_deletion(tmp_path):
    # Setup: Copy a template file to a temp location
    orig_path = Path('data/templates/project_talus.yaml')
    temp_templates_dir = tmp_path / 'templates'
    temp_templates_dir.mkdir()
    temp_template_path = temp_templates_dir / 'project_talus.yaml'
    temp_template_path.write_text(orig_path.read_text())

    persistence = TemplatePersistence(str(temp_templates_dir))
    template = persistence.load_template('project_talus')
    assert 'node_types' in template
    orig_count = len(template['node_types'])
    # Remove a node type
    deleted_id = 'camera_gear_inventory'
    node_types = [nt for nt in template['node_types'] if nt['id'] != deleted_id]
    # Remove references in allowed_children
    for nt in node_types:
        if 'allowed_children' in nt:
            nt['allowed_children'] = [cid for cid in nt['allowed_children'] if cid != deleted_id]
    template['node_types'] = node_types
    persistence.save_template(template)
    # Reload and check
    updated = persistence.load_template('project_talus')
    ids = [nt['id'] for nt in updated['node_types']]
    assert deleted_id not in ids
    assert len(updated['node_types']) == orig_count - 1
    persistence.save_template(template)
    # Reload and check
    updated = persistence.load_template('project_talus')
    ids = [nt['id'] for nt in updated['node_types']]
    assert 'camera_gear_inventory' not in ids
    assert len(updated['node_types']) == orig_count - 1
