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

    // ----- format object rules -----

    fn token_with_format(fmt: Value) -> Value {
        json!({"id": "x", "label": "X", "prefix": "> ", "format": fmt})
    }

    fn wrap(token: Value) -> Value {
        json!({"id": "p", "label": "P", "tokens": [token]})
    }

    #[test]
    fn format_absent_is_allowed() {
        let data = wrap(json!({"id": "x", "label": "X", "prefix": "> "}));
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn format_non_object_is_reported() {
        let data = wrap(json!({"id": "x", "label": "X", "prefix": "> ", "format": "bold"}));
        assert!(validate(&data)
            .contains(&"markup_profile.tokens[0].format: must be object".to_string()));
    }

    #[test]
    fn format_empty_object_is_allowed() {
        let data = wrap(token_with_format(json!({})));
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn text_transform_valid_values_pass() {
        for v in ["uppercase", "lowercase", "capitalize", "none"] {
            let data = wrap(token_with_format(json!({"text_transform": v})));
            assert_eq!(validate(&data), Vec::<String>::new(), "value {v}");
        }
    }

    #[test]
    fn text_transform_unknown_is_reported() {
        let data = wrap(token_with_format(json!({"text_transform": "smallcaps"})));
        assert!(validate(&data).contains(
            &"markup_profile.tokens[0].format.text_transform: must be one of \
              ['uppercase', 'lowercase', 'capitalize', 'none']"
                .to_string()
        ));
    }

    #[test]
    fn bold_non_bool_is_reported() {
        let data = wrap(token_with_format(json!({"bold": "yes"})));
        assert!(validate(&data)
            .contains(&"markup_profile.tokens[0].format.bold: must be boolean".to_string()));
    }

    #[test]
    fn italic_non_bool_is_reported() {
        let data = wrap(token_with_format(json!({"italic": 1})));
        assert!(validate(&data)
            .contains(&"markup_profile.tokens[0].format.italic: must be boolean".to_string()));
    }

    #[test]
    fn underline_non_bool_is_reported() {
        let data = wrap(token_with_format(json!({"underline": null})));
        assert!(validate(&data)
            .contains(&"markup_profile.tokens[0].format.underline: must be boolean".to_string()));
    }

    #[test]
    fn bool_fields_true_and_false_pass() {
        let data = wrap(token_with_format(
            json!({"bold": true, "italic": false, "underline": true}),
        ));
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn color_non_string_is_reported() {
        let data = wrap(token_with_format(json!({"color": 7})));
        assert!(validate(&data)
            .contains(&"markup_profile.tokens[0].format.color: must be string".to_string()));
    }

    #[test]
    fn background_color_non_string_is_reported() {
        let data = wrap(token_with_format(json!({"background_color": true})));
        assert!(validate(&data).contains(
            &"markup_profile.tokens[0].format.background_color: must be string".to_string()
        ));
    }

    #[test]
    fn font_size_non_string_is_reported() {
        let data = wrap(token_with_format(json!({"font_size": 12})));
        assert!(validate(&data)
            .contains(&"markup_profile.tokens[0].format.font_size: must be string".to_string()));
    }

    #[test]
    fn string_fields_accept_strings() {
        let data = wrap(token_with_format(
            json!({"color": "#fff", "background_color": "#000", "font_size": "12pt"}),
        ));
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn align_valid_values_pass() {
        for v in ["left", "center", "right"] {
            let data = wrap(token_with_format(json!({"align": v})));
            assert_eq!(validate(&data), Vec::<String>::new(), "value {v}");
        }
    }

    #[test]
    fn align_unknown_is_reported() {
        let data = wrap(token_with_format(json!({"align": "justify"})));
        assert!(validate(&data).contains(
            &"markup_profile.tokens[0].format.align: must be one of \
              ['left', 'center', 'right']"
                .to_string()
        ));
    }
}
