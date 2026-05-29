//! Top-level structural validation for markup profile documents.
//!
//! Port of the *profile-level* checks in
//! `backend/infra/schema_validator.py::SchemaValidator.validate_markup_profile`.
//! Per-token rules live in the private `token` submodule. Error strings are
//! byte-for-byte parity with Python so the existing API surface and UI
//! messages do not change.

use serde_json::Value;

mod format;
mod token;

/// Validate the top-level structure of a markup profile document.
///
/// Accepts an untyped value because validation runs at the YAML/JSON
/// boundary, before any typed deserialization. Returns the list of
/// problems found (empty when the document is well-formed at this layer).
#[must_use]
pub fn validate(data: &Value) -> Vec<String> {
    let mut errors = Vec::new();

    match data.get("id") {
        None => errors.push("markup_profile: missing required field 'id'".to_string()),
        Some(v) => {
            if !is_non_empty_string(v) {
                errors.push("markup_profile.id: must be non-empty string".to_string());
            }
        }
    }

    match data.get("label") {
        None => errors.push("markup_profile: missing required field 'label'".to_string()),
        Some(v) => {
            if !is_non_empty_string(v) {
                errors.push("markup_profile.label: must be non-empty string".to_string());
            }
        }
    }

    if let Some(tokens) = data.get("tokens") {
        match tokens.as_array() {
            None => errors.push("markup_profile.tokens: must be array".to_string()),
            Some(arr) => {
                for (i, token) in arr.iter().enumerate() {
                    errors.extend(token::validate(token, i));
                }
            }
        }
    }

    errors
}

pub(super) fn is_non_empty_string(v: &Value) -> bool {
    v.as_str().is_some_and(|s| !s.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn minimal_valid_profile_returns_no_errors() {
        let data = json!({"id": "default", "label": "Default"});
        assert!(validate(&data).is_empty());
    }

    #[test]
    fn missing_id_is_reported() {
        let data = json!({"label": "Default"});
        assert!(
            validate(&data).contains(&"markup_profile: missing required field 'id'".to_string())
        );
    }

    #[test]
    fn empty_id_is_reported() {
        let data = json!({"id": "", "label": "Default"});
        assert!(
            validate(&data).contains(&"markup_profile.id: must be non-empty string".to_string())
        );
    }

    #[test]
    fn whitespace_only_id_is_reported() {
        let data = json!({"id": "   ", "label": "Default"});
        assert!(
            validate(&data).contains(&"markup_profile.id: must be non-empty string".to_string())
        );
    }

    #[test]
    fn non_string_id_is_reported() {
        let data = json!({"id": 7, "label": "Default"});
        assert!(
            validate(&data).contains(&"markup_profile.id: must be non-empty string".to_string())
        );
    }

    #[test]
    fn missing_label_is_reported() {
        let data = json!({"id": "default"});
        assert!(
            validate(&data).contains(&"markup_profile: missing required field 'label'".to_string())
        );
    }

    #[test]
    fn empty_label_is_reported() {
        let data = json!({"id": "default", "label": ""});
        assert!(
            validate(&data).contains(&"markup_profile.label: must be non-empty string".to_string())
        );
    }

    #[test]
    fn non_string_label_is_reported() {
        let data = json!({"id": "default", "label": 42});
        assert!(
            validate(&data).contains(&"markup_profile.label: must be non-empty string".to_string())
        );
    }

    #[test]
    fn tokens_absent_is_allowed() {
        let data = json!({"id": "default", "label": "Default"});
        assert!(validate(&data).is_empty());
    }

    #[test]
    fn tokens_non_array_is_reported() {
        let data = json!({"id": "default", "label": "Default", "tokens": "oops"});
        assert!(validate(&data).contains(&"markup_profile.tokens: must be array".to_string()));
    }

    #[test]
    fn tokens_empty_array_is_allowed() {
        let data = json!({"id": "default", "label": "Default", "tokens": []});
        assert!(validate(&data).is_empty());
    }

    #[test]
    fn multiple_errors_are_all_reported() {
        let data = json!({});
        let errors = validate(&data);
        assert!(errors.contains(&"markup_profile: missing required field 'id'".to_string()));
        assert!(errors.contains(&"markup_profile: missing required field 'label'".to_string()));
    }
}
