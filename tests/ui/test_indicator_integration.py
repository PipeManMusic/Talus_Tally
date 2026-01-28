"""Test indicator system integration with rendering pipeline."""
import os
from backend.infra.schema_loader import SchemaLoader, IndicatorCatalog
from backend.core.graph import ProjectGraph
from backend.core.node import Node
from backend.ui.viewmodels.renderer import TreeViewModel


def test_indicator_catalog_loads():
    """Test that indicator catalog loads successfully."""
    catalog_path = os.path.join(
        os.path.dirname(__file__),
        '../../assets/indicators/catalog.yaml'
    )
    catalog = IndicatorCatalog.load(catalog_path)
    assert "status" in catalog.indicator_sets


def test_schema_loader_initializes_with_catalog():
    """Test that SchemaLoader initializes with indicator catalog."""
    loader = SchemaLoader()
    assert loader.indicator_catalog is not None
    assert "status" in loader.indicator_catalog.indicator_sets


def test_renderer_has_catalog():
    """Test that TreeViewModel can be initialized with catalog."""
    loader = SchemaLoader()
    renderer = TreeViewModel(indicator_catalog=loader.indicator_catalog)
    assert renderer.indicator_catalog is not None


def test_status_option_has_indicator_id():
    """Test that status options in loaded blueprint have indicator_id."""
    loader = SchemaLoader()
    blueprint_path = os.path.join(
        os.path.dirname(__file__),
        '../../data/templates/restomod.yaml'
    )
    blueprint = loader.load(blueprint_path)
    
    # Find task node type
    task_type = None
    for nt in blueprint.node_types:
        if nt.id == "task":
            task_type = nt
            break
    
    assert task_type is not None
    
    # Find status property
    status_prop = None
    properties = task_type._extra_props.get('properties', [])
    for prop in properties:
        if prop.get('id') == 'status':
            status_prop = prop
            break
    
    assert status_prop is not None
    assert 'options' in status_prop
    
    # Verify options have indicator_id
    for option in status_prop['options']:
        assert 'indicator_id' in option
        assert option['indicator_id'] in ['empty', 'partial', 'filled', 'alert']


def test_get_status_indicator_with_svg():
    """Test that renderer can get SVG indicator for a node."""
    loader = SchemaLoader()
    blueprint_path = os.path.join(
        os.path.dirname(__file__),
        '../../data/templates/restomod.yaml'
    )
    blueprint = loader.load(blueprint_path)
    
    # Create a graph with a task node
    graph = ProjectGraph()
    task_node = Node(
        blueprint_type_id="task",
        name="Test Task"
    )
    graph.add_node(task_node)
    
    # Get the task node type definition
    task_type = None
    for nt in blueprint.node_types:
        if nt.id == "task":
            task_type = nt
            break
    
    # Set status to "In Progress"
    first_option = blueprint.node_types[3]._extra_props['properties'][0]['options'][1]
    task_node.properties['status'] = first_option['id']
    
    # Create renderer with catalog
    renderer = TreeViewModel(indicator_catalog=loader.indicator_catalog)
    
    # Get indicator - should be SVG or fallback to bullet
    indicator = renderer.get_status_indicator(task_node, task_type)
    
    # Should return something (either SVG or bullet)
    assert indicator is not None
    assert isinstance(indicator, str)
    assert len(indicator) > 0


def test_display_name_applies_text_styling():
    """Test that display name applies text styling based on indicator."""
    loader = SchemaLoader()
    blueprint_path = os.path.join(
        os.path.dirname(__file__),
        '../../data/templates/restomod.yaml'
    )
    blueprint = loader.load(blueprint_path)
    
    # Create a graph with a task node
    graph = ProjectGraph()
    task_node = Node(
        blueprint_type_id="task",
        name="Test Task"
    )
    graph.add_node(task_node)
    
    # Get the task node type definition
    task_type = None
    for nt in blueprint.node_types:
        if nt.id == "task":
            task_type = nt
            break
    
    # Set status to "Done" (should have strikethrough)
    done_option = blueprint.node_types[3]._extra_props['properties'][0]['options'][3]
    task_node.properties['status'] = done_option['id']
    
    # Create renderer with catalog
    renderer = TreeViewModel(indicator_catalog=loader.indicator_catalog)
    
    # Get display name
    display = renderer.get_display_name(task_node, task_type)
    
    # Should contain strikethrough styling
    assert 'style' in display
    assert 'Test Task' in display


def test_all_indicator_files_exist():
    """Test that all indicator SVG files referenced in catalog exist."""
    loader = SchemaLoader()
    catalog = loader.indicator_catalog
    
    indicator_set = catalog.indicator_sets.get('status', {})
    indicators = indicator_set.get('indicators', [])
    
    for indicator in indicators:
        svg_file = indicator.get('file')
        if svg_file:
            full_path = os.path.join(catalog.catalog_dir, svg_file)
            assert os.path.exists(full_path), f"SVG file not found: {full_path}"


def test_indicator_themes_have_required_colors():
    """Test that all indicator themes have required color properties."""
    loader = SchemaLoader()
    catalog = loader.indicator_catalog
    
    indicator_set = catalog.indicator_sets.get('status', {})
    default_theme = indicator_set.get('default_theme', {})
    
    for indicator_id, theme in default_theme.items():
        assert 'indicator_color' in theme or 'text_color' in theme
        # Verify color format (should be hex)
        for color_key in ['indicator_color', 'text_color']:
            if color_key in theme:
                color = theme[color_key]
                assert color.startswith('#'), f"Invalid color format: {color}"
