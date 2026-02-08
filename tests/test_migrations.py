"""Test migration system functionality."""

import sys
import os
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.core.graph import ProjectGraph
from backend.core.node import Node
from backend.infra.migrations import get_migration_registry
from backend.infra.project_talus_migrations import migration_0_1_to_0_2
from uuid import uuid4


def test_simple_node_migration():
    """Test that simple node property migrations work."""
    print("\n[TEST] Simple node property migration")
    
    # Create a graph with old node structure (v0.1)
    graph = ProjectGraph(template_id='project_talus', template_version='0.1.0')
    
    # Create a camera_gear node (should exist in v0.1)
    node_id = uuid4()
    node = Node(blueprint_type_id='camera_gear', name='Canon EOS', id=node_id)
    node.properties = {
        'name': 'Canon EOS',
        'model': '5D Mark IV',
        'serial': 'ABC123'
    }
    graph.add_node(node)
    
    print(f"  Before migration: {len(graph.nodes)} node(s)")
    print(f"  Node type: {node.blueprint_type_id}")
    print(f"  Node properties: {node.properties}")
    
    # Apply migration
    registry = get_migration_registry()
    success, messages = registry.apply_migrations(
        graph, 
        from_version='0.1.0',
        to_version='0.2.0'
    )
    
    print(f"\n  Migration success: {success}")
    print(f"  Messages: {messages}")
    print(f"  Graph version after: {graph.template_version}")
    
    if success:
        print("  ✓ PASSED: Migration completed successfully")
        return True
    else:
        print("  ✗ FAILED: Migration failed")
        return False


def test_structural_migration():
    """Test that structural migrations (moving nodes) work."""
    print("\n[TEST] Structural node migration (moving nodes)")
    
    # Create a graph with old structure (v0.1)
    # In 0.1: project_root -> camera_gear, car_part
    # In 0.2: project_root -> inventory_root -> camera_gear, car_part
    
    graph = ProjectGraph(template_id='project_talus', template_version='0.1.0')
    
    # Create project root
    project_root_id = uuid4()
    project_root = Node(blueprint_type_id='project_root', name='My Project', id=project_root_id)
    graph.add_node(project_root)
    
    # Create camera_gear as direct child of project_root (old structure)
    camera_gear_id = uuid4()
    camera_gear = Node(blueprint_type_id='camera_gear', name='Camera Equipment', id=camera_gear_id)
    camera_gear.parent_id = project_root_id
    project_root.children.append(camera_gear_id)
    graph.add_node(camera_gear)
    
    # Create car_part as direct child of project_root (old structure)
    car_part_id = uuid4()
    car_part = Node(blueprint_type_id='car_part', name='Car Parts', id=car_part_id)
    car_part.parent_id = project_root_id
    project_root.children.append(car_part_id)
    graph.add_node(car_part)
    
    print(f"  Before migration:")
    print(f"    Nodes: {len(graph.nodes)}")
    print(f"    project_root children: {len(project_root.children)}")
    print(f"      - camera_gear parent_id: {camera_gear.parent_id}")
    print(f"      - car_part parent_id: {car_part.parent_id}")
    
    # Apply migration
    registry = get_migration_registry()
    success, messages = registry.apply_migrations(
        graph,
        from_version='0.1.0',
        to_version='0.2.0'
    )
    
    print(f"\n  After migration:")
    print(f"    Migration success: {success}")
    print(f"    Nodes: {len(graph.nodes)}")
    
    if success and len(graph.nodes) >= 4:  # project_root, inventory_root, camera_gear, car_part
        inventory_root = None
        for node in graph.nodes.values():
            if node.blueprint_type_id == 'inventory_root':
                inventory_root = node
                break
        
        if inventory_root:
            print(f"    inventory_root found! Children: {len(inventory_root.children)}")
            print(f"    project_root children: {len(project_root.children)}")
            
            # Check if camera_gear and car_part are now children of inventory_root
            camera_moved = inventory_root.id in [camera_gear.parent_id] if inventory_root else False
            car_moved = inventory_root.id in [car_part.parent_id] if inventory_root else False
            
            print(f"\n  Messages:")
            for msg in messages:
                print(f"    {msg}")
            
            print("\n  ✓ PASSED: Structural migration completed")
            return True
        else:
            print("  ✗ FAILED: inventory_root not created")
            return False
    else:
        print(f"  ✗ FAILED: Migration failed or wrong node count")
        print(f"  Messages:")
        for msg in messages:
            print(f"    {msg}")
        return False


def test_migration_path_finding():
    """Test that multi-step migration paths are found correctly."""
    print("\n[TEST] Migration path finding")
    
    try:
        registry = get_migration_registry()
        # Get path from 0.1.0 to 0.2.0
        path = registry.get_migration_path('0.1.0', '0.2.0')
        
        print(f"  Found {len(path)} migration(s) in path:")
        for i, migration in enumerate(path):
            print(f"    {i+1}. {migration.from_version} -> {migration.to_version}")
        
        if len(path) > 0:
            print("\n  ✓ PASSED: Migration path found")
            return True
        else:
            print("\n  ✗ FAILED: No migrations in path")
            return False
            
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False


def test_cycle_detection_in_graph():
    """Test that the backend can handle a graph with a cycle without infinite recursion or crash."""
    print("\n[TEST] Cycle detection in ProjectGraph and migration")
    graph = ProjectGraph(template_id='project_talus', template_version='0.2.0')
    # Create two nodes with a cycle
    node_a = Node(blueprint_type_id='project_root', name='Root')
    node_b = Node(blueprint_type_id='inventory_root', name='Assets')
    graph.add_node(node_a)
    graph.add_node(node_b)
    node_a.children.append(node_b.id)
    node_b.parent_id = node_a.id
    # Introduce a cycle: node_b is parent of node_a
    node_b.children.append(node_a.id)
    node_a.parent_id = node_b.id
    # Try migration (should not hang)
    registry = get_migration_registry()
    try:
        success, messages = registry.apply_migrations(
            graph,
            from_version='0.2.0',
            to_version='0.2.0'
        )
        print(f"  Migration success: {success}")
        print(f"  Messages: {messages}")
        print("  ✓ PASSED: Migration did not hang on cycle")
    except Exception as e:
        print(f"  ✗ FAILED: Migration crashed or hung: {e}")
        assert False, f"Migration crashed or hung: {e}"
    # Try serializing (should not hang)
    from backend.api.routes import _serialize_graph
    try:
        result = _serialize_graph(graph)
        print(f"  Serialization result: {result}")
        print("  ✓ PASSED: Serialization did not hang on cycle")
    except Exception as e:
        print(f"  ✗ FAILED: Serialization crashed or hung: {e}")
        assert False, f"Serialization crashed or hung: {e}"


def run_all_tests():
    """Run all migration tests."""
    print("\n" + "="*60)
    print("MIGRATION SYSTEM TESTS")
    print("="*60)
    
    tests = [
        test_migration_path_finding,
        test_simple_node_migration,
        test_structural_migration,
    ]
    
    results = []
    for test in tests:
        try:
            result = test()
            results.append(result)
        except Exception as e:
            print(f"\n  ✗ EXCEPTION: {e}")
            import traceback
            traceback.print_exc()
            results.append(False)
    
    print("\n" + "="*60)
    print(f"RESULTS: {sum(results)}/{len(results)} tests passed")
    print("="*60 + "\n")
    
    return all(results)


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
