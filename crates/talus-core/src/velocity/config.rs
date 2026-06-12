//! Node-level velocity configuration.
//!
//! Wire shape for the node-type-level `velocityConfig` consumed by
//! `_get_node_level_velocity_config` in `backend/core/velocity_engine.py`:
//!
//! ```json
//! { "baseScore": 5, "scoreMode": "inherit" }
//! ```
//!
//! Both fields are optional on the wire. A missing `baseScore` deserializes
//! to `0.0` (which the engine treats as "unset" via a truthy check); a
//! missing `scoreMode` deserializes to [`ScoreMode::Fixed`], matching the
//! Python behaviour where a present config without `scoreMode` does not
//! inherit.

use serde::{Deserialize, Serialize};

use super::mode::ScoreMode;

/// Node-type-level velocity configuration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NodeVelocityConfig {
    /// Base score for the node type. `0.0` (the default) is treated as unset
    /// by the engine's truthy check.
    #[serde(default)]
    pub base_score: f64,
    /// Whether the node's score inherits from its parent. Defaults to
    /// [`ScoreMode::Fixed`] (no inheritance) when absent.
    #[serde(default)]
    pub score_mode: ScoreMode,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_camel_case_fields() {
        let cfg: NodeVelocityConfig =
            serde_json::from_str(r#"{"baseScore": 5.0, "scoreMode": "inherit"}"#).unwrap();
        assert!((cfg.base_score - 5.0).abs() < f64::EPSILON);
        assert_eq!(cfg.score_mode, ScoreMode::Inherit);
    }

    #[test]
    fn serializes_to_camel_case_fields() {
        let cfg = NodeVelocityConfig {
            base_score: 3.0,
            score_mode: ScoreMode::Fixed,
        };
        let json = serde_json::to_string(&cfg).unwrap();
        assert!(json.contains("\"baseScore\""));
        assert!(json.contains("\"scoreMode\""));
        assert!(json.contains("\"fixed\""));
    }

    #[test]
    fn missing_base_score_defaults_to_zero() {
        let cfg: NodeVelocityConfig = serde_json::from_str(r#"{"scoreMode": "inherit"}"#).unwrap();
        assert!(cfg.base_score.abs() < f64::EPSILON);
        assert_eq!(cfg.score_mode, ScoreMode::Inherit);
    }

    #[test]
    fn missing_score_mode_defaults_to_fixed() {
        let cfg: NodeVelocityConfig = serde_json::from_str(r#"{"baseScore": 2.0}"#).unwrap();
        assert!((cfg.base_score - 2.0).abs() < f64::EPSILON);
        assert_eq!(cfg.score_mode, ScoreMode::Fixed);
    }

    #[test]
    fn empty_object_uses_all_defaults() {
        let cfg: NodeVelocityConfig = serde_json::from_str("{}").unwrap();
        assert!(cfg.base_score.abs() < f64::EPSILON);
        assert_eq!(cfg.score_mode, ScoreMode::Fixed);
    }

    #[test]
    fn round_trips_through_json() {
        let cfg = NodeVelocityConfig {
            base_score: 7.5,
            score_mode: ScoreMode::Inherit,
        };
        let json = serde_json::to_string(&cfg).unwrap();
        let back: NodeVelocityConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(cfg, back);
    }
}
