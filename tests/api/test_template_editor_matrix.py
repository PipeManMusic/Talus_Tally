import copy
from itertools import product

import pytest

from backend.app import create_app
from backend.core.template_service import TemplateService
from backend.infra.schema_loader import SchemaLoader
from backend.infra.template_persistence import TemplatePersistence


SHAPES = [None, 'rounded', 'roundedSquare', 'circle', 'hexagon']
FEATURE_COMBINATIONS = [
    [],
    ['scheduling'],
    ['budgeting'],
    ['scheduling', 'budgeting'],
]
VELOCITY_VARIANTS = [
    None,
    {'baseScore': 1},
    {'scoreMode': 'inherit'},
    {'baseScore': 3, 'scoreMode': 'standalone'},
]


@pytest.fixture
def editor_client(tmp_path, monkeypatch):
    import backend.infra.settings as settings_mod

    old_cache = settings_mod._cache
    monkeypatch.setenv('TALUS_BLUEPRINT_TEMPLATES_DIR', str(tmp_path))
    settings_mod._cache = dict(settings_mod._DEFAULT_SETTINGS)

    app = create_app({'TESTING': True})
    try:
        with app.test_client() as client:
            yield client, tmp_path
    finally:
        settings_mod._cache = old_cache


def _meta_schema():
    return TemplateService().get_meta_schema()


def _base_node_types():
    return [
        {
            'id': 'root',
            'label': 'Root',
            'allowed_children': ['work_item'],
            'properties': [
                {
                    'id': 'name',
                    'label': 'Name',
                    'type': 'text',
                    'required': True,
                }
            ],
        },
        {
            'id': 'child_item',
            'label': 'Child Item',
            'allowed_children': [],
            'properties': [
                {
                    'id': 'name',
                    'label': 'Name',
                    'type': 'text',
                    'required': True,
                }
            ],
        },
        {
            'id': 'asset_leaf',
            'label': 'Asset Leaf',
            'base_type': 'asset',
            'allowed_children': [],
            'properties': [
                {
                    'id': 'name',
                    'label': 'Name',
                    'type': 'text',
                    'required': True,
                }
            ],
        },
    ]


def _canonical_status_property():
    return {
        'id': 'status',
        'label': 'Status',
        'type': 'select',
        'indicator_set': 'status',
        'options': [
            {'name': 'Not Started', 'indicator_id': 'empty'},
            {'name': 'In Progress', 'indicator_id': 'partial'},
            {'name': 'Done', 'indicator_id': 'filled'},
        ],
    }


def _work_item_node(overrides=None):
    node = {
        'id': 'work_item',
        'label': 'Work Item',
        'allowed_children': [],
        'properties': [
            {
                'id': 'name',
                'label': 'Name',
                'type': 'text',
                'required': True,
            },
            _canonical_status_property(),
        ],
        'primary_status_property_id': 'status',
    }
    if overrides:
        node.update(overrides)
    return node


def _build_template_payload(template_id: str, work_item_overrides=None):
    return {
        'id': template_id,
        'name': f'Template {template_id}',
        'version': '0.1.0',
        'description': f'Generated template {template_id}',
        'node_types': [
            *_base_node_types(),
            _work_item_node(work_item_overrides),
        ],
    }


def _property_variants(property_type_id: str):
    if property_type_id == 'text':
        return [('text', {'id': 'custom_field', 'label': 'Custom Field', 'type': 'text', 'required': True})]
    if property_type_id == 'number':
        return [('number', {'id': 'estimate', 'label': 'Estimate', 'type': 'number', 'description': 'Hours estimate'})]
    if property_type_id == 'currency':
        return [('currency', {'id': 'cost', 'label': 'Cost', 'type': 'currency'})]
    if property_type_id == 'checkbox':
        return [('checkbox', {'id': 'approved', 'label': 'Approved', 'type': 'checkbox'})]
    if property_type_id == 'date':
        return [('date', {'id': 'due_date', 'label': 'Due Date', 'type': 'date'})]
    if property_type_id == 'select':
        return [
            (
                'select_basic',
                {
                    'id': 'phase',
                    'label': 'Phase',
                    'type': 'select',
                    'indicator_set': 'status',
                    'options': [
                        {'name': 'Queued', 'indicator_id': 'empty'},
                        {'name': 'Complete', 'indicator_id': 'filled'},
                    ],
                },
            ),
            (
                'select_velocity',
                {
                    'id': 'priority_state',
                    'label': 'Priority State',
                    'type': 'select',
                    'indicator_set': 'status',
                    'options': [
                        {'name': 'Low', 'indicator_id': 'empty'},
                        {'name': 'High', 'indicator_id': 'alert'},
                    ],
                    'velocityConfig': {
                        'enabled': True,
                        'mode': 'status',
                        'statusScores': {'Low': 1, 'High': 5},
                    },
                },
            ),
        ]
    if property_type_id == 'node_reference':
        return [
            ('node_reference', {'id': 'linked_asset', 'label': 'Linked Asset', 'type': 'node_reference'}),
            ('node_reference_typed', {'id': 'owner', 'label': 'Owner', 'type': 'node_reference', 'target_type': 'asset_leaf'}),
        ]
    if property_type_id == 'editor':
        return [('editor', {'id': 'notes', 'label': 'Notes', 'type': 'editor', 'markup_profile': 'plain_text'})]

    return [(property_type_id, {'id': f'{property_type_id}_field', 'label': property_type_id.title(), 'type': property_type_id})]


def _assert_template_round_trip(client, templates_dir, payload, case_id):
    create_response = client.post('/api/v1/templates/editor', json=payload)
    assert create_response.status_code == 201, f'{case_id}: create failed {create_response.get_json()}'

    get_response = client.get(f"/api/v1/templates/editor/{payload['id']}")
    assert get_response.status_code == 200, f'{case_id}: get failed {get_response.get_json()}'

    template_data = get_response.get_json()
    validate_response = client.post(f"/api/v1/templates/editor/{payload['id']}/validate", json=template_data)
    assert validate_response.status_code == 200, f'{case_id}: validate request failed {validate_response.get_json()}'
    assert validate_response.get_json()['is_valid'] is True, f'{case_id}: validate failed {validate_response.get_json()}'

    persistence = TemplatePersistence(templates_dir=str(templates_dir))
    stored_template = persistence.load_template(payload['id'])
    assert persistence.validate_template(stored_template) == [], f'{case_id}: stored template invalid'

    loader = SchemaLoader()
    blueprint = loader.load(f"{payload['id']}.yaml")
    assert blueprint.get_node_type('work_item') is not None, f'{case_id}: work_item missing after load'


def test_template_editor_property_type_matrix_round_trips(editor_client):
    client, templates_dir = editor_client
    meta_schema = _meta_schema()
    property_type_ids = [entry['id'] for entry in meta_schema.get('property_types', [])]

    failures = []
    for property_type_id in property_type_ids:
        for variant_name, property_def in _property_variants(property_type_id):
            template_id = f'matrix_prop_{property_type_id}_{variant_name}'
            payload = _build_template_payload(
                template_id,
                work_item_overrides={
                    'properties': [
                        {
                            'id': 'name',
                            'label': 'Name',
                            'type': 'text',
                            'required': True,
                        },
                        property_def,
                    ],
                },
            )
            try:
                _assert_template_round_trip(client, templates_dir, payload, template_id)
            except AssertionError as exc:
                failures.append(str(exc))

    assert not failures, '\n'.join(failures)


def test_template_editor_node_visual_option_matrix_round_trips(editor_client):
    client, templates_dir = editor_client
    meta_schema = _meta_schema()
    node_class_ids = [entry['id'] for entry in meta_schema.get('node_classes', [])]

    failures = []
    for index, (base_type, shape, icon_enabled, color_enabled) in enumerate(
        product(node_class_ids, SHAPES, [False, True], [False, True])
    ):
        template_id = f'matrix_visual_{index}'
        work_item_overrides = {
            'base_type': base_type,
            'shape': shape,
            'icon': 'film' if icon_enabled else None,
            'color': '#60a5fa' if color_enabled else None,
        }
        payload = _build_template_payload(template_id, work_item_overrides=work_item_overrides)
        try:
            _assert_template_round_trip(client, templates_dir, payload, template_id)
        except AssertionError as exc:
            failures.append(str(exc))

    assert not failures, '\n'.join(failures)


def test_template_editor_node_behavior_option_matrix_round_trips(editor_client):
    client, templates_dir = editor_client

    failures = []
    for index, (features, velocity_config, allows_children, filters_assets) in enumerate(
        product(FEATURE_COMBINATIONS, VELOCITY_VARIANTS, [False, True], [False, True])
    ):
        work_item_overrides = {
            'features': copy.deepcopy(features),
            'velocityConfig': copy.deepcopy(velocity_config),
            'allowed_children': ['child_item'] if allows_children else [],
            'allowed_asset_types': ['asset_leaf'] if filters_assets else [],
            'properties': [
                {
                    'id': 'name',
                    'label': 'Name',
                    'type': 'text',
                    'required': True,
                },
                _canonical_status_property(),
            ],
            'primary_status_property_id': 'status',
        }
        template_id = f'matrix_behavior_{index}'
        payload = _build_template_payload(template_id, work_item_overrides=work_item_overrides)
        try:
            _assert_template_round_trip(client, templates_dir, payload, template_id)
        except AssertionError as exc:
            failures.append(str(exc))

    assert not failures, '\n'.join(failures)