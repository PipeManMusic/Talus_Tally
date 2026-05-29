//! Validation rules for a markup token's `format` object.
//!
//! Port of the format-object block in `_validate_markup_token`. Error
//! strings are byte-for-byte parity with Python; the enum-list messages
//! preserve Python's `repr(list)` shape (single-quoted, comma-space).

use serde_json::Value;

pub(super) fn validate(fmt: &Value, path: &str, errors: &mut Vec<String>) {
    let Some(obj) = fmt.as_object() else {
        errors.push(format!("{path}.format: must be object"));
        return;
    };

    if let Some(tt) = obj.get("text_transform") {
        if !matches!(
            tt.as_str(),
            Some("uppercase" | "lowercase" | "capitalize" | "none")
        ) {
            errors.push(format!(
                "{path}.format.text_transform: must be one of \
                 ['uppercase', 'lowercase', 'capitalize', 'none']"
            ));
        }
    }

    for field in ["bold", "italic", "underline"] {
        if let Some(v) = obj.get(field) {
            if !v.is_boolean() {
                errors.push(format!("{path}.format.{field}: must be boolean"));
            }
        }
    }

    for field in ["color", "background_color", "font_size"] {
        if let Some(v) = obj.get(field) {
            if !v.is_string() {
                errors.push(format!("{path}.format.{field}: must be string"));
            }
        }
    }

    if let Some(al) = obj.get("align") {
        if !matches!(al.as_str(), Some("left" | "center" | "right")) {
            errors.push(format!(
                "{path}.format.align: must be one of ['left', 'center', 'right']"
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::validate;
    use serde_json::{json, Value};

    fn token_with_format(fmt: Value) -> Value {
        let mut t = json!({"id": "x", "label": "X", "prefix": "> "});
        t.as_object_mut().unwrap().insert("format".to_string(), fmt);
        t
    }

    fn wrap(token: Value) -> Value {
        let mut p = json!({"id": "p", "label": "P", "tokens": []});
        p["tokens"].as_array_mut().unwrap().push(token);
        p
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
