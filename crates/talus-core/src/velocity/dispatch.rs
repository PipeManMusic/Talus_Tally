//! Node-level velocity dispatch.
//!
//! Walks a node type's per-property velocity configs, reads the matching
//! values off a node, and sums each property's contribution. These are the
//! typed ports of the `_calculate_*` accumulators in
//! `backend/core/velocity_engine.py` that fan out to the per-property leaf
//! functions (`numerical_contribution`, etc.).

use chrono::NaiveDate;

use crate::node::Node;
use crate::node_type::NodeType;
use crate::property::Property;
use crate::velocity::{
    numerical_contribution, parse_currency_value, NumericalVelocityConfig, PropertyVelocityMode,
};

/// Sum the multiplier (numerical) velocity contributions for a node.
///
/// Ports `_calculate_numerical_scores`. Iterates the node type's
/// per-property velocity configs (not the node's stored values) so that a
/// property carrying a multiplier config but no value on the node still
/// contributes — Python defaults the missing value to `0`, which matters in
/// penalty mode where `(100 - 0) * factor` is non-zero.
///
/// Only `Multiplier`-mode, enabled configs participate. The value is read
/// from the node as a finite number: a [`crate::property::Property::Number`]
/// is used directly, a [`crate::property::Property::Text`] is currency-parsed
/// (and skipped if unparseable), an absent value is treated as `0`, and any
/// other typed value is skipped (Python's `isinstance(value, (int, float))`
/// guard).
#[must_use]
pub fn numerical_score(node: &Node, node_type: &NodeType) -> f64 {
    let mut score = 0.0;
    for (pid, config) in node_type.property_velocity_configs() {
        if !config.enabled {
            continue;
        }
        let PropertyVelocityMode::Multiplier {
            multiplier_factor,
            penalty_mode,
        } = &config.mode
        else {
            continue;
        };
        let value = match node.properties().get(&pid) {
            None => 0.0,
            Some(Property::Number(n)) => *n,
            Some(Property::Text(text)) => match parse_currency_value(text) {
                Some(parsed) => parsed,
                None => continue,
            },
            Some(_) => continue,
        };
        score += numerical_contribution(
            value,
            &NumericalVelocityConfig {
                multiplier: *multiplier_factor,
                penalty_mode: *penalty_mode,
            },
        );
    }
    score
}

/// Sum the status / checkbox / date velocity contributions for a node.
///
/// Ports `_calculate_status_score`, which bundles three velocity modes into
/// one accumulator. `today` is supplied by the caller so this stays
/// I/O-free (the engine never reads the clock itself).
///
/// * `Checkbox` — the node value is read as a [`CheckboxValue`]
///   ([`Property::Boolean`] → `Bool`, [`Property::Text`] → `Text`, absent or
///   any other typed value → `Unset`) and scored via
///   [`checkbox_contribution`].
/// * `Date` — the node value is resolved to a date ([`Property::DateIso`]
///   directly, [`Property::Text`] via [`parse_date_value`], anything else →
///   no contribution), then `days_until = target - today` feeds
///   [`date_velocity_contribution`].
/// * `Status` — select-option scoring is deferred until node types carry
///   their option lists, so these configs currently contribute nothing.
/// * `Multiplier` — handled by [`numerical_score`]; skipped here.
#[must_use]
pub fn status_score(_node: &Node, _node_type: &NodeType, _today: NaiveDate) -> f64 {
    0.0
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::ids::PropertyId;
    use crate::property::Property;
    use crate::velocity::{PropertyVelocityConfig, PropertyVelocityMode};

    fn mult(enabled: bool, factor: f64, penalty: bool) -> PropertyVelocityConfig {
        PropertyVelocityConfig {
            enabled,
            mode: PropertyVelocityMode::Multiplier {
                multiplier_factor: factor,
                penalty_mode: penalty,
            },
        }
    }

    fn approx(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 1e-9,
            "expected {expected}, got {actual}"
        );
    }

    #[test]
    fn no_configs_scores_zero() {
        let nt = NodeType::new("Task");
        let node = Node::new(nt.id(), "n");
        approx(numerical_score(&node, &nt), 0.0);
    }

    #[test]
    fn normal_mode_multiplies_number_value() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task").with_property_velocity_config(pid, mult(true, 2.0, false));
        let node = Node::new(nt.id(), "n").with_property(pid, Property::Number(5.0));
        approx(numerical_score(&node, &nt), 10.0);
    }

    #[test]
    fn penalty_mode_inverts_number_value() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task").with_property_velocity_config(pid, mult(true, 1.0, true));
        let node = Node::new(nt.id(), "n").with_property(pid, Property::Number(20.0));
        // (100 - 20) * 1 = 80
        approx(numerical_score(&node, &nt), 80.0);
    }

    #[test]
    fn missing_value_treated_as_zero_in_penalty_mode() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task").with_property_velocity_config(pid, mult(true, 1.0, true));
        // Node has NO value for pid; Python defaults to 0 => (100 - 0) * 1 = 100.
        let node = Node::new(nt.id(), "n");
        approx(numerical_score(&node, &nt), 100.0);
    }

    #[test]
    fn missing_value_treated_as_zero_in_normal_mode() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task").with_property_velocity_config(pid, mult(true, 3.0, false));
        let node = Node::new(nt.id(), "n");
        approx(numerical_score(&node, &nt), 0.0);
    }

    #[test]
    fn currency_text_value_is_parsed() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task").with_property_velocity_config(pid, mult(true, 1.0, false));
        let node =
            Node::new(nt.id(), "n").with_property(pid, Property::Text("$1,234.56".to_string()));
        approx(numerical_score(&node, &nt), 1234.56);
    }

    #[test]
    fn unparseable_text_value_is_skipped() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task").with_property_velocity_config(pid, mult(true, 2.0, false));
        let node = Node::new(nt.id(), "n").with_property(pid, Property::Text("n/a".to_string()));
        approx(numerical_score(&node, &nt), 0.0);
    }

    #[test]
    fn disabled_config_is_skipped() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task").with_property_velocity_config(pid, mult(false, 2.0, false));
        let node = Node::new(nt.id(), "n").with_property(pid, Property::Number(5.0));
        approx(numerical_score(&node, &nt), 0.0);
    }

    #[test]
    fn non_multiplier_mode_is_skipped() {
        let pid = PropertyId::new();
        let cfg = PropertyVelocityConfig {
            enabled: true,
            mode: PropertyVelocityMode::Checkbox {
                checked_score: 5.0,
                unchecked_score: 0.0,
            },
        };
        let nt = NodeType::new("Task").with_property_velocity_config(pid, cfg);
        let node = Node::new(nt.id(), "n").with_property(pid, Property::Number(5.0));
        approx(numerical_score(&node, &nt), 0.0);
    }

    #[test]
    fn non_numeric_value_is_skipped() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task").with_property_velocity_config(pid, mult(true, 2.0, false));
        let node = Node::new(nt.id(), "n").with_property(pid, Property::Boolean(true));
        approx(numerical_score(&node, &nt), 0.0);
    }

    #[test]
    fn multiple_multiplier_props_accumulate() {
        let pid1 = PropertyId::new();
        let pid2 = PropertyId::new();
        let nt = NodeType::new("Task")
            .with_property_velocity_config(pid1, mult(true, 2.0, false))
            .with_property_velocity_config(pid2, mult(true, 10.0, false));
        let node = Node::new(nt.id(), "n")
            .with_property(pid1, Property::Number(3.0))
            .with_property(pid2, Property::Number(4.0));
        // 3*2 + 4*10 = 46
        approx(numerical_score(&node, &nt), 46.0);
    }

    // --- status_score (checkbox + date branches) ---

    use chrono::NaiveDate;

    fn checkbox(enabled: bool, checked: f64, unchecked: f64) -> PropertyVelocityConfig {
        PropertyVelocityConfig {
            enabled,
            mode: PropertyVelocityMode::Checkbox {
                checked_score: checked,
                unchecked_score: unchecked,
            },
        }
    }

    fn date_cfg(
        enabled: bool,
        window: u32,
        per_day: f64,
        overdue_per_day: f64,
        max_score: Option<f64>,
    ) -> PropertyVelocityConfig {
        PropertyVelocityConfig {
            enabled,
            mode: PropertyVelocityMode::Date {
                approaching_window: window,
                approaching_per_day: per_day,
                overdue_per_day,
                max_score,
            },
        }
    }

    fn ymd(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    #[test]
    fn status_score_no_configs_is_zero() {
        let nt = NodeType::new("Task");
        let node = Node::new(nt.id(), "n");
        approx(status_score(&node, &nt, ymd(2026, 6, 17)), 0.0);
    }

    #[test]
    fn checkbox_checked_bool_scores_checked() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task").with_property_velocity_config(pid, checkbox(true, 5.0, 1.0));
        let node = Node::new(nt.id(), "n").with_property(pid, Property::Boolean(true));
        approx(status_score(&node, &nt, ymd(2026, 6, 17)), 5.0);
    }

    #[test]
    fn checkbox_unchecked_bool_scores_unchecked() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task").with_property_velocity_config(pid, checkbox(true, 5.0, 1.0));
        let node = Node::new(nt.id(), "n").with_property(pid, Property::Boolean(false));
        approx(status_score(&node, &nt, ymd(2026, 6, 17)), 1.0);
    }

    #[test]
    fn checkbox_missing_value_scores_unchecked() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task").with_property_velocity_config(pid, checkbox(true, 5.0, 2.0));
        let node = Node::new(nt.id(), "n");
        approx(status_score(&node, &nt, ymd(2026, 6, 17)), 2.0);
    }

    #[test]
    fn checkbox_text_true_scores_checked() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task").with_property_velocity_config(pid, checkbox(true, 7.0, 0.0));
        let node = Node::new(nt.id(), "n").with_property(pid, Property::Text(" TRUE ".to_string()));
        approx(status_score(&node, &nt, ymd(2026, 6, 17)), 7.0);
    }

    #[test]
    fn checkbox_disabled_is_skipped() {
        let pid = PropertyId::new();
        let nt =
            NodeType::new("Task").with_property_velocity_config(pid, checkbox(false, 5.0, 1.0));
        let node = Node::new(nt.id(), "n").with_property(pid, Property::Boolean(true));
        approx(status_score(&node, &nt, ymd(2026, 6, 17)), 0.0);
    }

    #[test]
    fn date_iso_overdue_accrues() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task")
            .with_property_velocity_config(pid, date_cfg(true, 0, 0.0, 3.0, None));
        // target 2 days before today => days_until = -2 => 2 * 3 = 6
        let node = Node::new(nt.id(), "n").with_property(
            pid,
            Property::DateIso {
                year: 2026,
                month: 6,
                day: 15,
            },
        );
        approx(status_score(&node, &nt, ymd(2026, 6, 17)), 6.0);
    }

    #[test]
    fn date_iso_approaching_ramps() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task")
            .with_property_velocity_config(pid, date_cfg(true, 5, 2.0, 0.0, None));
        // target 3 days after today => days_until = 3 => (5 - 3) * 2 = 4
        let node = Node::new(nt.id(), "n").with_property(
            pid,
            Property::DateIso {
                year: 2026,
                month: 6,
                day: 20,
            },
        );
        approx(status_score(&node, &nt, ymd(2026, 6, 17)), 4.0);
    }

    #[test]
    fn date_text_value_is_parsed() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task")
            .with_property_velocity_config(pid, date_cfg(true, 0, 0.0, 1.0, None));
        // "2026-06-12" => 5 days before 2026-06-17 => 5 * 1 = 5
        let node =
            Node::new(nt.id(), "n").with_property(pid, Property::Text("2026-06-12".to_string()));
        approx(status_score(&node, &nt, ymd(2026, 6, 17)), 5.0);
    }

    #[test]
    fn date_unparseable_text_contributes_zero() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task")
            .with_property_velocity_config(pid, date_cfg(true, 0, 0.0, 1.0, None));
        let node = Node::new(nt.id(), "n").with_property(pid, Property::Text("soon".to_string()));
        approx(status_score(&node, &nt, ymd(2026, 6, 17)), 0.0);
    }

    #[test]
    fn date_missing_value_contributes_zero() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task")
            .with_property_velocity_config(pid, date_cfg(true, 0, 0.0, 1.0, None));
        let node = Node::new(nt.id(), "n");
        approx(status_score(&node, &nt, ymd(2026, 6, 17)), 0.0);
    }

    #[test]
    fn checkbox_and_date_accumulate() {
        let pid_cb = PropertyId::new();
        let pid_dt = PropertyId::new();
        let nt = NodeType::new("Task")
            .with_property_velocity_config(pid_cb, checkbox(true, 10.0, 0.0))
            .with_property_velocity_config(pid_dt, date_cfg(true, 0, 0.0, 2.0, None));
        let node = Node::new(nt.id(), "n")
            .with_property(pid_cb, Property::Boolean(true))
            .with_property(
                pid_dt,
                Property::DateIso {
                    year: 2026,
                    month: 6,
                    day: 16,
                },
            );
        // 10 (checked) + 1 day overdue * 2 = 12
        approx(status_score(&node, &nt, ymd(2026, 6, 17)), 12.0);
    }

    #[test]
    fn multiplier_mode_skipped_by_status_score() {
        let pid = PropertyId::new();
        let nt = NodeType::new("Task").with_property_velocity_config(pid, mult(true, 2.0, false));
        let node = Node::new(nt.id(), "n").with_property(pid, Property::Number(5.0));
        approx(status_score(&node, &nt, ymd(2026, 6, 17)), 0.0);
    }
}
