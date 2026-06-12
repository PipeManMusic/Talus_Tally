//! Velocity mode enumerations.
//!
//! Typed replacements for the magic mode strings in
//! `backend/core/velocity_engine.py`:
//!
//! * `ScoreMode` mirrors the node-level `velocityConfig.scoreMode`
//!   (`ScoreMode` Python enum: `INHERIT = "inherit"`, `FIXED = "fixed"`).
//! * `VelocityMode` mirrors the per-property `velocityConfig.mode` string
//!   (`"status"`, `"checkbox"`, `"date"`, `"multiplier"`).

use serde::{Deserialize, Serialize};

/// How a node-level base score is derived.
///
/// Wire format is the lowercase string used by the Python `ScoreMode` enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ScoreMode {
    /// Inherit the base score from the parent (`"inherit"`).
    Inherit,
    /// Use a fixed base score defined on the node type (`"fixed"`).
    Fixed,
}

/// Which scoring rule a per-property `velocityConfig` applies.
///
/// Wire format is the lowercase string stored in `velocityConfig.mode`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VelocityMode {
    /// Select-type property scored by current option name (`"status"`).
    Status,
    /// Boolean toggle scored checked / unchecked (`"checkbox"`).
    Checkbox,
    /// Date-typed property scored by an approaching / overdue ramp (`"date"`).
    Date,
    /// Numeric property scored by a multiplier (`"multiplier"`).
    Multiplier,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn score_mode_serializes_to_lowercase() {
        assert_eq!(
            serde_json::to_string(&ScoreMode::Inherit).unwrap(),
            "\"inherit\""
        );
        assert_eq!(
            serde_json::to_string(&ScoreMode::Fixed).unwrap(),
            "\"fixed\""
        );
    }

    #[test]
    fn score_mode_deserializes_from_lowercase() {
        assert_eq!(
            serde_json::from_str::<ScoreMode>("\"inherit\"").unwrap(),
            ScoreMode::Inherit
        );
        assert_eq!(
            serde_json::from_str::<ScoreMode>("\"fixed\"").unwrap(),
            ScoreMode::Fixed
        );
    }

    #[test]
    fn score_mode_rejects_unknown_value() {
        assert!(serde_json::from_str::<ScoreMode>("\"sideways\"").is_err());
    }

    #[test]
    fn velocity_mode_serializes_to_lowercase() {
        assert_eq!(
            serde_json::to_string(&VelocityMode::Status).unwrap(),
            "\"status\""
        );
        assert_eq!(
            serde_json::to_string(&VelocityMode::Checkbox).unwrap(),
            "\"checkbox\""
        );
        assert_eq!(
            serde_json::to_string(&VelocityMode::Date).unwrap(),
            "\"date\""
        );
        assert_eq!(
            serde_json::to_string(&VelocityMode::Multiplier).unwrap(),
            "\"multiplier\""
        );
    }

    #[test]
    fn velocity_mode_deserializes_from_lowercase() {
        assert_eq!(
            serde_json::from_str::<VelocityMode>("\"status\"").unwrap(),
            VelocityMode::Status
        );
        assert_eq!(
            serde_json::from_str::<VelocityMode>("\"checkbox\"").unwrap(),
            VelocityMode::Checkbox
        );
        assert_eq!(
            serde_json::from_str::<VelocityMode>("\"date\"").unwrap(),
            VelocityMode::Date
        );
        assert_eq!(
            serde_json::from_str::<VelocityMode>("\"multiplier\"").unwrap(),
            VelocityMode::Multiplier
        );
    }

    #[test]
    fn velocity_mode_rejects_unknown_value() {
        assert!(serde_json::from_str::<VelocityMode>("\"boolean\"").is_err());
    }

    #[test]
    fn velocity_mode_round_trips() {
        for mode in [
            VelocityMode::Status,
            VelocityMode::Checkbox,
            VelocityMode::Date,
            VelocityMode::Multiplier,
        ] {
            let json = serde_json::to_string(&mode).unwrap();
            let back: VelocityMode = serde_json::from_str(&json).unwrap();
            assert_eq!(mode, back);
        }
    }
}
