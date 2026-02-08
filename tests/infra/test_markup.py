import pytest
from backend.infra.markup import MarkupRegistry, MarkupParser


def test_markup_registry_loads_profile():
    registry = MarkupRegistry()
    profile = registry.load_profile('script_default')

    assert profile['id'] == 'script_default'
    assert isinstance(profile.get('tokens'), list)
    assert len(profile.get('tokens')) > 0


def test_markup_parser_parses_lines():
    registry = MarkupRegistry()
    parser = MarkupParser()

    profile = registry.load_profile('script_default')
    text = "SCENE: Garage\nMIKE: Ready?\n[ACTION] Opens door\nJust a note"

    parsed = parser.parse(text, profile)
    blocks = parsed['blocks']

    assert blocks[0]['type'] == 'scene'
    assert blocks[0]['text'] == 'Garage'

    assert blocks[1]['type'] == 'speaker'
    assert blocks[1]['name'] == 'MIKE'
    assert blocks[1]['text'] == 'Ready?'

    assert blocks[2]['type'] == 'action'
    assert blocks[2]['text'] == 'Opens door'

    assert blocks[3]['type'] == 'text'
    assert blocks[3]['text'] == 'Just a note'
