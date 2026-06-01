//! Per-indicator theme validation (`default_theme` entries).
//!
//! Each entry under `default_theme` maps an indicator id to a theme
//! object whose optional `indicator_color` / `text_color` fields must be
//! `#RGB` or `#RRGGBB` strings (case-insensitive). RED stub: returns no
//! errors so happy-path tests pass and error-emission tests fail.

use serde_json::Value;

/// Validate the `default_theme` object on an indicator set.
///
/// `set_path` is the set-level error prefix
/// (`indicator_catalog.indicator_sets['<set_id>']`).
pub(super) fn validate_map(theme_map: &Value, _set_id: &str, set_path: &str) -> Vec<String> {
    let mut errors = Vec::new();
    let Some(entries) = theme_map.as_object() else {
        errors.push(format!("{set_path}.default_theme: must be object"));
        return errors;
    };
    for (indicator_id, theme) in entries {
        errors.extend(validate_one(theme, indicator_id, set_path));
    }
    errors
}

fn validate_one(theme: &Value, indicator_id: &str, set_path: &str) -> Vec<String> {
    let path = format!("{set_path}.default_theme['{indicator_id}']");
    let mut errors = Vec::new();

    let Some(obj) = theme.as_object() else {
        errors.push(format!("{path}: must be object"));
        return errors;
    };

    for field in ["indicator_color", "text_color"] {
        let Some(v) = obj.get(field) else { continue };
        match v.as_str() {
            None => errors.push(format!("{path}.{field}: must be string")),
            Some(s) => {
                if !is_hex_color(s) {
                    errors.push(format!("{path}.{field}: invalid hex color '{s}'"));
                }
            }
        }
    }

    errors
}

/// Matches Python `^#[0-9A-F]{3}([0-9A-F]{3})?$` case-insensitively:
/// `#` followed by exactly 3 or 6 hex digits.
fn is_hex_color(s: &str) -> bool {
    let Some(rest) = s.strip_prefix('#') else {
        return false;
    };
    matches!(rest.len(), 3 | 6) && rest.chars().all(|c| c.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::super::validate;
    use serde_json::{json, Value};

    fn wrap_set(set: Value) -> Value {
        let mut top = json!({"indicator_sets": {}});
        top["indicator_sets"]
            .as_object_mut()
            .unwrap()
            .insert("status".to_string(), set);
        top
    }

    fn set_with_theme(theme: Value) -> Value {
        let mut s = json!({"description": "S"});
        s.as_object_mut()
            .unwrap()
            .insert("default_theme".to_string(), theme);
        s
    }

    #[test]
    fn default_theme_absent_is_allowed() {
        let data = wrap_set(json!({"description": "S"}));
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn default_theme_non_object_is_reported() {
        let data = wrap_set(set_with_theme(json!("oops")));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].default_theme: must be object".to_string()
        ));
    }

    #[test]
    fn default_theme_empty_object_is_allowed() {
        let data = wrap_set(set_with_theme(json!({})));
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn theme_entry_non_object_is_reported() {
        let data = wrap_set(set_with_theme(json!({"go": "blue"})));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].default_theme['go']: must be object"
                .to_string()
        ));
    }

    #[test]
    fn valid_theme_returns_no_errors() {
        let data = wrap_set(set_with_theme(
            json!({"go": {"indicator_color": "#00FF00", "text_color": "#000"}}),
        ));
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn indicator_color_non_string_is_reported() {
        let data = wrap_set(set_with_theme(json!({"go": {"indicator_color": 7}})));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].default_theme['go'].indicator_color: \
              must be string"
                .to_string()
        ));
    }

    #[test]
    fn text_color_non_string_is_reported() {
        let data = wrap_set(set_with_theme(json!({"go": {"text_color": true}})));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].default_theme['go'].text_color: \
              must be string"
                .to_string()
        ));
    }

    #[test]
    fn indicator_color_missing_hash_is_reported() {
        let data = wrap_set(set_with_theme(json!({"go": {"indicator_color": "00FF00"}})));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].default_theme['go'].indicator_color: \
              invalid hex color '00FF00'"
                .to_string()
        ));
    }

    #[test]
    fn indicator_color_wrong_length_is_reported() {
        let data = wrap_set(set_with_theme(json!({"go": {"indicator_color": "#FF00"}})));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].default_theme['go'].indicator_color: \
              invalid hex color '#FF00'"
                .to_string()
        ));
    }

    #[test]
    fn indicator_color_non_hex_char_is_reported() {
        let data = wrap_set(set_with_theme(
            json!({"go": {"indicator_color": "#GG0000"}}),
        ));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].default_theme['go'].indicator_color: \
              invalid hex color '#GG0000'"
                .to_string()
        ));
    }

    #[test]
    fn text_color_invalid_hex_is_reported() {
        let data = wrap_set(set_with_theme(json!({"go": {"text_color": "#1234567"}})));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].default_theme['go'].text_color: \
              invalid hex color '#1234567'"
                .to_string()
        ));
    }

    #[test]
    fn three_char_hex_passes() {
        let data = wrap_set(set_with_theme(json!({"go": {"indicator_color": "#abc"}})));
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn six_char_hex_passes() {
        let data = wrap_set(set_with_theme(
            json!({"go": {"indicator_color": "#A1B2C3"}}),
        ));
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn lowercase_hex_passes() {
        let data = wrap_set(set_with_theme(
            json!({"go": {"indicator_color": "#deadbe"}}),
        ));
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn indicator_id_key_appears_in_error_path() {
        let data = wrap_set(set_with_theme(json!({"alert": "red"})));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].default_theme['alert']: must be object"
                .to_string()
        ));
    }
}
