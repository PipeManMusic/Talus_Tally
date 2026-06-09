//! Numerical-property velocity contribution.
//!
//! Pure port of the multiplier arithmetic from `_calculate_numerical_scores`
//! in `backend/core/velocity_engine.py`. Caller supplies a parsed `f64`
//! value (currency-string parsing belongs at a higher layer) so this leaf
//! has no dependencies beyond the standard library.

/// Configuration for a number / numeric / currency property whose
/// `velocityConfig.mode` is `"multiplier"`.
#[derive(Debug, Clone, PartialEq)]
pub struct NumericalVelocityConfig {
    /// `multiplierFactor` from the Python `velocityConfig`. Python defaults
    /// to `1` when the key is missing; the caller is responsible for that
    /// default at deserialization time.
    pub multiplier: f64,
    /// When `true`, lower values yield higher scores:
    /// `(100 - value) * multiplier`, floored at 0. When `false`, the
    /// contribution is the raw `value * multiplier` and may be negative.
    pub penalty_mode: bool,
}

/// Compute the velocity contribution of a single numerical property.
#[must_use]
pub fn numerical_contribution(value: f64, config: &NumericalVelocityConfig) -> f64 {
    if config.penalty_mode {
        ((100.0 - value) * config.multiplier).max(0.0)
    } else {
        value * config.multiplier
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(multiplier: f64, penalty_mode: bool) -> NumericalVelocityConfig {
        NumericalVelocityConfig {
            multiplier,
            penalty_mode,
        }
    }

    #[test]
    fn normal_mode_returns_value_times_multiplier() {
        let c = cfg(2.0, false);
        assert!((numerical_contribution(5.0, &c) - 10.0).abs() < f64::EPSILON);
    }

    #[test]
    fn normal_mode_with_fractional_value() {
        let c = cfg(4.0, false);
        assert!((numerical_contribution(2.5, &c) - 10.0).abs() < f64::EPSILON);
    }

    #[test]
    fn normal_mode_allows_negative_contribution() {
        let c = cfg(2.0, false);
        // Python `_calculate_numerical_scores` does not floor normal mode.
        assert!((numerical_contribution(-3.0, &c) - -6.0).abs() < f64::EPSILON);
    }

    #[test]
    fn penalty_mode_inverts_value() {
        let c = cfg(1.0, true);
        // (100 - 20) * 1 = 80
        assert!((numerical_contribution(20.0, &c) - 80.0).abs() < f64::EPSILON);
    }

    #[test]
    fn penalty_mode_floors_at_zero_when_value_above_100() {
        let c = cfg(1.0, true);
        // (100 - 150) * 1 = -50 → max(0, -50) = 0
        assert!((numerical_contribution(150.0, &c) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn penalty_mode_at_exactly_100_yields_zero() {
        let c = cfg(2.0, true);
        // (100 - 100) * 2 = 0
        assert!((numerical_contribution(100.0, &c) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn penalty_mode_with_fractional_multiplier() {
        let c = cfg(0.5, true);
        // (100 - 80) * 0.5 = 10
        assert!((numerical_contribution(80.0, &c) - 10.0).abs() < f64::EPSILON);
    }
}
