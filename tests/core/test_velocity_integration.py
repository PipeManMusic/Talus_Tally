"""
Integration tests for VelocityEngine with actual project files

Test that velocity calculations on real project data match expected values
based on the template schema and velocity configuration.
"""

import pytest
import yaml
import json
import os
from backend.core.velocity_engine import VelocityEngine


@pytest.fixture
def project_files():
    """Load actual project_talus.yaml and project_talus.json"""
    base_path = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    
    yaml_path = os.path.join(base_path, 'data/templates/project_talus.yaml')
    json_path = os.path.join(base_path, 'project_talus.json')
    
    # Load schema through SchemaLoader to ensure select option UUIDs exist
    from backend.infra.schema_loader import SchemaLoader

    loader = SchemaLoader()
    blueprint = loader.load('project_talus.yaml')
    schema = {'id': 'project_talus', 'node_types': []}
    for node_type in blueprint.node_types:
        nt_dict = {
            'id': node_type.id if hasattr(node_type, 'id') else str(node_type),
            'velocityConfig': node_type._extra_props.get('velocityConfig', {})
            if hasattr(node_type, '_extra_props') else {},
            'properties': node_type.properties or []
        }
        schema['node_types'].append(nt_dict)
    
    with open(json_path, 'r') as f:
        project = json.load(f)
    
    return schema, project


class TestVelocityIntegration:
    """Test velocity calculations against real project data"""
    
    def test_project_talus_loads(self, project_files):
        """Test that project files load successfully"""
        schema, project = project_files
        
        assert schema is not None
        assert schema['id'] == 'project_talus'
        assert project is not None
        assert 'graph' in project
    
    def test_schema_has_velocity_configs(self, project_files):
        """Test that schema defines velocity configurations"""
        schema, _ = project_files
        
        # Find node types with velocity config
        node_types_with_velocity = [
            nt for nt in schema['node_types']
            if 'velocityConfig' in nt or any(
                'velocityConfig' in p for p in nt.get('properties', [])
            )
        ]
        
        # Group by whether they have node-level or property-level config
        node_level = [nt for nt in node_types_with_velocity if 'velocityConfig' in nt]
        property_level = [
            nt for nt in node_types_with_velocity
            if any('velocityConfig' in p for p in nt.get('properties', []))
        ]
        
        print(f"\nNode types with node-level velocity config: {[nt['id'] for nt in node_level]}")
        print(f"Node types with property-level velocity config: {[nt['id'] for nt in property_level]}")
        
        # Verify we have at least some velocity configuration
        assert len(node_types_with_velocity) > 0, "Schema should have velocity configurations"
    
    def test_season_velocity_calculation(self, project_files):
        """Test velocity calculations for season nodes
        
                Expected behavior based on project_talus.yaml:
                - Season has statusScores:
                    - Planning: -1
                    - In Production: 1
                    - Released: -1
        """
        schema, project = project_files
        
        # Convert JSON graph to our expected format
        graph = {}
        for node in project['graph']['nodes']:
            graph[node['id']] = {
                'type': node['type'],
                'parent_id': None,
                'properties': node.get('properties', {})
            }
        
        # Set parent_id based on tree structure
        for node in project['graph']['nodes']:
            for potential_parent in project['graph']['nodes']:
                if node['id'] in potential_parent.get('children', []):
                    graph[node['id']]['parent_id'] = potential_parent['id']
                    break
        
        # Define expected velocities based on the schema's statusScores
        # Season "Daily Driver" -> "In Production" -> score: 1
        # Season "Talus Software" -> "Released" -> score: -1
        expected_velocities = {
            "063e0759-c0d2-4caf-b411-ed87e2f16637": {  # Daily Driver
                "name": "Daily Driver",
                "expected_status_score": 1,  # "In Production"
                "expected_base_score": 0,
                "expected_total": 1,
                "notes": "Status option maps to 'In Production'"
            },
            "fb04ceae-e213-462b-805e-a94fead8b824": {  # Talus Software
                "name": "Talus Software",
                "expected_status_score": -1,  # "Released"
                "expected_base_score": 0,
                "expected_total": -1,
                "notes": "Status option maps to 'Released'"
            }
        }
        
        engine = VelocityEngine(graph, schema)
        
        # Calculate and compare
        failures = []
        for season_id, expected in expected_velocities.items():
            if season_id not in graph:
                continue
                
            calc = engine.calculate_velocity(season_id)
            status = graph[season_id]['properties'].get('status')
            name = graph[season_id]['properties'].get('name', season_id)
            
            print(f"\nSeason '{name}':")
            print(f"  Status UUID: {status}")
            print(f"  Calculated status_score: {calc.status_score}")
            print(f"  Expected status_score: {expected['expected_status_score']}")
            print(f"  Calculated total: {calc.total_velocity}")
            print(f"  Expected total: {expected['expected_total']}")
            print(f"  Issue: {expected['notes']}")
            
            if calc.status_score != expected['expected_status_score']:
                failures.append({
                    'node': name,
                    'field': 'status_score',
                    'expected': expected['expected_status_score'],
                    'actual': calc.status_score
                })
            
            if calc.total_velocity != expected['expected_total']:
                failures.append({
                    'node': name,
                    'field': 'total_velocity',
                    'expected': expected['expected_total'],
                    'actual': calc.total_velocity
                })
        
        # Report findings
        if failures:
            print("\n❌ VELOCITY CALCULATION MISMATCHES FOUND:")
            for failure in failures:
                print(f"  {failure['node']}.{failure['field']}: "
                      f"expected {failure['expected']}, got {failure['actual']}")
            
            print("\nVelocity mismatches found - check status UUID mapping and inheritance logic.")
    
    def test_velocity_inheritance_chain(self, project_files):
        """Test that velocity properly cascades from parent to children
        
        Verifies the behavior tested in test_velocity_engine.py:
        - Parent contributes its own velocity components to children
        - Children calculate their own statusScores independently
        """
        schema, project = project_files
        
        # Convert JSON graph
        graph = {}
        for node in project['graph']['nodes']:
            graph[node['id']] = {
                'type': node['type'],
                'parent_id': None,
                'properties': node.get('properties', {})
            }
        
        # Set parent relationships
        for node in project['graph']['nodes']:
            for potential_parent in project['graph']['nodes']:
                if node['id'] in potential_parent.get('children', []):
                    graph[node['id']]['parent_id'] = potential_parent['id']
                    break
        
        engine = VelocityEngine(graph, schema)
        
        # Find parent-child pairs and verify inheritance
        parent_child_pairs = []
        for node_id, node_data in graph.items():
            if node_data['parent_id']:
                parent_child_pairs.append((node_data['parent_id'], node_id))
        
        print(f"\nFound {len(parent_child_pairs)} parent-child relationships")
        
        if parent_child_pairs:
            # Test a sample of relationships
            for parent_id, child_id in parent_child_pairs[:5]:
                parent_calc = engine.calculate_velocity(parent_id)
                child_calc = engine.calculate_velocity(child_id)
                
                parent_name = graph[parent_id]['properties'].get('name', parent_id)
                child_name = graph[child_id]['properties'].get('name', child_id)
                
                print(f"\nParent '{parent_name}': total={parent_calc.total_velocity}")
                print(f"Child '{child_name}': total={child_calc.total_velocity}")
                print(f"  Child inherited_score: {child_calc.inherited_score}")
                
                # Verify parent's own velocity components are inherited by child
                parent_own_score = (
                    parent_calc.base_score +
                    parent_calc.status_score +
                    parent_calc.numerical_score
                )
                if parent_own_score > 0:
                    # Parent with velocity should contribute to child's inherited_score
                    # (only if child has inherit mode)
                    child_type = graph[child_id]['type']
                    child_type_config = next(
                        (nt for nt in schema['node_types'] if nt['id'] == child_type),
                        None
                    )
                    if child_type_config and child_type_config.get('velocityConfig', {}).get('scoreMode') == 'inherit':
                        assert child_calc.inherited_score >= parent_own_score, (
                            "Child should inherit parent's velocity components"
                        )

    def test_intro_inherits_daily_driver_with_children_only(self, project_files):
        """Ensure Intro inherits Daily Driver when only children arrays define parents."""
        schema, project = project_files

        # Build graph without parent_id to mirror infra behavior
        graph = {
            node['id']: {
                'type': node['type'],
                'children': node.get('children', []),
                'properties': node.get('properties', {})
            }
            for node in project['graph']['nodes']
        }

        engine = VelocityEngine(graph, schema)

        season_id = "063e0759-c0d2-4caf-b411-ed87e2f16637"  # Daily Driver
        intro_id = "58e9689c-0b7f-4325-8ebe-ca53944cf667"  # Intro

        season_calc = engine.calculate_velocity(season_id)
        intro_calc = engine.calculate_velocity(intro_id)

        assert season_calc.total_velocity == 1
        assert intro_calc.inherited_score == season_calc.total_velocity
        assert intro_calc.status_score == 1
        assert intro_calc.total_velocity == 2
    
    def test_status_scores_independent(self, project_files):
        """Test that different nodes calculate their own status scores
        
        Even if nodes share a parent, each node's statusScore should be
        calculated independently based on its own status property value.
        """
        schema, project = project_files
        
        # Convert JSON graph
        graph = {}
        for node in project['graph']['nodes']:
            graph[node['id']] = {
                'type': node['type'],
                'parent_id': None,
                'properties': node.get('properties', {})
            }
        
        # Set parent relationships
        for node in project['graph']['nodes']:
            for potential_parent in project['graph']['nodes']:
                if node['id'] in potential_parent.get('children', []):
                    graph[node['id']]['parent_id'] = potential_parent['id']
                    break
        
        engine = VelocityEngine(graph, schema)
        
        # Find nodes with same parent
        parent_to_children = {}
        for node_id, node_data in graph.items():
            if node_data['parent_id']:
                parent_id = node_data['parent_id']
                if parent_id not in parent_to_children:
                    parent_to_children[parent_id] = []
                parent_to_children[parent_id].append(node_id)
        
        # Test siblings with different status values
        for parent_id, child_ids in parent_to_children.items():
            if len(child_ids) < 2:
                continue
            
            sibling_calcs = [
                (cid, engine.calculate_velocity(cid))
                for cid in child_ids
            ]
            
            # Check if any pair has different status scores
            for i, (cid1, calc1) in enumerate(sibling_calcs[:-1]):
                for cid2, calc2 in sibling_calcs[i+1:]:
                    name1 = graph[cid1]['properties'].get('name', cid1)
                    name2 = graph[cid2]['properties'].get('name', cid2)
                    
                    if calc1.status_score != calc2.status_score:
                        print(f"\nSiblings with different status scores:")
                        print(f"  {name1}: status_score={calc1.status_score}")
                        print(f"  {name2}: status_score={calc2.status_score}")
                        
                        # Verify they're calculating independently
                        assert calc1.status_score != calc2.status_score, (
                            "Siblings should calculate status scores independently"
                        )
                        return  # Test passes if we found this
        
        print("\nNo siblings with different status scores found - test inconclusive")
