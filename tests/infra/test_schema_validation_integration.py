"""
Integration Tests for Schema Validation in YAML Loaders

Tests verify that schema validation is properly integrated into:
- MarkupRegistry.load_profile()
- IconCatalog.load()
- IndicatorCatalogManager.load()
"""

import pytest
import tempfile
import os
import yaml
from pathlib import Path

from backend.infra.markup import MarkupRegistry
from backend.infra.icon_catalog import IconCatalog
from backend.infra.indicator_catalog import IndicatorCatalogManager


class TestMarkupRegistryValidation:
    """Tests for markup profile validation in MarkupRegistry."""
    
    @pytest.fixture
    def markup_dir(self):
        """Create temporary markup directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir
    
    def test_valid_markup_profile_loads_successfully(self, markup_dir):
        """Test loading a valid markup profile."""
        profile_data = {
            'id': 'test_profile',
            'label': 'Test Profile',
            'tokens': [
                {
                    'id': 'token1',
                    'label': 'Token 1',
                    'prefix': 'TEST:'
                }
            ]
        }
        
        profile_path = os.path.join(markup_dir, 'test_profile.yaml')
        with open(profile_path, 'w') as f:
            yaml.dump(profile_data, f)
        
        registry = MarkupRegistry(markup_dir)
        profile = registry.load_profile('test_profile')
        
        assert profile['id'] == 'test_profile'
        assert len(profile['tokens']) == 1
    
    def test_invalid_markup_profile_raises_error(self, markup_dir):
        """Test that invalid profile raises validation error."""
        profile_data = {
            'id': 'bad_profile',
            # Missing required 'label' field
            'tokens': []
        }
        
        profile_path = os.path.join(markup_dir, 'bad_profile.yaml')
        with open(profile_path, 'w') as f:
            yaml.dump(profile_data, f)
        
        registry = MarkupRegistry(markup_dir)
        
        with pytest.raises(ValueError) as exc:
            registry.load_profile('bad_profile')
        
        assert 'validation failed' in str(exc.value).lower()
        assert 'label' in str(exc.value).lower()
    
    def test_markup_profile_with_invalid_format_scope(self, markup_dir):
        """Test that invalid format_scope raises error."""
        profile_data = {
            'id': 'bad_format',
            'label': 'Bad Format',
            'tokens': [
                {
                    'id': 'token1',
                    'label': 'Token 1',
                    'prefix': 'TEST:',
                    'format_scope': 'invalid_scope'  # Invalid!
                }
            ]
        }
        
        profile_path = os.path.join(markup_dir, 'bad_format.yaml')
        with open(profile_path, 'w') as f:
            yaml.dump(profile_data, f)
        
        registry = MarkupRegistry(markup_dir)
        
        with pytest.raises(ValueError) as exc:
            registry.load_profile('bad_format')
        
        assert 'validation failed' in str(exc.value).lower()


class TestIconCatalogValidation:
    """Tests for icon catalog validation in IconCatalog."""
    
    def test_valid_icon_catalog_loads_successfully(self):
        """Test loading a valid icon catalog."""
        with tempfile.TemporaryDirectory() as tmpdir:
            catalog_data = {
                'icons': [
                    {'id': 'icon-1', 'file': 'icon1.svg'},
                    {'id': 'icon-2', 'file': 'icon2.svg'}
                ]
            }
            
            catalog_path = os.path.join(tmpdir, 'catalog.yaml')
            with open(catalog_path, 'w') as f:
                yaml.dump(catalog_data, f)
            
            catalog = IconCatalog.load(catalog_path)
            assert catalog is not None
            assert len(catalog._icons) == 2
    
    def test_invalid_icon_catalog_missing_icons_array(self):
        """Test that missing icons array raises error."""
        with tempfile.TemporaryDirectory() as tmpdir:
            catalog_data = {}  # Missing 'icons' array!
            
            catalog_path = os.path.join(tmpdir, 'catalog.yaml')
            with open(catalog_path, 'w') as f:
                yaml.dump(catalog_data, f)
            
            with pytest.raises(ValueError) as exc:
                IconCatalog.load(catalog_path)
            
            assert 'validation failed' in str(exc.value).lower()
    
    def test_invalid_icon_catalog_invalid_id_format(self):
        """Test that invalid icon ID format raises error."""
        with tempfile.TemporaryDirectory() as tmpdir:
            catalog_data = {
                'icons': [
                    {'id': 'InvalidIcon', 'file': 'icon.svg'}  # PascalCase instead of kebab-case!
                ]
            }
            
            catalog_path = os.path.join(tmpdir, 'catalog.yaml')
            with open(catalog_path, 'w') as f:
                yaml.dump(catalog_data, f)
            
            with pytest.raises(ValueError) as exc:
                IconCatalog.load(catalog_path)
            
            assert 'validation failed' in str(exc.value).lower()
    
    def test_icon_catalog_duplicate_ids(self):
        """Test that duplicate icon IDs raise error."""
        with tempfile.TemporaryDirectory() as tmpdir:
            catalog_data = {
                'icons': [
                    {'id': 'duplicate-icon', 'file': 'icon1.svg'},
                    {'id': 'duplicate-icon', 'file': 'icon2.svg'}  # Duplicate!
                ]
            }
            
            catalog_path = os.path.join(tmpdir, 'catalog.yaml')
            with open(catalog_path, 'w') as f:
                yaml.dump(catalog_data, f)
            
            with pytest.raises(ValueError) as exc:
                IconCatalog.load(catalog_path)
            
            assert 'validation failed' in str(exc.value).lower()


class TestIndicatorCatalogValidation:
    """Tests for indicator catalog validation in IndicatorCatalogManager."""
    
    def test_valid_indicator_catalog_loads_successfully(self):
        """Test loading a valid indicator catalog."""
        with tempfile.TemporaryDirectory() as tmpdir:
            catalog_data = {
                'indicator_sets': {
                    'status': {
                        'description': 'Status indicators',
                        'indicators': [
                            {'id': 'complete', 'file': 'complete.svg'}
                        ]
                    }
                }
            }
            
            catalog_path = os.path.join(tmpdir, 'catalog.yaml')
            with open(catalog_path, 'w') as f:
                yaml.dump(catalog_data, f)
            
            manager = IndicatorCatalogManager(catalog_path)
            sets = manager.load()
            
            assert 'status' in sets
            assert len(sets['status'].indicators) == 1
    
    def test_invalid_indicator_catalog_missing_sets(self):
        """Test that missing indicator_sets raises error."""
        with tempfile.TemporaryDirectory() as tmpdir:
            catalog_data = {}  # Missing 'indicator_sets'!
            
            catalog_path = os.path.join(tmpdir, 'catalog.yaml')
            with open(catalog_path, 'w') as f:
                yaml.dump(catalog_data, f)
            
            manager = IndicatorCatalogManager(catalog_path)
            
            with pytest.raises(ValueError) as exc:
                manager.load()
            
            assert 'validation failed' in str(exc.value).lower()
    
    def test_indicator_catalog_bad_set_id_format(self):
        """Test that invalid set ID format raises error."""
        with tempfile.TemporaryDirectory() as tmpdir:
            catalog_data = {
                'indicator_sets': {
                    'invalid-set-id': {  # kebab-case instead of snake_case!
                        'description': 'Invalid set'
                    }
                }
            }
            
            catalog_path = os.path.join(tmpdir, 'catalog.yaml')
            with open(catalog_path, 'w') as f:
                yaml.dump(catalog_data, f)
            
            manager = IndicatorCatalogManager(catalog_path)
            
            with pytest.raises(ValueError) as exc:
                manager.load()
            
            assert 'validation failed' in str(exc.value).lower()
    
    def test_indicator_catalog_missing_set_description(self):
        """Test that missing set description raises error."""
        with tempfile.TemporaryDirectory() as tmpdir:
            catalog_data = {
                'indicator_sets': {
                    'status': {
                        # Missing 'description'!
                        'indicators': []
                    }
                }
            }
            
            catalog_path = os.path.join(tmpdir, 'catalog.yaml')
            with open(catalog_path, 'w') as f:
                yaml.dump(catalog_data, f)
            
            manager = IndicatorCatalogManager(catalog_path)
            
            with pytest.raises(ValueError) as exc:
                manager.load()
            
            assert 'validation failed' in str(exc.value).lower()
    
    def test_indicator_catalog_invalid_theme_color(self):
        """Test that invalid hex color in theme raises error."""
        with tempfile.TemporaryDirectory() as tmpdir:
            catalog_data = {
                'indicator_sets': {
                    'status': {
                        'description': 'Status',
                        'indicators': [
                            {'id': 'complete', 'file': 'complete.svg'}
                        ],
                        'default_theme': {
                            'complete': {
                                'indicator_color': 'not-a-hex-color'  # Invalid!
                            }
                        }
                    }
                }
            }
            
            catalog_path = os.path.join(tmpdir, 'catalog.yaml')
            with open(catalog_path, 'w') as f:
                yaml.dump(catalog_data, f)
            
            manager = IndicatorCatalogManager(catalog_path)
            
            with pytest.raises(ValueError) as exc:
                manager.load()
            
            assert 'validation failed' in str(exc.value).lower()


class TestValidationErrorMessages:
    """Tests for quality of validation error messages."""
    
    def test_markup_error_message_is_helpful(self):
        """Test that markup validation errors are clear."""
        with tempfile.TemporaryDirectory() as tmpdir:
            profile_data = {
                'id': 'bad_profile',
                'label': 'Profile',
                'tokens': [
                    {
                        'id': 'token1',
                        'label': 'Token',
                        'prefix': 'TEST:',
                        'format': {'text_transform': 'invalid_value'}  # Invalid!
                    }
                ]
            }
            
            profile_path = os.path.join(tmpdir, 'bad_profile.yaml')
            with open(profile_path, 'w') as f:
                yaml.dump(profile_data, f)
            
            registry = MarkupRegistry(tmpdir)
            
            with pytest.raises(ValueError) as exc:
                registry.load_profile('bad_profile')
            
            error_msg = str(exc.value)
            assert 'bad_profile' in error_msg  # Should mention the profile name
            assert 'text_transform' in error_msg  # Should mention the field
    
    def test_icon_error_message_is_helpful(self):
        """Test that icon validation errors are clear."""
        with tempfile.TemporaryDirectory() as tmpdir:
            catalog_data = {
                'icons': [
                    {'id': 'InvalidId', 'file': 'icon.svg'}  # Invalid format
                ]
            }
            
            catalog_path = os.path.join(tmpdir, 'catalog.yaml')
            with open(catalog_path, 'w') as f:
                yaml.dump(catalog_data, f)
            
            with pytest.raises(ValueError) as exc:
                IconCatalog.load(catalog_path)
            
            error_msg = str(exc.value)
            assert 'InvalidId' in error_msg
            assert 'kebab-case' in error_msg
    
    def test_indicator_error_message_is_helpful(self):
        """Test that indicator validation errors are clear."""
        with tempfile.TemporaryDirectory() as tmpdir:
            catalog_data = {
                'indicator_sets': {
                    'invalid-set': {  # Invalid format
                        'description': 'Bad set'
                    }
                }
            }
            
            catalog_path = os.path.join(tmpdir, 'catalog.yaml')
            with open(catalog_path, 'w') as f:
                yaml.dump(catalog_data, f)
            
            manager = IndicatorCatalogManager(catalog_path)
            
            with pytest.raises(ValueError) as exc:
                manager.load()
            
            error_msg = str(exc.value)
            assert 'invalid-set' in error_msg
            assert 'snake_case' in error_msg
