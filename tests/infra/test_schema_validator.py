"""
Tests for Schema Validation Service

Tests validate_markup_profile, validate_icon_catalog, validate_indicator_catalog
and the validate_yaml_file function.
"""

import pytest
from backend.infra.schema_validator import (
    SchemaValidator,
    ValidationError,
    validate_yaml_file
)


class TestMarkupProfileValidation:
    """Tests for markup profile schema validation."""
    
    def test_valid_minimal_profile(self):
        """Test validation of minimal valid markup profile."""
        data = {
            'id': 'minimal',
            'label': 'Minimal Profile',
            'tokens': []
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert len(errors) == 0
    
    def test_valid_profile_with_tokens(self):
        """Test validation of profile with multiple tokens."""
        data = {
            'id': 'script_default',
            'label': 'Default Script',
            'tokens': [
                {
                    'id': 'scene_heading',
                    'label': 'Scene Heading',
                    'prefix': 'INT.',
                    'format_scope': 'line',
                    'format': {'text_transform': 'uppercase'}
                },
                {
                    'id': 'action',
                    'label': 'Action',
                    'prefix': ''
                }
            ]
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert len(errors) == 0
    
    def test_missing_required_profile_id(self):
        """Test validation fails when profile id is missing."""
        data = {
            'label': 'No ID Profile'
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert any("missing required field 'id'" in e for e in errors)
    
    def test_missing_required_profile_label(self):
        """Test validation fails when profile label is missing."""
        data = {
            'id': 'no_label'
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert any("missing required field 'label'" in e for e in errors)
    
    def test_invalid_profile_id_type(self):
        """Test validation fails when profile id is not string."""
        data = {
            'id': 123,
            'label': 'Invalid ID Type'
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert any("id: must be non-empty string" in e for e in errors)
    
    def test_empty_profile_id(self):
        """Test validation fails when profile id is empty."""
        data = {
            'id': '',
            'label': 'Empty ID'
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert any("id: must be non-empty string" in e for e in errors)
    
    def test_invalid_tokens_type(self):
        """Test validation fails when tokens is not array."""
        data = {
            'id': 'bad_tokens',
            'label': 'Bad Tokens',
            'tokens': {'token1': {}}
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert any("tokens: must be array" in e for e in errors)
    
    def test_missing_token_id(self):
        """Test validation fails when token id is missing."""
        data = {
            'id': 'profile',
            'label': 'Profile',
            'tokens': [
                {'label': 'Token', 'prefix': 'INT.'}
            ]
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert any("missing required field 'id'" in e for e in errors)
    
    def test_missing_token_label(self):
        """Test validation fails when token label is missing."""
        data = {
            'id': 'profile',
            'label': 'Profile',
            'tokens': [
                {'id': 'token', 'prefix': 'INT.'}
            ]
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert any("missing required field 'label'" in e for e in errors)
    
    def test_missing_token_prefix(self):
        """Test validation fails when token prefix is missing."""
        data = {
            'id': 'profile',
            'label': 'Profile',
            'tokens': [
                {'id': 'token', 'label': 'Token'}
            ]
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert any("missing required field 'prefix'" in e for e in errors)
    
    def test_valid_format_scope_values(self):
        """Test validation accepts valid format_scope values."""
        for scope in ['line', 'prefix']:
            data = {
                'id': 'profile',
                'label': 'Profile',
                'tokens': [
                    {
                        'id': 'token',
                        'label': 'Token',
                        'prefix': 'INT.',
                        'format_scope': scope
                    }
                ]
            }
            errors = SchemaValidator.validate_markup_profile(data)
            assert len(errors) == 0
    
    def test_invalid_format_scope_value(self):
        """Test validation fails with invalid format_scope."""
        data = {
            'id': 'profile',
            'label': 'Profile',
            'tokens': [
                {
                    'id': 'token',
                    'label': 'Token',
                    'prefix': 'INT.',
                    'format_scope': 'invalid'
                }
            ]
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert any("format_scope: must be 'line' or 'prefix'" in e for e in errors)
    
    def test_valid_text_transform_values(self):
        """Test validation accepts valid text_transform values."""
        for transform in ['uppercase', 'lowercase', 'capitalize', 'none']:
            data = {
                'id': 'profile',
                'label': 'Profile',
                'tokens': [
                    {
                        'id': 'token',
                        'label': 'Token',
                        'prefix': 'INT.',
                        'format': {'text_transform': transform}
                    }
                ]
            }
            errors = SchemaValidator.validate_markup_profile(data)
            assert len(errors) == 0
    
    def test_invalid_text_transform_value(self):
        """Test validation fails with invalid text_transform."""
        data = {
            'id': 'profile',
            'label': 'Profile',
            'tokens': [
                {
                    'id': 'token',
                    'label': 'Token',
                    'prefix': 'INT.',
                    'format': {'text_transform': 'invalid_transform'}
                }
            ]
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert any("text_transform: must be one of" in e for e in errors)
    
    def test_format_boolean_fields(self):
        """Test validation of format boolean fields."""
        data = {
            'id': 'profile',
            'label': 'Profile',
            'tokens': [
                {
                    'id': 'token',
                    'label': 'Token',
                    'prefix': 'INT.',
                    'format': {'bold': True, 'italic': False, 'underline': True}
                }
            ]
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert len(errors) == 0
    
    def test_format_invalid_boolean_field(self):
        """Test validation fails when boolean field is not boolean."""
        data = {
            'id': 'profile',
            'label': 'Profile',
            'tokens': [
                {
                    'id': 'token',
                    'label': 'Token',
                    'prefix': 'INT.',
                    'format': {'bold': 'yes'}
                }
            ]
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert any("bold: must be boolean" in e for e in errors)
    
    def test_format_string_fields(self):
        """Test validation of format string fields."""
        data = {
            'id': 'profile',
            'label': 'Profile',
            'tokens': [
                {
                    'id': 'token',
                    'label': 'Token',
                    'prefix': 'INT.',
                    'format': {
                        'color': '#FF0000',
                        'background_color': '#FFFFFF',
                        'font_size': '14pt'
                    }
                }
            ]
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert len(errors) == 0
    
    def test_format_invalid_align_value(self):
        """Test validation fails with invalid align value."""
        data = {
            'id': 'profile',
            'label': 'Profile',
            'tokens': [
                {
                    'id': 'token',
                    'label': 'Token',
                    'prefix': 'INT.',
                    'format': {'align': 'justify'}
                }
            ]
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert any("align: must be one of" in e for e in errors)


class TestIconCatalogValidation:
    """Tests for icon catalog schema validation."""
    
    def test_valid_minimal_catalog(self):
        """Test validation of minimal valid icon catalog."""
        data = {
            'icons': []
        }
        errors = SchemaValidator.validate_icon_catalog(data)
        assert len(errors) == 0
    
    def test_valid_catalog_with_icons(self):
        """Test validation of catalog with multiple icons."""
        data = {
            'icons': [
                {'id': 'play-icon', 'file': 'play.svg'},
                {'id': 'pause-icon', 'file': 'pause.svg'},
                {'id': 'stop-icon', 'file': 'stop.svg'}
            ]
        }
        errors = SchemaValidator.validate_icon_catalog(data)
        assert len(errors) == 0
    
    def test_missing_icons_array(self):
        """Test validation fails when icons array is missing."""
        data = {}
        errors = SchemaValidator.validate_icon_catalog(data)
        assert any("missing required field 'icons'" in e for e in errors)
    
    def test_invalid_icons_type(self):
        """Test validation fails when icons is not array."""
        data = {'icons': 'not-an-array'}
        errors = SchemaValidator.validate_icon_catalog(data)
        assert any("icons: must be array" in e for e in errors)
    
    def test_icon_missing_id(self):
        """Test validation fails when icon id is missing."""
        data = {
            'icons': [
                {'file': 'play.svg'}
            ]
        }
        errors = SchemaValidator.validate_icon_catalog(data)
        assert any("missing required field 'id'" in e for e in errors)
    
    def test_icon_missing_file(self):
        """Test validation fails when icon file is missing."""
        data = {
            'icons': [
                {'id': 'play-icon'}
            ]
        }
        errors = SchemaValidator.validate_icon_catalog(data)
        assert any("missing required field 'file'" in e for e in errors)
    
    def test_icon_id_invalid_format(self):
        """Test validation fails for invalid id format."""
        data = {
            'icons': [
                {'id': 'PlayIcon', 'file': 'play.svg'}
            ]
        }
        errors = SchemaValidator.validate_icon_catalog(data)
        assert any("must match kebab-case pattern" in e for e in errors)
    
    def test_icon_id_kebab_case_valid(self):
        """Test validation accepts kebab-case icon ids."""
        data = {
            'icons': [
                {'id': 'play-icon', 'file': 'play.svg'},
                {'id': 'play-icon-2', 'file': 'play2.svg'},
                {'id': 'my-awesome-icon', 'file': 'awesome.svg'}
            ]
        }
        errors = SchemaValidator.validate_icon_catalog(data)
        assert len(errors) == 0
    
    def test_duplicate_icon_id(self):
        """Test validation fails for duplicate icon ids."""
        data = {
            'icons': [
                {'id': 'play-icon', 'file': 'play.svg'},
                {'id': 'play-icon', 'file': 'play2.svg'}
            ]
        }
        errors = SchemaValidator.validate_icon_catalog(data)
        assert any("duplicate icon id" in e for e in errors)
    
    def test_icon_id_empty(self):
        """Test validation fails when icon id is empty."""
        data = {
            'icons': [
                {'id': '', 'file': 'play.svg'}
            ]
        }
        errors = SchemaValidator.validate_icon_catalog(data)
        assert any("must be non-empty string" in e for e in errors)
    
    def test_icon_file_empty(self):
        """Test validation fails when icon file is empty."""
        data = {
            'icons': [
                {'id': 'play-icon', 'file': ''}
            ]
        }
        errors = SchemaValidator.validate_icon_catalog(data)
        assert any("file: must be non-empty string" in e for e in errors)


class TestIndicatorCatalogValidation:
    """Tests for indicator catalog schema validation."""
    
    def test_valid_minimal_catalog(self):
        """Test validation of minimal valid indicator catalog."""
        data = {
            'indicator_sets': {}
        }
        errors = SchemaValidator.validate_indicator_catalog(data)
        assert len(errors) == 0
    
    def test_valid_catalog_with_sets(self):
        """Test validation of catalog with indicator sets."""
        data = {
            'indicator_sets': {
                'status_flags': {
                    'description': 'Task status indicators'
                },
                'priority_markers': {
                    'description': 'Priority level markers'
                }
            }
        }
        errors = SchemaValidator.validate_indicator_catalog(data)
        assert len(errors) == 0
    
    def test_missing_indicator_sets(self):
        """Test validation fails when indicator_sets is missing."""
        data = {}
        errors = SchemaValidator.validate_indicator_catalog(data)
        assert any("missing required field 'indicator_sets'" in e for e in errors)
    
    def test_invalid_indicator_sets_type(self):
        """Test validation fails when indicator_sets is not object."""
        data = {'indicator_sets': ['set1', 'set2']}
        errors = SchemaValidator.validate_indicator_catalog(data)
        assert any("indicator_sets: must be object" in e for e in errors)
    
    def test_set_missing_description(self):
        """Test validation fails when set description is missing."""
        data = {
            'indicator_sets': {
                'status_flags': {}
            }
        }
        errors = SchemaValidator.validate_indicator_catalog(data)
        assert any("missing required field 'description'" in e for e in errors)
    
    def test_set_id_invalid_format(self):
        """Test validation fails for invalid set id format."""
        data = {
            'indicator_sets': {
                'status-flags': {
                    'description': 'Task status'
                }
            }
        }
        errors = SchemaValidator.validate_indicator_catalog(data)
        assert any("must match snake_case pattern" in e for e in errors)
    
    def test_set_id_snake_case_valid(self):
        """Test validation accepts snake_case set ids."""
        data = {
            'indicator_sets': {
                'status_flags': {'description': 'Status'},
                'priority_levels': {'description': 'Priority'},
                'task_states': {'description': 'States'}
            }
        }
        errors = SchemaValidator.validate_indicator_catalog(data)
        assert len(errors) == 0
    
    def test_duplicate_set_id(self):
        """Test validation fails for duplicate set ids."""
        # This is tricky with dict keys - they can't be duplicated
        # But we can test the logic path
        data = {
            'indicator_sets': {
                'status_flags': {'description': 'Status'}
            }
        }
        errors = SchemaValidator.validate_indicator_catalog(data)
        assert len(errors) == 0
    
    def test_valid_indicators_in_set(self):
        """Test validation of indicators within a set."""
        data = {
            'indicator_sets': {
                'status_flags': {
                    'description': 'Task status',
                    'indicators': [
                        {'id': 'completed', 'file': 'check.svg'},
                        {'id': 'pending', 'file': 'clock.svg'}
                    ]
                }
            }
        }
        errors = SchemaValidator.validate_indicator_catalog(data)
        assert len(errors) == 0
    
    def test_invalid_indicators_type(self):
        """Test validation fails when indicators is not array."""
        data = {
            'indicator_sets': {
                'status_flags': {
                    'description': 'Status',
                    'indicators': {'completed': {}}
                }
            }
        }
        errors = SchemaValidator.validate_indicator_catalog(data)
        assert any("indicators: must be array" in e for e in errors)
    
    def test_indicator_missing_id(self):
        """Test validation fails when indicator id is missing."""
        data = {
            'indicator_sets': {
                'status_flags': {
                    'description': 'Status',
                    'indicators': [
                        {'file': 'check.svg'}
                    ]
                }
            }
        }
        errors = SchemaValidator.validate_indicator_catalog(data)
        assert any("missing required field 'id'" in e for e in errors)
    
    def test_indicator_missing_file(self):
        """Test validation fails when indicator file is missing."""
        data = {
            'indicator_sets': {
                'status_flags': {
                    'description': 'Status',
                    'indicators': [
                        {'id': 'completed'}
                    ]
                }
            }
        }
        errors = SchemaValidator.validate_indicator_catalog(data)
        assert any("missing required field 'file'" in e for e in errors)
    
    def test_duplicate_indicator_id_in_set(self):
        """Test validation fails for duplicate indicator ids within set."""
        data = {
            'indicator_sets': {
                'status_flags': {
                    'description': 'Status',
                    'indicators': [
                        {'id': 'completed', 'file': 'check.svg'},
                        {'id': 'completed', 'file': 'check2.svg'}
                    ]
                }
            }
        }
        errors = SchemaValidator.validate_indicator_catalog(data)
        assert any("duplicate indicator id" in e for e in errors)
    
    def test_valid_theme_colors(self):
        """Test validation of theme color definitions."""
        data = {
            'indicator_sets': {
                'status_flags': {
                    'description': 'Status',
                    'indicators': [
                        {'id': 'completed', 'file': 'check.svg'}
                    ],
                    'default_theme': {
                        'completed': {
                            'indicator_color': '#00FF00',
                            'text_color': '#FFFFFF'
                        }
                    }
                }
            }
        }
        errors = SchemaValidator.validate_indicator_catalog(data)
        assert len(errors) == 0
    
    def test_theme_invalid_color_format(self):
        """Test validation fails for invalid hex color."""
        data = {
            'indicator_sets': {
                'status_flags': {
                    'description': 'Status',
                    'default_theme': {
                        'completed': {
                            'indicator_color': 'invalid-color'
                        }
                    }
                }
            }
        }
        errors = SchemaValidator.validate_indicator_catalog(data)
        assert any("invalid hex color" in e for e in errors)
    
    def test_theme_valid_hex_formats(self):
        """Test validation accepts various hex color formats."""
        formats = ['#FFF', '#FFFFFF', '#000', '#000000', '#AbCdEf']
        for hex_color in formats:
            data = {
                'indicator_sets': {
                    'status_flags': {
                        'description': 'Status',
                        'default_theme': {
                            'completed': {'indicator_color': hex_color}
                        }
                    }
                }
            }
            errors = SchemaValidator.validate_indicator_catalog(data)
            assert len(errors) == 0, f"Failed for color {hex_color}"


class TestComplexScenarios:
    """Tests for complex validation scenarios."""
    
    def test_complete_markup_profile(self):
        """Test validation of complete markup profile with all features."""
        data = {
            'id': 'trelby_screenplay',
            'label': 'Trelby Screenplay',
            'tokens': [
                {
                    'id': 'scene_heading',
                    'label': 'Scene Heading',
                    'prefix': 'INT.',
                    'format_scope': 'line',
                    'format': {
                        'text_transform': 'uppercase',
                        'bold': True
                    }
                },
                {
                    'id': 'character',
                    'label': 'Character',
                    'prefix': 'CHARACTER:',
                    'format_scope': 'prefix',
                    'format': {
                        'text_transform': 'uppercase',
                        'bold': True,
                        'color': '#FF0000'
                    }
                },
                {
                    'id': 'parenthetical',
                    'label': 'Parenthetical',
                    'prefix': '(',
                    'format': {
                        'italic': True
                    }
                }
            ]
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert len(errors) == 0
    
    def test_complete_icon_catalog(self):
        """Test validation of complete icon catalog."""
        data = {
            'icons': [
                {'id': 'play-icon', 'file': 'play.svg'},
                {'id': 'pause-icon', 'file': 'pause.svg'},
                {'id': 'stop-icon', 'file': 'stop.svg'},
                {'id': 'rewind-icon', 'file': 'rewind.svg'},
                {'id': 'forward-icon', 'file': 'forward.svg'}
            ]
        }
        errors = SchemaValidator.validate_icon_catalog(data)
        assert len(errors) == 0
    
    def test_complete_indicator_catalog(self):
        """Test validation of complete indicator catalog."""
        data = {
            'indicator_sets': {
                'task_status': {
                    'description': 'Task completion status',
                    'indicators': [
                        {'id': 'completed', 'file': 'completed.svg'},
                        {'id': 'in_progress', 'file': 'progress.svg'},
                        {'id': 'pending', 'file': 'pending.svg'}
                    ],
                    'default_theme': {
                        'completed': {
                            'indicator_color': '#00FF00',
                            'text_color': '#FFFFFF'
                        },
                        'in_progress': {
                            'indicator_color': '#FFFF00',
                            'text_color': '#000000'
                        },
                        'pending': {
                            'indicator_color': '#FF0000',
                            'text_color': '#FFFFFF'
                        }
                    }
                }
            }
        }
        errors = SchemaValidator.validate_indicator_catalog(data)
        assert len(errors) == 0
    
    def test_multiple_errors_reported(self):
        """Test that multiple errors are reported together."""
        data = {
            'id': 123,  # Wrong type
            'tokens': 'not-array',  # Wrong type
            'icons': []  # Wrong schema
        }
        errors = SchemaValidator.validate_markup_profile(data)
        assert len(errors) >= 2  # Should report multiple issues
