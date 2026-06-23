//! Node-level base-score derivation.
//!
//! Ports the "1. Calculate base score from node type" block of
//! `calculate_velocity` in `backend/core/velocity_engine.py`:
//!
//! ```python
//! node_level_config = self._get_node_level_velocity_config(node_type)
//! has_velocity_config = self._has_velocity_config(node_type)
//! if not has_velocity_config:
//!     calc.base_score = -1
//! elif node_level_config and node_level_config.get("baseScore"):
//!     calc.base_score = node_level_config["baseScore"]
//! ```

use crate::node_type::NodeType;

/// Derive a node's base velocity score from its node type.
///
/// * A node type with **no** velocity configuration at all (neither a
///   node-level config nor any enabled per-property config) yields the `-1.0`
///   sentinel. Downstream inheritance uses `max(base, 0)` so this sentinel
///   marks "no own velocity" without leaking negative points to children.
/// * Otherwise, a node-level config with a **truthy** `baseScore` contributes
///   that value. Python gates on truthiness, so a `baseScore` of exactly `0.0`
///   is treated as unset and contributes `0.0` (the same as having no
///   node-level config).
#[must_use]
pub fn base_score(_node_type: &NodeType) -> f64 {
    0.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::PropertyId;
    use crate::velocity::{
        NodeVelocityConfig, PropertyVelocityConfig, PropertyVelocityMode, ScoreMode,
    };

    fn approx(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 1e-9,
            "expected {expected}, got {actual}"
        );
    }

    fn node_cfg(base: f64) -> NodeVelocityConfig {
        NodeVelocityConfig {
            base_score: base,
            score_mode: ScoreMode::Fixed,
        }
    }

    fn enabled_checkbox(pid: PropertyId) -> (PropertyId, PropertyVelocityConfig) {
        (
            pid,
            PropertyVelocityConfig {
                enabled: true,
                mode: PropertyVelocityMode::Checkbox {
                    checked_score: 5.0,
                    unchecked_score: 0.0,
                },
            },
        )
    }

    #[test]
    fn no_velocity_config_yields_minus_one_sentinel() {
        let nt = NodeType::new("Task");
        approx(base_score(&nt), -1.0);
    }

    #[test]
    fn node_level_positive_base_score_is_used() {
        let nt = NodeType::new("Task").with_velocity_config(node_cfg(7.0));
        approx(base_score(&nt), 7.0);
    }

    #[test]
    fn node_level_negative_base_score_is_used() {
        // Python truthiness: a non-zero baseScore (incl. negative) is used.
        let nt = NodeType::new("Task").with_velocity_config(node_cfg(-3.0));
        approx(base_score(&nt), -3.0);
    }

    #[test]
    fn node_level_zero_base_score_is_treated_as_unset() {
        let nt = NodeType::new("Task").with_velocity_config(node_cfg(0.0));
        approx(base_score(&nt), 0.0);
    }

    #[test]
    fn property_config_only_yields_zero_not_sentinel() {
        // has_velocity_config() is true (enabled property config), but there is
        // no node-level baseScore, so the base score is 0.0 — not the -1.0
        // sentinel reserved for node types with no velocity config at all.
        let pid = PropertyId::new();
        let (pid, cfg) = enabled_checkbox(pid);
        let nt = NodeType::new("Task").with_property_velocity_config(pid, cfg);
        approx(base_score(&nt), 0.0);
    }
}
