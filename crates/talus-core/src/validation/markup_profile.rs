//! Top-level structural validation for markup profile documents.
//!
//! Port of the *profile-level* checks in
//! `backend/infra/schema_validator.py::SchemaValidator.validate_markup_profile`
//! and the *token-identity* checks in `_validate_markup_token` (id, label,
//! prefix-or-pattern). The remaining per-token rules (`format_scope`,
//! `format` object) ship in follow-up slices. Error strings are byte-for-byte
//! parity with Python so the existing API surface and UI messages do not
//! change.

use serde_json::Value;

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
                    errors.extend(validate_token(token, i));
                }
            }
        }
    }

    errors
}

/// Validate the identity portion of a single token: id, label, and the
/// `prefix`-or-`pattern` requirement. Format rules are validated by a
/// separate slice.
fn validate_token(token: &Value, index: usize) -> Vec<String> {
    let path = format!("markup_profile.tokens[{index}]");
    let mut errors = Vec::new();

    match token.get("id") {
        None => errors.push(format!("{path}: missing required field 'id'")),
        Some(v) => {
            if !is_non_empty_string(v) {
                errors.push(format!("{path}.id: must be non-empty string"));
            }
        }
    }

    match token.get("label") {
        None => errors.push(format!("{path}: missing required field 'label'")),
        Some(v) => {
            if !is_non_empty_string(v) {
                errors.push(format!("{path}.label: must be non-empty string"));
            }
        }
    }

    // Python treats both missing-key and explicit-null the same via dict.get().
    let has_prefix = match token.get("prefix").filter(|v| !v.is_null()) {
        None => {
            errors.push(format!("{path}: missing required field 'prefix'"));
            false
        }
        Some(v) if v.is_string() => true,
        Some(_) => {
            errors.push(format!("{path}.prefix: must be string"));
            false
        }
    };

    let has_pattern = match token.get("pattern").filter(|v| !v.is_null()) {
        None => false,
        Some(v) if is_non_empty_string(v) => true,
        Some(_) => {
            errors.push(format!(
                "{path}.pattern: must be non-empty string if provided"
            ));
            false
        }
    };

    if !has_prefix && !has_pattern {
        errors.push(format!(
            "{path}: missing required field 'prefix' (or provide 'pattern')"
        ));
    }

    errors
}

fn is_non_empty_string(v: &Value) -> bool {
    v.as_str().is_some_and(|s| !s.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn minimal_token() -> Value {
        json!({"id": "h1", "label": "Heading 1", "prefix": "# "})
    }

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

    // ----- per-token rules -----

    #[test]
    fn valid_token_returns_no_errors() {
        let data = json!({"id": "p", "label": "P", "tokens": [minimal_token()]});
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn token_missing_id_is_reported() {
        let data = json!({"id": "p", "label": "P", "tokens": [
            {"label": "X", "prefix": "> "}
        ]});
        assert!(validate(&data)
            .contains(&"markup_profile.tokens[0]: missing required field 'id'".to_string()));
    }

    #[test]
    fn token_empty_id_is_reported() {
        let data = json!({"id": "p", "label": "P", "tokens": [
            {"id": "  ", "label": "X", "prefix": "> "}
        ]});
        assert!(validate(&data)
            .contains(&"markup_profile.tokens[0].id: must be non-empty string".to_string()));
    }

    #[test]
    fn token_non_string_id_is_reported() {
        let data = json!({"id": "p", "label": "P", "tokens": [
            {"id": 1, "label": "X", "prefix": "> "}
        ]});
        assert!(validate(&data)
            .contains(&"markup_profile.tokens[0].id: must be non-empty string".to_string()));
    }

    #[test]
    fn token_missing_label_is_reported() {
        let data = json!({"id": "p", "label": "P", "tokens": [
            {"id": "x", "prefix": "> "}
        ]});
        assert!(validate(&data)
            .contains(&"markup_profile.tokens[0]: missing required field 'label'".to_string()));
    }

    #[test]
    fn token_missing_prefix_without_pattern_reports_both_errors() {
        let data = json!({"id": "p", "label": "P", "tokens": [
            {"id": "x", "label": "X"}
        ]});
        let errors = validate(&data);
        assert!(errors
            .contains(&"markup_profile.tokens[0]: missing required field 'prefix'".to_string()));
        assert!(errors.contains(
            &"markup_profile.tokens[0]: missing required field 'prefix' (or provide 'pattern')"
                .to_string()
        ));
    }

    #[test]
    fn token_non_string_prefix_is_reported() {
        let data = json!({"id": "p", "label": "P", "tokens": [
            {"id": "x", "label": "X", "prefix": 9}
        ]});
        assert!(validate(&data)
            .contains(&"markup_profile.tokens[0].prefix: must be string".to_string()));
    }

    #[test]
    fn token_empty_prefix_string_is_allowed() {
        // Python: any string counts as has_prefix, even empty.
        let data = json!({"id": "p", "label": "P", "tokens": [
            {"id": "x", "label": "X", "prefix": ""}
        ]});
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn token_pattern_non_string_is_reported() {
        let data = json!({"id": "p", "label": "P", "tokens": [
            {"id": "x", "label": "X", "prefix": "> ", "pattern": 5}
        ]});
        assert!(validate(&data).contains(
            &"markup_profile.tokens[0].pattern: must be non-empty string if provided".to_string()
        ));
    }

    #[test]
    fn token_pattern_empty_string_is_reported() {
        let data = json!({"id": "p", "label": "P", "tokens": [
            {"id": "x", "label": "X", "prefix": "> ", "pattern": ""}
        ]});
        assert!(validate(&data).contains(
            &"markup_profile.tokens[0].pattern: must be non-empty string if provided".to_string()
        ));
    }

    #[test]
    fn token_pattern_only_no_prefix_reports_missing_prefix_only() {
        // Python: missing prefix always emits "missing required field 'prefix'".
        // The combined "(or provide 'pattern')" message is suppressed because
        // has_pattern is true.
        let data = json!({"id": "p", "label": "P", "tokens": [
            {"id": "x", "label": "X", "pattern": "^- "}
        ]});
        let errors = validate(&data);
        assert!(
            errors
                .contains(&"markup_profile.tokens[0]: missing required field 'prefix'".to_string())
        );
        assert!(!errors.iter().any(|e| e.contains("or provide 'pattern'")));
    }

    #[test]
    fn token_index_appears_in_error_path() {
        let data = json!({"id": "p", "label": "P", "tokens": [
            minimal_token(),
            minimal_token(),
            {"label": "X", "prefix": "> "}
        ]});
        assert!(validate(&data)
            .contains(&"markup_profile.tokens[2]: missing required field 'id'".to_string()));
    }

    #[test]
    fn null_prefix_is_treated_as_missing() {
        let data = json!({"id": "p", "label": "P", "tokens": [
            {"id": "x", "label": "X", "prefix": null, "pattern": "^x"}
        ]});
        let errors = validate(&data);
        // Pattern present, so the combined message is NOT emitted; only the
        // bare "missing required field 'prefix'" remains.
        assert!(errors
            .contains(&"markup_profile.tokens[0]: missing required field 'prefix'".to_string()));
        assert!(!errors.iter().any(|e| e.contains("or provide 'pattern'")));
    }
}
