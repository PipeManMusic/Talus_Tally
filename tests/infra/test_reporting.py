import pytest
from backend.core.node import Node
# This import will fail until you write backend/infra/reporting.py
from backend.infra.reporting import ReportEngine

def test_render_template():
    """Phase 3.4: Verify Jinja2 rendering."""
    node = Node(blueprint_type_id="task", name="Report Task")
    node.properties = {"status": "Done"}
    
    template = "Status of {{ node.name }}: {{ node.properties.status }}"
    
    engine = ReportEngine()
    result = engine.render_string(template, context={"node": node})
    
    assert result == "Status of Report Task: Done"


def test_parse_markup_filter():
    engine = ReportEngine()
    template = "{{ parse_markup(text, 'script_default').blocks[0].type }}"
    result = engine.render_string(template, context={"text": "SCENE: Garage"})

    assert result == "scene"