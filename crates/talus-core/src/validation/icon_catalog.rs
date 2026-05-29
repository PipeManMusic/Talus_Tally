//! Structural validation for icon catalog documents.
//!
//! Port of `SchemaValidator.validate_icon_catalog` and `_validate_icon`
//! from `backend/infra/schema_validator.py`. Error strings are
//! byte-for-byte parity with Python.

use std::collections::HashSet;

use serde_json::Value;

/// Validate the top-level structure of an icon catalog document.
#[must_use]
pub fn validate(data: &Value) -> Vec<String> {
    let mut errors = Vec::new();

    match data.get("icons") {
        None => errors.push("icon_catalog: missing required field 'icons'".to_string()),
        Some(v) => match v.as_array() {
            None => errors.push("icon_catalog.icons: must be array".to_string()),
            Some(arr) => {
                let mut seen: HashSet<String> = HashSet::new();
                for (i, icon) in arr.iter().enumerate() {
                    errors.extend(validate_icon(icon, i, &mut seen));
                }
            }
        },
    }

    errors
}

fn validate_icon(icon: &Value, index: usize, seen: &mut HashSet<String>) -> Vec<String> {
    let path = format!("icon_catalog.icons[{index}]");
    let mut errors = Vec::new();

    match icon.get("id") {
        None => errors.push(format!("{path}: missing required field 'id'")),
        Some(v) => match v.as_str() {
            Some(s) if !s.trim().is_empty() => {
                if !is_kebab_case(s) {
                    errors.push(format!(
                        "{path}.id: must match kebab-case pattern (got '{s}')"
                    ));
                }
                if !seen.insert(s.to_string()) {
                    errors.push(format!("{path}.id: duplicate icon id '{s}'"));
                }
            }
            _ => errors.push(format!("{path}.id: must be non-empty string")),
        },
    }

    match icon.get("file") {
        None => errors.push(format!("{path}: missing required field 'file'")),
        Some(v) => {
            if !v.as_str().is_some_and(|s| !s.trim().is_empty()) {
                errors.push(format!("{path}.file: must be non-empty string"));
            }
        }
    }

    errors
}

/// Matches Python's `^[a-z0-9]+(-[a-z0-9]+)*$`: lowercase alphanumerics
/// in hyphen-separated groups, no leading/trailing/double hyphens.
fn is_kebab_case(s: &str) -> bool {
    if s.is_empty() {
        return false;
    }
    let mut prev_dash = true; // forbid leading '-'
    for c in s.chars() {
        match c {
            'a'..='z' | '0'..='9' => prev_dash = false,
            '-' if !prev_dash => prev_dash = true,
            _ => return false,
        }
    }
    !prev_dash // forbid trailing '-'
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
