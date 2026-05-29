//! Per-token validation rules for markup profile tokens.
//!
//! Mirrors `_validate_markup_token` from
//! `backend/infra/schema_validator.py`. Covers id, label, the
//! `prefix`-or-`pattern` requirement, and the `format_scope` enum. The
//! `format` object is validated by a separate slice.

use serde_json::Value;

use super::is_non_empty_string;

/// Validate a single token at `index`. Returns its errors (empty if OK).
pub(super) fn validate(token: &Value, index: usize) -> Vec<String> {
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

    if let Some(scope) = token.get("format_scope") {
        if !matches!(scope.as_str(), Some("line" | "prefix")) {
            errors.push(format!("{path}.format_scope: must be 'line' or 'prefix'"));
        }
    }

    if let Some(fmt) = token.get("format") {
        super::format::validate(fmt, &path, &mut errors);
    }

    errors
}

#[cfg(test)]
mod tests {
    use super::super::validate;
    use serde_json::{json, Value};

    fn minimal_token() -> Value {
        json!({"id": "h1", "label": "Heading 1", "prefix": "# "})
    }

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
        let data = json!({"id": "p", "label": "P", "tokens": [
            {"id": "x", "label": "X", "pattern": "^- "}
        ]});
        let errors = validate(&data);
        assert!(errors
            .contains(&"markup_profile.tokens[0]: missing required field 'prefix'".to_string()));
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
        assert!(errors
            .contains(&"markup_profile.tokens[0]: missing required field 'prefix'".to_string()));
        assert!(!errors.iter().any(|e| e.contains("or provide 'pattern'")));
    }

    #[test]
    fn format_scope_absent_is_allowed() {
        let data = json!({"id": "p", "label": "P", "tokens": [minimal_token()]});
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn format_scope_line_is_valid() {
        let data = json!({"id": "p", "label": "P", "tokens": [
            {"id": "x", "label": "X", "prefix": "> ", "format_scope": "line"}
        ]});
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn format_scope_prefix_value_is_valid() {
        let data = json!({"id": "p", "label": "P", "tokens": [
            {"id": "x", "label": "X", "prefix": "> ", "format_scope": "prefix"}
        ]});
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn format_scope_unknown_string_is_reported() {
        let data = json!({"id": "p", "label": "P", "tokens": [
            {"id": "x", "label": "X", "prefix": "> ", "format_scope": "block"}
        ]});
        assert!(validate(&data).contains(
            &"markup_profile.tokens[0].format_scope: must be 'line' or 'prefix'".to_string()
        ));
    }

    #[test]
    fn format_scope_non_string_is_reported() {
        let data = json!({"id": "p", "label": "P", "tokens": [
            {"id": "x", "label": "X", "prefix": "> ", "format_scope": 1}
        ]});
        assert!(validate(&data).contains(
            &"markup_profile.tokens[0].format_scope: must be 'line' or 'prefix'".to_string()
        ));
    }
}
