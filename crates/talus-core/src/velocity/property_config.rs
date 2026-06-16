//! Per-property velocity configuration wire shape.
//!
//! Typed port of the per-property `velocityConfig` consumed by
//! `_calculate_status_score` and `_calculate_numerical_scores` in
//! `backend/core/velocity_engine.py`. Replaces the untyped dict +
//! `velocity_config.get("mode")` dispatch with an internally-tagged enum so
//! each mode carries exactly its own fields.
//!
//! Wire examples:
//!
//! ```json
//! { "enabled": true, "mode": "status",   "statusScores": {"Done": 5} }
//! { "enabled": true, "mode": "checkbox", "checkedScore": 1, "uncheckedScore": 0 }
//! { "enabled": true, "mode": "date",     "approachingWindow": 7,
//!   "approachingPerDay": 1, "overduePerDay": 2, "maxScore": 10 }
//! { "enabled": true, "mode": "multiplier", "multiplierFactor": 2, "penaltyMode": false }
//! ```

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// Default multiplier factor (Python `velocity_config.get("multiplierFactor", 1)`).
fn default_multiplier_factor() -> f64 {
    1.0
}

/// Mode-specific velocity configuration for a single property.
///
/// Internally tagged by the `mode` field so the wire form matches the Python
/// flat dict. Every mode-specific field defaults, mirroring the permissive
/// `.get(key, default)` access in the engine.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "mode")]
pub enum PropertyVelocityMode {
    /// Select-type property scored by current option name.
    Status {
        /// Score per option name (`statusScores`). Missing keys score 0.
        #[serde(default)]
        status_scores: HashMap<String, f64>,
    },
    /// Boolean toggle scored checked / unchecked.
    Checkbox {
        /// Score when checked (`checkedScore`).
        #[serde(default)]
        checked_score: f64,
        /// Score when unchecked (`uncheckedScore`).
        #[serde(default)]
        unchecked_score: f64,
    },
    /// Date-typed property scored by an approaching / overdue ramp.
    Date {
        /// Days before the target during which approaching points accrue.
        #[serde(default)]
        approaching_window: u32,
        /// Points added per day inside the approaching window.
        #[serde(default)]
        approaching_per_day: f64,
        /// Points added per day past the target.
        #[serde(default)]
        overdue_per_day: f64,
        /// Optional cap on the date contribution.
        #[serde(default)]
        max_score: Option<f64>,
    },
    /// Numeric property scored by a multiplier.
    Multiplier {
        /// Multiplier applied to the value (`multiplierFactor`, default 1).
        #[serde(default = "default_multiplier_factor")]
        multiplier_factor: f64,
        /// When true, lower values yield higher scores (`penaltyMode`).
        #[serde(default)]
        penalty_mode: bool,
    },
}

/// A property's full velocity configuration: an `enabled` flag plus the
/// mode-specific settings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PropertyVelocityConfig {
    /// Whether this property contributes to velocity. Defaults to `false`
    /// (mirrors the Python `velocity_config.get("enabled")` truthy check).
    #[serde(default)]
    pub enabled: bool,
    /// Mode-specific configuration.
    #[serde(flatten)]
    pub mode: PropertyVelocityMode,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_status_mode() {
        let cfg: PropertyVelocityConfig = serde_json::from_str(
            r#"{"enabled": true, "mode": "status", "statusScores": {"Done": 5.0}}"#,
        )
        .unwrap();
        assert!(cfg.enabled);
        match cfg.mode {
            PropertyVelocityMode::Status { status_scores } => {
                assert!((status_scores["Done"] - 5.0).abs() < f64::EPSILON);
            }
            other => panic!("expected status, got {other:?}"),
        }
    }

    #[test]
    fn deserializes_checkbox_mode() {
        let cfg: PropertyVelocityConfig = serde_json::from_str(
            r#"{"mode": "checkbox", "checkedScore": 1.0, "uncheckedScore": -1.0}"#,
        )
        .unwrap();
        assert!(!cfg.enabled);
        match cfg.mode {
            PropertyVelocityMode::Checkbox {
                checked_score,
                unchecked_score,
            } => {
                assert!((checked_score - 1.0).abs() < f64::EPSILON);
                assert!((unchecked_score - -1.0).abs() < f64::EPSILON);
            }
            other => panic!("expected checkbox, got {other:?}"),
        }
    }

    #[test]
    fn deserializes_date_mode() {
        let cfg: PropertyVelocityConfig = serde_json::from_str(
            r#"{"mode": "date", "approachingWindow": 7, "approachingPerDay": 1.0,
                "overduePerDay": 2.0, "maxScore": 10.0}"#,
        )
        .unwrap();
        match cfg.mode {
            PropertyVelocityMode::Date {
                approaching_window,
                approaching_per_day,
                overdue_per_day,
                max_score,
            } => {
                assert_eq!(approaching_window, 7);
                assert!((approaching_per_day - 1.0).abs() < f64::EPSILON);
                assert!((overdue_per_day - 2.0).abs() < f64::EPSILON);
                assert_eq!(max_score, Some(10.0));
            }
            other => panic!("expected date, got {other:?}"),
        }
    }

    #[test]
    fn deserializes_multiplier_mode() {
        let cfg: PropertyVelocityConfig = serde_json::from_str(
            r#"{"mode": "multiplier", "multiplierFactor": 2.0, "penaltyMode": true}"#,
        )
        .unwrap();
        match cfg.mode {
            PropertyVelocityMode::Multiplier {
                multiplier_factor,
                penalty_mode,
            } => {
                assert!((multiplier_factor - 2.0).abs() < f64::EPSILON);
                assert!(penalty_mode);
            }
            other => panic!("expected multiplier, got {other:?}"),
        }
    }

    #[test]
    fn serializes_status_with_camel_case() {
        let cfg = PropertyVelocityConfig {
            enabled: true,
            mode: PropertyVelocityMode::Status {
                status_scores: HashMap::new(),
            },
        };
        let json = serde_json::to_string(&cfg).unwrap();
        assert!(json.contains("\"mode\":\"status\""));
        assert!(json.contains("\"statusScores\""));
    }

    #[test]
    fn serializes_multiplier_with_camel_case() {
        let cfg = PropertyVelocityConfig {
            enabled: false,
            mode: PropertyVelocityMode::Multiplier {
                multiplier_factor: 1.0,
                penalty_mode: false,
            },
        };
        let json = serde_json::to_string(&cfg).unwrap();
        assert!(json.contains("\"mode\":\"multiplier\""));
        assert!(json.contains("\"multiplierFactor\""));
        assert!(json.contains("\"penaltyMode\""));
    }

    #[test]
    fn enabled_defaults_to_false() {
        let cfg: PropertyVelocityConfig = serde_json::from_str(r#"{"mode": "checkbox"}"#).unwrap();
        assert!(!cfg.enabled);
    }

    #[test]
    fn multiplier_factor_defaults_to_one() {
        let cfg: PropertyVelocityConfig =
            serde_json::from_str(r#"{"mode": "multiplier"}"#).unwrap();
        match cfg.mode {
            PropertyVelocityMode::Multiplier {
                multiplier_factor, ..
            } => assert!((multiplier_factor - 1.0).abs() < f64::EPSILON),
            other => panic!("expected multiplier, got {other:?}"),
        }
    }

    #[test]
    fn checkbox_scores_default_to_zero() {
        let cfg: PropertyVelocityConfig = serde_json::from_str(r#"{"mode": "checkbox"}"#).unwrap();
        match cfg.mode {
            PropertyVelocityMode::Checkbox {
                checked_score,
                unchecked_score,
            } => {
                assert!(checked_score.abs() < f64::EPSILON);
                assert!(unchecked_score.abs() < f64::EPSILON);
            }
            other => panic!("expected checkbox, got {other:?}"),
        }
    }

    #[test]
    fn date_max_score_defaults_to_none() {
        let cfg: PropertyVelocityConfig = serde_json::from_str(r#"{"mode": "date"}"#).unwrap();
        match cfg.mode {
            PropertyVelocityMode::Date { max_score, .. } => assert_eq!(max_score, None),
            other => panic!("expected date, got {other:?}"),
        }
    }

    #[test]
    fn round_trips_each_mode() {
        let configs = [
            PropertyVelocityConfig {
                enabled: true,
                mode: PropertyVelocityMode::Checkbox {
                    checked_score: 3.0,
                    unchecked_score: 0.0,
                },
            },
            PropertyVelocityConfig {
                enabled: true,
                mode: PropertyVelocityMode::Date {
                    approaching_window: 5,
                    approaching_per_day: 1.5,
                    overdue_per_day: 2.5,
                    max_score: Some(20.0),
                },
            },
        ];
        for cfg in configs {
            let json = serde_json::to_string(&cfg).unwrap();
            let back: PropertyVelocityConfig = serde_json::from_str(&json).unwrap();
            assert_eq!(cfg, back);
        }
    }
}
