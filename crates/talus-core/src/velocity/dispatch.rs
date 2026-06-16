//! Node-level velocity dispatch.
//!
//! Walks a node type's per-property velocity configs, reads the matching
//! values off a node, and sums each property's contribution. These are the
//! typed ports of the `_calculate_*` accumulators in
//! `backend/core/velocity_engine.py` that fan out to the per-property leaf
//! functions (`numerical_contribution`, etc.).

use crate::node::Node;
use crate::node_type::NodeType;

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
pub fn numerical_score(_node: &Node, _node_type: &NodeType) -> f64 {
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
}
