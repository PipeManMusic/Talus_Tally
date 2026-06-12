//! Status-property velocity contribution.
//!
//! Pure port of the `mode == "status"` branch of `_calculate_status_score`
//! in `backend/core/velocity_engine.py`:
//!
//! ```python
//! status_scores = velocity_config.get("statusScores", {})
//! lookup_value = current_value
//! if current_value and prop.get("type") == "select":
//!     for option in prop.get("options", []):
//!         if isinstance(option, dict) and option.get("id") == current_value:
//!             lookup_value = option.get("name")
//!             break
//! score += status_scores.get(lookup_value, 0) or 0
//! ```

use std::collections::HashMap;
use std::hash::BuildHasher;

/// A select-property option, used to resolve a UUID-backed stored value to
/// the option name that `statusScores` is keyed by.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SelectOption {
    /// The option's stable identifier (often a UUID).
    pub id: String,
    /// The human-readable option name used for scoring lookups.
    pub name: String,
}

/// Compute the velocity contribution of a status (select) property.
///
/// `current_value` is the stored property value (an option id or a plain
/// name); `None` or an empty string contributes 0. When `options` are
/// supplied (i.e. the property is a select), a value matching an option's
/// `id` resolves to that option's `name` before the `status_scores` lookup
/// (first match wins, mirroring the Python `break`). Unknown keys score 0.
#[must_use]
pub fn status_contribution<S: BuildHasher>(
    current_value: Option<&str>,
    options: &[SelectOption],
    status_scores: &HashMap<String, f64, S>,
) -> f64 {
    let _ = (current_value, options, status_scores);
    0.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scores(pairs: &[(&str, f64)]) -> HashMap<String, f64> {
        pairs.iter().map(|(k, v)| ((*k).to_string(), *v)).collect()
    }

    fn opt(id: &str, name: &str) -> SelectOption {
        SelectOption {
            id: id.to_string(),
            name: name.to_string(),
        }
    }

    #[test]
    fn plain_name_match_returns_score() {
        let s = scores(&[("Done", 5.0)]);
        assert!((status_contribution(Some("Done"), &[], &s) - 5.0).abs() < f64::EPSILON);
    }

    #[test]
    fn unknown_name_returns_zero() {
        let s = scores(&[("Done", 5.0)]);
        assert!((status_contribution(Some("Pending"), &[], &s) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn none_value_returns_zero() {
        let s = scores(&[("Done", 5.0)]);
        assert!((status_contribution(None, &[], &s) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn empty_value_returns_zero() {
        let s = scores(&[("Done", 5.0)]);
        assert!((status_contribution(Some(""), &[], &s) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn uuid_backed_value_resolves_to_option_name() {
        let s = scores(&[("In Progress", 3.0)]);
        let options = [opt("uuid-123", "In Progress")];
        assert!((status_contribution(Some("uuid-123"), &options, &s) - 3.0).abs() < f64::EPSILON);
    }

    #[test]
    fn unmatched_uuid_falls_back_to_raw_lookup() {
        let s = scores(&[("uuid-x", 7.0)]);
        let options = [opt("uuid-123", "In Progress")];
        // Value isn't an option id, so it's looked up raw and happens to hit.
        assert!((status_contribution(Some("uuid-x"), &options, &s) - 7.0).abs() < f64::EPSILON);
    }

    #[test]
    fn unmatched_uuid_with_no_raw_entry_returns_zero() {
        let s = scores(&[("In Progress", 3.0)]);
        let options = [opt("uuid-123", "In Progress")];
        assert!((status_contribution(Some("uuid-999"), &options, &s) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn resolution_picks_first_matching_option() {
        let s = scores(&[("First", 1.0), ("Second", 2.0)]);
        let options = [opt("dup", "First"), opt("dup", "Second")];
        assert!((status_contribution(Some("dup"), &options, &s) - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn negative_score_is_returned() {
        let s = scores(&[("Blocked", -4.0)]);
        assert!((status_contribution(Some("Blocked"), &[], &s) - -4.0).abs() < f64::EPSILON);
    }

    #[test]
    fn zero_score_entry_returns_zero() {
        let s = scores(&[("Neutral", 0.0)]);
        assert!((status_contribution(Some("Neutral"), &[], &s) - 0.0).abs() < f64::EPSILON);
    }
}
