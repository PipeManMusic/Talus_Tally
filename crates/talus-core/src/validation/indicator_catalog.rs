//! Structural validation for indicator catalog documents.
//!
//! Port of `SchemaValidator.validate_indicator_catalog` and its
//! `_validate_indicator_set` / `_validate_indicator` / `_validate_theme`
//! helpers from `backend/infra/schema_validator.py`. Error strings are
//! byte-for-byte parity with Python.
//!
//! This module is built across multiple slices: 57a covers the top-level
//! `indicator_sets` shape and the per-set identity + description rules.
//! Per-indicator and per-theme rules ship in follow-up slices.

use serde_json::Value;

/// Validate the top-level structure of an indicator catalog document.
#[must_use]
pub fn validate(_data: &Value) -> Vec<String> {
    // RED stub — implementation arrives in the GREEN slice.
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn minimal_set() -> Value {
        json!({"description": "Status indicators"})
    }

    // ----- top-level rules -----

    #[test]
    fn indicator_sets_missing_is_reported() {
        let data = json!({});
        assert!(validate(&data)
            .contains(&"indicator_catalog: missing required field 'indicator_sets'".to_string()));
    }

    #[test]
    fn indicator_sets_non_object_is_reported() {
        let data = json!({"indicator_sets": [1, 2, 3]});
        assert!(validate(&data)
            .contains(&"indicator_catalog.indicator_sets: must be object".to_string()));
    }

    #[test]
    fn indicator_sets_empty_object_is_allowed() {
        let data = json!({"indicator_sets": {}});
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn minimal_valid_catalog_returns_no_errors() {
        let data = json!({"indicator_sets": {"status": minimal_set()}});
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    // ----- per-set identity (snake_case) -----

    #[test]
    fn set_id_snake_case_with_digits_passes() {
        let data = json!({"indicator_sets": {"phase_2_status": minimal_set()}});
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn set_id_uppercase_is_reported() {
        let data = json!({"indicator_sets": {"Status": minimal_set()}});
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['Status']: \
              id must match snake_case pattern (got 'Status')"
                .to_string()
        ));
    }

    #[test]
    fn set_id_hyphen_is_reported() {
        let data = json!({"indicator_sets": {"status-icons": minimal_set()}});
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status-icons']: \
              id must match snake_case pattern (got 'status-icons')"
                .to_string()
        ));
    }

    #[test]
    fn set_id_leading_underscore_is_reported() {
        let data = json!({"indicator_sets": {"_status": minimal_set()}});
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['_status']: \
              id must match snake_case pattern (got '_status')"
                .to_string()
        ));
    }

    #[test]
    fn set_id_trailing_underscore_is_reported() {
        let data = json!({"indicator_sets": {"status_": minimal_set()}});
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status_']: \
              id must match snake_case pattern (got 'status_')"
                .to_string()
        ));
    }

    #[test]
    fn set_id_double_underscore_is_reported() {
        let data = json!({"indicator_sets": {"status__icons": minimal_set()}});
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status__icons']: \
              id must match snake_case pattern (got 'status__icons')"
                .to_string()
        ));
    }

    // ----- per-set description -----

    #[test]
    fn set_missing_description_is_reported() {
        let data = json!({"indicator_sets": {"status": {}}});
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status']: \
              missing required field 'description'"
                .to_string()
        ));
    }

    #[test]
    fn set_empty_description_is_reported() {
        let data = json!({"indicator_sets": {"status": {"description": "   "}}});
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].description: must be non-empty string"
                .to_string()
        ));
    }

    #[test]
    fn set_non_string_description_is_reported() {
        let data = json!({"indicator_sets": {"status": {"description": 7}}});
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].description: must be non-empty string"
                .to_string()
        ));
    }

    #[test]
    fn set_id_appears_in_error_path() {
        let data = json!({"indicator_sets": {
            "alpha": minimal_set(),
            "beta": {}
        }});
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['beta']: \
              missing required field 'description'"
                .to_string()
        ));
    }
}
