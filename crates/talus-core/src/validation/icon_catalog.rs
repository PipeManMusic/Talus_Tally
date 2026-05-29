//! Structural validation for icon catalog documents.
//!
//! Port of `SchemaValidator.validate_icon_catalog` and `_validate_icon`
//! from `backend/infra/schema_validator.py`. Error strings are
//! byte-for-byte parity with Python.

use serde_json::Value;

/// Validate the top-level structure of an icon catalog document.
#[must_use]
pub fn validate(_data: &Value) -> Vec<String> {
    // RED stub — implementation arrives in the GREEN slice.
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn minimal_icon() -> Value {
        json!({"id": "house", "file": "house.svg"})
    }

    // ----- top-level rules -----

    #[test]
    fn icons_missing_is_reported() {
        let data = json!({});
        assert!(
            validate(&data).contains(&"icon_catalog: missing required field 'icons'".to_string())
        );
    }

    #[test]
    fn icons_non_array_is_reported() {
        let data = json!({"icons": "oops"});
        assert!(validate(&data).contains(&"icon_catalog.icons: must be array".to_string()));
    }

    #[test]
    fn icons_empty_array_is_allowed() {
        let data = json!({"icons": []});
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn minimal_valid_catalog_returns_no_errors() {
        let data = json!({"icons": [minimal_icon()]});
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    // ----- per-icon rules -----

    #[test]
    fn icon_missing_id_is_reported() {
        let data = json!({"icons": [{"file": "x.svg"}]});
        assert!(validate(&data)
            .contains(&"icon_catalog.icons[0]: missing required field 'id'".to_string()));
    }

    #[test]
    fn icon_empty_id_is_reported() {
        let data = json!({"icons": [{"id": "  ", "file": "x.svg"}]});
        assert!(validate(&data)
            .contains(&"icon_catalog.icons[0].id: must be non-empty string".to_string()));
    }

    #[test]
    fn icon_non_string_id_is_reported() {
        let data = json!({"icons": [{"id": 7, "file": "x.svg"}]});
        assert!(validate(&data)
            .contains(&"icon_catalog.icons[0].id: must be non-empty string".to_string()));
    }

    #[test]
    fn icon_kebab_with_digits_passes() {
        let data = json!({"icons": [{"id": "arrow-2-up", "file": "x.svg"}]});
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn icon_uppercase_id_is_reported() {
        let data = json!({"icons": [{"id": "House", "file": "x.svg"}]});
        assert!(validate(&data).contains(
            &"icon_catalog.icons[0].id: must match kebab-case pattern (got 'House')".to_string()
        ));
    }

    #[test]
    fn icon_underscore_id_is_reported() {
        let data = json!({"icons": [{"id": "house_door", "file": "x.svg"}]});
        assert!(validate(&data).contains(
            &"icon_catalog.icons[0].id: must match kebab-case pattern (got 'house_door')"
                .to_string()
        ));
    }

    #[test]
    fn icon_leading_dash_id_is_reported() {
        let data = json!({"icons": [{"id": "-house", "file": "x.svg"}]});
        assert!(validate(&data).contains(
            &"icon_catalog.icons[0].id: must match kebab-case pattern (got '-house')".to_string()
        ));
    }

    #[test]
    fn icon_trailing_dash_id_is_reported() {
        let data = json!({"icons": [{"id": "house-", "file": "x.svg"}]});
        assert!(validate(&data).contains(
            &"icon_catalog.icons[0].id: must match kebab-case pattern (got 'house-')".to_string()
        ));
    }

    #[test]
    fn icon_double_dash_id_is_reported() {
        let data = json!({"icons": [{"id": "house--door", "file": "x.svg"}]});
        assert!(validate(&data).contains(
            &"icon_catalog.icons[0].id: must match kebab-case pattern (got 'house--door')"
                .to_string()
        ));
    }

    #[test]
    fn duplicate_id_is_reported_on_second_occurrence() {
        let data = json!({"icons": [
            {"id": "house", "file": "a.svg"},
            {"id": "house", "file": "b.svg"}
        ]});
        let errors = validate(&data);
        assert!(errors.contains(&"icon_catalog.icons[1].id: duplicate icon id 'house'".to_string()));
    }

    #[test]
    fn icon_missing_file_is_reported() {
        let data = json!({"icons": [{"id": "house"}]});
        assert!(validate(&data)
            .contains(&"icon_catalog.icons[0]: missing required field 'file'".to_string()));
    }

    #[test]
    fn icon_empty_file_is_reported() {
        let data = json!({"icons": [{"id": "house", "file": "   "}]});
        assert!(validate(&data)
            .contains(&"icon_catalog.icons[0].file: must be non-empty string".to_string()));
    }

    #[test]
    fn icon_non_string_file_is_reported() {
        let data = json!({"icons": [{"id": "house", "file": 9}]});
        assert!(validate(&data)
            .contains(&"icon_catalog.icons[0].file: must be non-empty string".to_string()));
    }

    #[test]
    fn icon_index_appears_in_error_path() {
        let data = json!({"icons": [
            minimal_icon(),
            minimal_icon(),
            {"file": "x.svg"}
        ]});
        // The third icon (index 2) is missing 'id' AND is a duplicate-by-file
        // not by id. Index 2 is what we want to see surface.
        assert!(validate(&data)
            .contains(&"icon_catalog.icons[2]: missing required field 'id'".to_string()));
    }
}
