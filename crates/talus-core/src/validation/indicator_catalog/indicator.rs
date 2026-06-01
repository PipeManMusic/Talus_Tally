//! Per-indicator validation rules (id, file, in-set uniqueness).

use std::collections::HashSet;

use serde_json::Value;

/// Validate the `indicators` field of a set. `set_path` is the parent
/// set path used for error messages.
pub(super) fn validate_list(indicators: &Value, set_id: &str, set_path: &str) -> Vec<String> {
    let mut errors = Vec::new();
    match indicators.as_array() {
        None => errors.push(format!("{set_path}.indicators: must be array")),
        Some(arr) => {
            let mut seen: HashSet<String> = HashSet::new();
            for (i, ind) in arr.iter().enumerate() {
                errors.extend(validate_one(ind, i, set_id, &mut seen));
            }
        }
    }
    errors
}

fn validate_one(
    indicator: &Value,
    index: usize,
    set_id: &str,
    seen: &mut HashSet<String>,
) -> Vec<String> {
    let path = format!("indicator_catalog.indicator_sets['{set_id}'].indicators[{index}]");
    let mut errors = Vec::new();

    match indicator.get("id") {
        None => errors.push(format!("{path}: missing required field 'id'")),
        Some(v) => match v.as_str() {
            Some(s) if !s.trim().is_empty() => {
                if !seen.insert(s.to_string()) {
                    errors.push(format!(
                        "{path}.id: duplicate indicator id '{s}' in set '{set_id}'"
                    ));
                }
            }
            _ => errors.push(format!("{path}.id: must be non-empty string")),
        },
    }

    match indicator.get("file") {
        None => errors.push(format!("{path}: missing required field 'file'")),
        Some(v) => {
            if !v.as_str().is_some_and(|s| !s.trim().is_empty()) {
                errors.push(format!("{path}.file: must be non-empty string"));
            }
        }
    }

    errors
}

#[cfg(test)]
mod tests {
    use super::super::validate;
    use serde_json::{json, Value};

    fn set_with_indicators(indicators: Value) -> Value {
        let mut s = json!({"description": "S"});
        s.as_object_mut()
            .unwrap()
            .insert("indicators".to_string(), indicators);
        s
    }

    fn wrap_set(set: Value) -> Value {
        let mut top = json!({"indicator_sets": {}});
        top["indicator_sets"]
            .as_object_mut()
            .unwrap()
            .insert("status".to_string(), set);
        top
    }

    #[test]
    fn indicators_absent_is_allowed() {
        let data = wrap_set(json!({"description": "S"}));
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn indicators_non_array_is_reported() {
        let data = wrap_set(json!({"description": "S", "indicators": "oops"}));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].indicators: must be array".to_string()
        ));
    }

    #[test]
    fn indicators_empty_array_is_allowed() {
        let data = wrap_set(set_with_indicators(json!([])));
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn valid_indicator_returns_no_errors() {
        let data = wrap_set(set_with_indicators(json!([{"id": "go", "file": "go.svg"}])));
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn indicator_missing_id_is_reported() {
        let data = wrap_set(set_with_indicators(json!([{"file": "go.svg"}])));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].indicators[0]: \
              missing required field 'id'"
                .to_string()
        ));
    }

    #[test]
    fn indicator_empty_id_is_reported() {
        let data = wrap_set(set_with_indicators(
            json!([{"id": "   ", "file": "go.svg"}]),
        ));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].indicators[0].id: \
              must be non-empty string"
                .to_string()
        ));
    }

    #[test]
    fn indicator_non_string_id_is_reported() {
        let data = wrap_set(set_with_indicators(json!([{"id": 7, "file": "go.svg"}])));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].indicators[0].id: \
              must be non-empty string"
                .to_string()
        ));
    }

    #[test]
    fn indicator_missing_file_is_reported() {
        let data = wrap_set(set_with_indicators(json!([{"id": "go"}])));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].indicators[0]: \
              missing required field 'file'"
                .to_string()
        ));
    }

    #[test]
    fn indicator_empty_file_is_reported() {
        let data = wrap_set(set_with_indicators(json!([{"id": "go", "file": "  "}])));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].indicators[0].file: \
              must be non-empty string"
                .to_string()
        ));
    }

    #[test]
    fn indicator_non_string_file_is_reported() {
        let data = wrap_set(set_with_indicators(json!([{"id": "go", "file": 9}])));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].indicators[0].file: \
              must be non-empty string"
                .to_string()
        ));
    }

    #[test]
    fn duplicate_indicator_id_in_same_set_is_reported() {
        let data = wrap_set(set_with_indicators(json!([
            {"id": "go", "file": "a.svg"},
            {"id": "go", "file": "b.svg"}
        ])));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].indicators[1].id: \
              duplicate indicator id 'go' in set 'status'"
                .to_string()
        ));
    }

    #[test]
    fn duplicate_indicator_id_resets_across_sets() {
        let data = json!({"indicator_sets": {
            "status": {"description": "S", "indicators": [{"id": "go", "file": "a.svg"}]},
            "phase":  {"description": "P", "indicators": [{"id": "go", "file": "b.svg"}]}
        }});
        assert_eq!(validate(&data), Vec::<String>::new());
    }

    #[test]
    fn indicator_index_appears_in_error_path() {
        let data = wrap_set(set_with_indicators(json!([
            {"id": "go", "file": "a.svg"},
            {"id": "wait", "file": "b.svg"},
            {"file": "c.svg"}
        ])));
        assert!(validate(&data).contains(
            &"indicator_catalog.indicator_sets['status'].indicators[2]: \
              missing required field 'id'"
                .to_string()
        ));
    }
}
