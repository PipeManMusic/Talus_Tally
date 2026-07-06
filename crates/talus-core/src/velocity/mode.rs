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
/// Deserialization is permissive to match the engine, which only
/// special-cases `scoreMode == "inherit"`: the exact string `"inherit"`
/// becomes [`ScoreMode::Inherit`] and **every** other value (`"fixed"`,
/// `"standalone"`, or anything else production templates ship) becomes
/// [`ScoreMode::Fixed`]. A missing `scoreMode` also defaults to
/// [`ScoreMode::Fixed`] (no inheritance).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ScoreMode {
    /// Inherit the base score from the parent (`"inherit"`).
    Inherit,
    /// Use a fixed base score defined on the node type (any non-`"inherit"`
    /// value, including `"fixed"` and `"standalone"`).
    #[default]
    Fixed,
}

impl<'de> Deserialize<'de> for ScoreMode {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let raw = String::deserialize(deserializer)?;
        Ok(if raw == "inherit" {
            ScoreMode::Inherit
        } else {
            ScoreMode::Fixed
        })
    }
}

/// Which scoring rule a per-property `velocityConfig` applies.
///
/// Wire format is the lowercase string stored in `velocityConfig.mode`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
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
    fn score_mode_unknown_value_is_non_inherit() {
        // Python's engine only special-cases `scoreMode == "inherit"`; every
        // other value (`"fixed"`, `"standalone"`, or garbage) is non-inherit.
        // Production templates ship `scoreMode: standalone`, so unknown
        // values must load rather than reject (§ import compat forever).
        assert_eq!(
            serde_json::from_str::<ScoreMode>("\"standalone\"").unwrap(),
            ScoreMode::Fixed
        );
        assert_eq!(
            serde_json::from_str::<ScoreMode>("\"sideways\"").unwrap(),
            ScoreMode::Fixed
        );
    }

    #[test]
    fn score_mode_defaults_to_fixed() {
        assert_eq!(ScoreMode::default(), ScoreMode::Fixed);
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
