//! Validation rules for untyped YAML/JSON inputs at the system boundary.
//!
//! These validators mirror the Python `backend/infra/schema_validator.py`
//! family and return a `Vec<String>` of human-readable errors so that the
//! existing API surface and UI behavior is preserved byte-for-byte during
//! the migration. See `docs/architecture/RUST_MIGRATION_PLAN.md` § Phase 1.

use serde_json::Value;

pub mod icon_catalog;
pub mod indicator_catalog;
pub mod markup_profile;

/// Dispatch to the right validator by string kind.
///
/// Mirrors the kind-dispatch in Python's `validate_yaml_file`:
/// * `"markup"`  → [`markup_profile::validate`]
/// * `"icon"`    → [`icon_catalog::validate`]
/// * `"indicator"` → [`indicator_catalog::validate`]
///
/// Any other value yields a single error `"Unknown schema type: <kind>"`
/// matching the Python text verbatim.
pub fn validate_by_kind(kind: &str, data: &Value) -> Vec<String> {
    match kind {
        "markup" => markup_profile::validate(data),
        "icon" => icon_catalog::validate(data),
        "indicator" => indicator_catalog::validate(data),
        _ => vec![format!("Unknown schema type: {kind}")],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn unknown_kind_reports_python_message() {
        let errors = validate_by_kind("nope", &json!({}));
        assert_eq!(errors, vec!["Unknown schema type: nope".to_string()]);
    }

    #[test]
    fn empty_kind_reports_unknown() {
        let errors = validate_by_kind("", &json!({}));
        assert_eq!(errors, vec!["Unknown schema type: ".to_string()]);
    }

    #[test]
    fn markup_kind_routes_to_markup_profile_validator() {
        let data = json!({ "id": "p1", "label": "P1", "tokens": [] });
        assert!(validate_by_kind("markup", &data).is_empty());
    }

    #[test]
    fn markup_kind_surfaces_markup_validator_errors() {
        let data = json!({ "label": "P1", "tokens": [] });
        let errors = validate_by_kind("markup", &data);
        assert!(
            errors.iter().any(|e| e.contains("id")),
            "expected markup id error, got {errors:?}"
        );
    }

    #[test]
    fn icon_kind_routes_to_icon_catalog_validator() {
        let data = json!({ "icons": [] });
        assert!(validate_by_kind("icon", &data).is_empty());
    }

    #[test]
    fn icon_kind_surfaces_icon_validator_errors() {
        let data = json!({ "icons": [{ "id": "Not-Kebab", "file": "x.svg" }] });
        let errors = validate_by_kind("icon", &data);
        assert!(
            !errors.is_empty(),
            "expected icon validator errors, got {errors:?}"
        );
    }

    #[test]
    fn indicator_kind_routes_to_indicator_catalog_validator() {
        let data = json!({ "indicator_sets": {} });
        assert!(validate_by_kind("indicator", &data).is_empty());
    }

    #[test]
    fn indicator_kind_surfaces_indicator_validator_errors() {
        let data = json!({
            "indicator_sets": {
                "Not_Snake_Case": { "description": "x", "indicators": [] }
            }
        });
        let errors = validate_by_kind("indicator", &data);
        assert!(
            !errors.is_empty(),
            "expected indicator validator errors, got {errors:?}"
        );
    }
}
