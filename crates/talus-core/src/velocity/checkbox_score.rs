//! Checkbox-property velocity contribution.
//!
//! Pure port of the `mode == "checkbox"` branch of `_calculate_status_score`
//! in `backend/core/velocity_engine.py`:
//!
//! ```python
//! is_checked = current_value is True or (
//!     isinstance(current_value, str)
//!     and current_value.strip().lower() == "true"
//! )
//! if is_checked:
//!     score += velocity_config.get("checkedScore", 0) or 0
//! else:
//!     score += velocity_config.get("uncheckedScore", 0) or 0
//! ```

/// A stored checkbox property value, capturing the Python parity surface.
///
/// Only a literal boolean `true` or the case-insensitive, trimmed string
/// `"true"` counts as checked. Everything else — `false`, other strings,
/// numbers, or an absent value — is unchecked.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CheckboxValue {
    /// A real boolean value.
    Bool(bool),
    /// A string value (e.g. persisted by serializers as `"true"`/`"false"`).
    Text(String),
    /// The value is missing or of a type that never counts as checked.
    Unset,
}

/// Scores awarded for a checkbox property's checked / unchecked states.
///
/// Mirrors the Python `checkedScore` / `uncheckedScore` keys, which default
/// to `0` when absent. The caller is responsible for that default at
/// deserialization time.
#[derive(Debug, Clone, PartialEq)]
pub struct CheckboxVelocityConfig {
    /// Score added when the checkbox is checked.
    pub checked_score: f64,
    /// Score added when the checkbox is unchecked.
    pub unchecked_score: f64,
}

/// Determine whether a checkbox value counts as checked (Python parity).
#[must_use]
pub fn is_checkbox_checked(value: &CheckboxValue) -> bool {
    match value {
        CheckboxValue::Bool(b) => *b,
        CheckboxValue::Text(s) => s.trim().eq_ignore_ascii_case("true"),
        CheckboxValue::Unset => false,
    }
}

/// Compute the velocity contribution of a checkbox property.
#[must_use]
pub fn checkbox_contribution(value: &CheckboxValue, config: &CheckboxVelocityConfig) -> f64 {
    if is_checkbox_checked(value) {
        config.checked_score
    } else {
        config.unchecked_score
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(checked: f64, unchecked: f64) -> CheckboxVelocityConfig {
        CheckboxVelocityConfig {
            checked_score: checked,
            unchecked_score: unchecked,
        }
    }

    #[test]
    fn bool_true_is_checked() {
        assert!(is_checkbox_checked(&CheckboxValue::Bool(true)));
    }

    #[test]
    fn bool_false_is_unchecked() {
        assert!(!is_checkbox_checked(&CheckboxValue::Bool(false)));
    }

    #[test]
    fn string_true_is_checked() {
        assert!(is_checkbox_checked(&CheckboxValue::Text("true".into())));
    }

    #[test]
    fn string_true_is_case_insensitive() {
        assert!(is_checkbox_checked(&CheckboxValue::Text("TRUE".into())));
        assert!(is_checkbox_checked(&CheckboxValue::Text("True".into())));
    }

    #[test]
    fn string_true_is_trimmed() {
        assert!(is_checkbox_checked(&CheckboxValue::Text("  true  ".into())));
    }

    #[test]
    fn string_false_is_unchecked() {
        assert!(!is_checkbox_checked(&CheckboxValue::Text("false".into())));
    }

    #[test]
    fn other_string_is_unchecked() {
        assert!(!is_checkbox_checked(&CheckboxValue::Text("yes".into())));
        assert!(!is_checkbox_checked(&CheckboxValue::Text("1".into())));
    }

    #[test]
    fn unset_is_unchecked() {
        assert!(!is_checkbox_checked(&CheckboxValue::Unset));
    }

    #[test]
    fn checked_value_awards_checked_score() {
        let c = cfg(5.0, -1.0);
        assert!((checkbox_contribution(&CheckboxValue::Bool(true), &c) - 5.0).abs() < f64::EPSILON);
    }

    #[test]
    fn unchecked_value_awards_unchecked_score() {
        let c = cfg(5.0, -1.0);
        assert!(
            (checkbox_contribution(&CheckboxValue::Bool(false), &c) - -1.0).abs() < f64::EPSILON
        );
    }

    #[test]
    fn string_true_awards_checked_score() {
        let c = cfg(3.0, 0.0);
        assert!(
            (checkbox_contribution(&CheckboxValue::Text("true".into()), &c) - 3.0).abs()
                < f64::EPSILON
        );
    }

    #[test]
    fn unset_awards_unchecked_score() {
        let c = cfg(3.0, 2.0);
        assert!((checkbox_contribution(&CheckboxValue::Unset, &c) - 2.0).abs() < f64::EPSILON);
    }
}
