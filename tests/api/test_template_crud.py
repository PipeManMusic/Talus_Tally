"""
Tests for Template CRUD operations (Template Editor backend)

Phase 3.6: Template Editor Tool
"""

import pytest
import json
import tempfile
from pathlib import Path
from backend.infra.template_persistence import TemplatePersistence
from backend.infra.schema_loader import SchemaLoader


class TestTemplatePersistence:
    """Tests for loading and saving templates from/to disk."""
    
    def test_list_templates(self):
        """Should list all available templates from data/templates/."""
        persistence = TemplatePersistence()
        templates = persistence.list_templates()
        
        # Should have at least project_talus template
        assert isinstance(templates, list)
        assert len(templates) > 0
        assert any(t['id'] == 'project_talus' for t in templates)
    
    def test_list_templates_contains_metadata(self):
        """Template metadata should include id, name, version, description."""
        persistence = TemplatePersistence()
        templates = persistence.list_templates()
        
        project_talus = next(t for t in templates if t['id'] == 'project_talus')
        assert 'id' in project_talus
        assert 'name' in project_talus
        assert 'version' in project_talus
        assert 'description' in project_talus
    
    def test_load_template(self):
        """Should load a template by ID."""
        persistence = TemplatePersistence()
        template = persistence.load_template('project_talus')
        
        assert template is not None
        assert template['id'] == 'project_talus'
        assert 'node_types' in template
        assert len(template['node_types']) > 0
    
    def test_load_nonexistent_template_raises_error(self):
        """Loading a nonexistent template should raise FileNotFoundError."""
        persistence = TemplatePersistence()
        
        with pytest.raises(FileNotFoundError):
            persistence.load_template('nonexistent_template_xyz')
    
    def test_save_template_new(self, tmp_path):
        """Should save a new template to disk."""
        persistence = TemplatePersistence(templates_dir=str(tmp_path))
        
        template_data = {
            'id': 'test_template',
            'name': 'Test Template',
            'version': '0.1.0',
            'description': 'A test template',
            'node_types': [
                {
                    'id': 'root',
                    'label': 'Root',
                    'allowed_children': [],
                    'properties': [
                        {
                            'id': 'name',
                            'label': 'Name',
                            'type': 'text',
                            'required': True
                        }
                    ]
                }
            ]
        }
        
        persistence.save_template(template_data)
        
        # File should exist
        template_file = tmp_path / 'test_template.yaml'
        assert template_file.exists()
        
        # Load it back and verify
        loaded = persistence.load_template('test_template')
        assert loaded['id'] == 'test_template'
        assert loaded['name'] == 'Test Template'
    
    def test_save_template_overwrites_existing(self, tmp_path):
        """Saving a template with existing ID should overwrite it."""
        persistence = TemplatePersistence(templates_dir=str(tmp_path))
        
        template_v1 = {
            'id': 'test_template',
            'name': 'Test Template v1',
            'version': '0.1.0',
            'description': 'Version 1',
            'node_types': [
                {
                    'id': 'root',
                    'label': 'Root',
                    'allowed_children': [],
                    'properties': []
                }
            ]
        }
        
        template_v2 = {
            'id': 'test_template',
            'name': 'Test Template v2',
            'version': '0.2.0',
            'description': 'Version 2',
            'node_types': [
                {
                    'id': 'root',
                    'label': 'Root',
                    'allowed_children': [],
                    'properties': []
                }
            ]
        }
        
        persistence.save_template(template_v1)
        persistence.save_template(template_v2)
        
        loaded = persistence.load_template('test_template')
        assert loaded['name'] == 'Test Template v2'
        assert loaded['version'] == '0.2.0'
    
    def test_validate_template_valid(self):
        """Should validate a valid template."""
        persistence = TemplatePersistence()
        template = persistence.load_template('project_talus')
        
        errors = persistence.validate_template(template)
        assert errors == []
    
    def test_validate_template_missing_required_fields(self):
        """Should report errors for missing required fields."""
        persistence = TemplatePersistence()
        
        invalid_template = {
            # Missing id, name, version
            'description': 'Missing required fields',
            'node_types': []
        }
        
        errors = persistence.validate_template(invalid_template)
        assert len(errors) > 0
        assert any('id' in e.lower() for e in errors)
        assert any('name' in e.lower() for e in errors)
        assert any('version' in e.lower() for e in errors)
    
    def test_validate_template_invalid_node_type(self):
        """Should report errors for invalid node types."""
        persistence = TemplatePersistence()
        
        invalid_template = {
            'id': 'test',
            'name': 'Test',
            'version': '0.1.0',
            'description': 'Test',
            'node_types': [
                {
                    # Missing id, label, properties
                    'allowed_children': []
                }
            ]
        }
        
        errors = persistence.validate_template(invalid_template)
        assert len(errors) > 0
        assert any('node_type' in e.lower() or 'id' in e.lower() for e in errors)
    
    def test_validate_template_invalid_property(self):
        """Should report errors for invalid properties."""
        persistence = TemplatePersistence()
        
        invalid_template = {
            'id': 'test',
            'name': 'Test',
            'version': '0.1.0',
            'description': 'Test',
            'node_types': [
                {
                    'id': 'root',
                    'label': 'Root',
                    'allowed_children': [],
                    'properties': [
                        {
                            # Missing id, label, type
                            'required': True
                        }
                    ]
                }
            ]
        }
        
        errors = persistence.validate_template(invalid_template)
        assert len(errors) > 0
        assert any('property' in e.lower() or 'id' in e.lower() for e in errors)
    
    def test_delete_template(self, tmp_path):
        """Should delete a template from disk."""
        persistence = TemplatePersistence(templates_dir=str(tmp_path))
        
        template_data = {
            'id': 'test_template',
            'name': 'Test Template',
            'version': '0.1.0',
            'description': 'A test template',
            'node_types': [
                {
                    'id': 'root',
                    'label': 'Root',
                    'allowed_children': [],
                    'properties': []
                }
            ]
        }
        
        persistence.save_template(template_data)
        assert (tmp_path / 'test_template.yaml').exists()
        
        persistence.delete_template('test_template')
        assert not (tmp_path / 'test_template.yaml').exists()
        
        with pytest.raises(FileNotFoundError):
            persistence.load_template('test_template')


class TestTemplateValidation:
    """Tests for comprehensive template validation."""
    
    def test_validate_allowed_children_references_exist(self):
        """All allowed_children should reference existing node types."""
        persistence = TemplatePersistence()
        
        invalid_template = {
            'id': 'test',
            'name': 'Test',
            'version': '0.1.0',
            'description': 'Test',
            'node_types': [
                {
                    'id': 'parent',
                    'label': 'Parent',
                    'allowed_children': ['nonexistent_type'],
                    'properties': []
                }
            ]
        }
        
        errors = persistence.validate_template(invalid_template)
        assert len(errors) > 0
        assert any('allowed_children' in e.lower() or 'nonexistent_type' in e for e in errors)
    
    def test_validate_select_property_options(self):
        """Select properties should have options defined."""
        persistence = TemplatePersistence()
        
        # Valid: select with options
        valid_template = {
            'id': 'test',
            'name': 'Test',
            'version': '0.1.0',
            'description': 'Test',
            'node_types': [
                {
                    'id': 'test_node',
                    'label': 'Test',
                    'allowed_children': [],
                    'properties': [
                        {
                            'id': 'status',
                            'label': 'Status',
                            'type': 'select',
                            'options': [
                                {'name': 'Active', 'indicator_id': 'filled'},
                                {'name': 'Inactive', 'indicator_id': 'empty'}
                            ]
                        }
                    ]
                }
            ]
        }
        
        errors = persistence.validate_template(valid_template)
        # Should be valid or only non-critical warnings
        assert all('critical' not in e.lower() for e in errors)
    
    def test_validate_select_property_missing_options(self):
        """Select properties should warn if missing options."""
        persistence = TemplatePersistence()
        
        template = {
            'id': 'test',
            'name': 'Test',
            'version': '0.1.0',
            'description': 'Test',
            'node_types': [
                {
                    'id': 'test_node',
                    'label': 'Test',
                    'allowed_children': [],
                    'properties': [
                        {
                            'id': 'status',
                            'label': 'Status',
                            'type': 'select'
                            # Missing options
                        }
                    ]
                }
            ]
        }
        
        errors = persistence.validate_template(template)
        assert len(errors) > 0
        assert any('options' in e.lower() for e in errors)
