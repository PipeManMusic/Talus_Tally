//! Per-node velocity calculation result.
//!
//! Port of the `VelocityCalculation` dataclass from
//! `backend/core/velocity_engine.py`. The Python `__post_init__`:
//!
//! * defaults `blocked_by_nodes` / `blocks_node_ids` from `None` to `[]`
//!   (handled here by `Vec`, which is simply empty), and
//! * rounds all seven float score fields to two decimal places.
//!
//! Rounding mirrors Python's `round(x, 2)`, which rounds half to even
//! (banker's rounding) on the underlying binary float. We replicate that by
//! scaling by 100 and using [`f64::round_ties_even`].

use serde::{Deserialize, Serialize};

use crate::ids::NodeId;

/// Round a value to two decimal places, ties to even (Python `round(x, 2)`).
///
/// Formatting to two decimals and parsing back rounds the *actual* stored
/// binary value, matching `CPython`'s `round`. A naive `(x * 100).round() / 100`
/// instead rounds the product, which differs for values like `3.335` whose
/// scaled form (`333.5000…`) crosses the tie boundary the original never did.
fn round2(value: f64) -> f64 {
    format!("{value:.2}").parse().unwrap_or(value)
}

/// Velocity score breakdown for a single node.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VelocityCalculation {
    /// The node this calculation belongs to.
    pub node_id: NodeId,
    /// Own base score from the node type's velocity config.
    pub base_score: f64,
    /// Score inherited from the parent chain.
    pub inherited_score: f64,
    /// Score from status / checkbox / date properties.
    pub status_score: f64,
    /// Score from numerical-property multipliers.
    pub numerical_score: f64,
    /// Penalty applied when this node is blocked.
    pub blocking_penalty: f64,
    /// Bonus accrued from nodes this node blocks.
    pub blocking_bonus: f64,
    /// Final velocity total (0 when blocked).
    pub total_velocity: f64,
    /// Whether this node is currently blocked.
    pub is_blocked: bool,
    /// Nodes blocking this node (direct or via an ancestor).
    pub blocked_by_nodes: Vec<NodeId>,
    /// Nodes that this node blocks.
    pub blocks_node_ids: Vec<NodeId>,
}

impl VelocityCalculation {
    /// Create an all-zero calculation for `node_id` with empty blocking lists.
    ///
    /// Mirrors the Python `VelocityCalculation(node_id=node_id)` used for the
    /// cycle-detection and no-config cases.
    #[must_use]
    pub fn zeroed(node_id: NodeId) -> Self {
        Self {
            node_id,
            base_score: 0.0,
            inherited_score: 0.0,
            status_score: 0.0,
            numerical_score: 0.0,
            blocking_penalty: 0.0,
            blocking_bonus: 0.0,
            total_velocity: 0.0,
            is_blocked: false,
            blocked_by_nodes: Vec::new(),
            blocks_node_ids: Vec::new(),
        }
    }

    /// Round all seven float score fields to two decimals (Python parity for
    /// the `__post_init__` rounding loop). Consumes and returns `self`.
    #[must_use]
    pub fn rounded(mut self) -> Self {
        self.base_score = round2(self.base_score);
        self.inherited_score = round2(self.inherited_score);
        self.status_score = round2(self.status_score);
        self.numerical_score = round2(self.numerical_score);
        self.blocking_penalty = round2(self.blocking_penalty);
        self.blocking_bonus = round2(self.blocking_bonus);
        self.total_velocity = round2(self.total_velocity);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nid() -> NodeId {
        NodeId::new()
    }

    #[test]
    fn zeroed_has_all_zero_scores() {
        let c = VelocityCalculation::zeroed(nid());
        assert!(c.base_score.abs() < f64::EPSILON);
        assert!(c.inherited_score.abs() < f64::EPSILON);
        assert!(c.status_score.abs() < f64::EPSILON);
        assert!(c.numerical_score.abs() < f64::EPSILON);
        assert!(c.blocking_penalty.abs() < f64::EPSILON);
        assert!(c.blocking_bonus.abs() < f64::EPSILON);
        assert!(c.total_velocity.abs() < f64::EPSILON);
    }

    #[test]
    fn zeroed_is_not_blocked_and_has_empty_lists() {
        let c = VelocityCalculation::zeroed(nid());
        assert!(!c.is_blocked);
        assert!(c.blocked_by_nodes.is_empty());
        assert!(c.blocks_node_ids.is_empty());
    }

    #[test]
    fn rounded_truncates_to_two_decimals() {
        let mut c = VelocityCalculation::zeroed(nid());
        c.base_score = 1.234;
        c.total_velocity = 9.876;
        let c = c.rounded();
        assert!((c.base_score - 1.23).abs() < f64::EPSILON);
        assert!((c.total_velocity - 9.88).abs() < f64::EPSILON);
    }

    #[test]
    fn rounded_applies_to_all_float_fields() {
        let mut c = VelocityCalculation::zeroed(nid());
        c.base_score = 1.111;
        c.inherited_score = 2.226;
        c.status_score = 3.335;
        c.numerical_score = 4.444;
        c.blocking_penalty = 5.555;
        c.blocking_bonus = 6.666;
        c.total_velocity = 7.777;
        let c = c.rounded();
        assert!((c.base_score - 1.11).abs() < f64::EPSILON);
        assert!((c.inherited_score - 2.23).abs() < f64::EPSILON);
        assert!((c.status_score - 3.33).abs() < f64::EPSILON);
        assert!((c.numerical_score - 4.44).abs() < f64::EPSILON);
        assert!((c.blocking_penalty - 5.55).abs() < f64::EPSILON);
        assert!((c.blocking_bonus - 6.67).abs() < f64::EPSILON);
        assert!((c.total_velocity - 7.78).abs() < f64::EPSILON);
    }

    #[test]
    fn rounded_handles_negative_values() {
        let mut c = VelocityCalculation::zeroed(nid());
        c.base_score = -1.0;
        c.status_score = -2.349;
        let c = c.rounded();
        assert!((c.base_score - -1.0).abs() < f64::EPSILON);
        assert!((c.status_score - -2.35).abs() < f64::EPSILON);
    }

    #[test]
    fn rounded_ties_round_to_even() {
        // Python round() is banker's rounding: 0.125 -> 0.12, 0.135 -> 0.14.
        let mut c = VelocityCalculation::zeroed(nid());
        c.base_score = 0.125;
        c.status_score = 0.135;
        let c = c.rounded();
        assert!((c.base_score - 0.12).abs() < f64::EPSILON);
        assert!((c.status_score - 0.14).abs() < f64::EPSILON);
    }

    #[test]
    fn rounded_leaves_already_rounded_values() {
        let mut c = VelocityCalculation::zeroed(nid());
        c.base_score = 3.5;
        c.total_velocity = 10.0;
        let c = c.rounded();
        assert!((c.base_score - 3.5).abs() < f64::EPSILON);
        assert!((c.total_velocity - 10.0).abs() < f64::EPSILON);
    }

    #[test]
    fn serde_round_trips() {
        let mut c = VelocityCalculation::zeroed(nid());
        c.base_score = 1.23;
        c.is_blocked = true;
        let json = serde_json::to_string(&c).unwrap();
        let back: VelocityCalculation = serde_json::from_str(&json).unwrap();
        assert_eq!(c, back);
    }
}
