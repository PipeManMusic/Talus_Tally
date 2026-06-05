//! Date-property velocity ramp.
//!
//! Pure port of the math in `_calculate_date_velocity` from
//! `backend/core/velocity_engine.py`. Caller supplies the integer
//! `days_until` (today − target; negative means overdue) so this function
//! is independent of any clock or date library.

/// Configuration for the date-property velocity ramp.
///
/// Mirrors the Python `velocityConfig` keys for `mode == "date"`:
/// * `approaching_window` — number of days before the target during which
///   approaching points accrue (Python `approachingWindow`). When `0`,
///   approaching never contributes.
/// * `approaching_per_day` — points added per day inside the window
///   (Python `approachingPerDay`). The contribution peaks at
///   `approaching_window * approaching_per_day` on the day itself.
/// * `overdue_per_day` — points added for each day past the target
///   (Python `overduePerDay`).
/// * `max_score` — optional cap on the total contribution. Mirrors the
///   Python `maxScore > 0` check: `Some(0.0)` or any non-positive value
///   does **not** cap.
#[derive(Debug, Clone, PartialEq)]
pub struct DateVelocityConfig {
    /// Number of days before the target during which approaching points
    /// accrue. `0` disables approaching contribution.
    pub approaching_window: u32,
    /// Points added per day inside the approaching window.
    pub approaching_per_day: f64,
    /// Points added per day past the target.
    pub overdue_per_day: f64,
    /// Optional cap on the total contribution. `Some(v)` only caps when
    /// `v > 0`; `Some(0.0)` and negatives do not cap (Python parity).
    pub max_score: Option<f64>,
}

/// Compute the velocity contribution for a date property.
///
/// `days_until` is `target - today` in integer days; negative means overdue.
/// Returns 0.0 when nothing should contribute (outside the approaching
/// window with no overdue accrual).
#[must_use]
pub fn date_velocity_contribution(days_until: i32, config: &DateVelocityConfig) -> f64 {
    let window_days = i32::try_from(config.approaching_window).unwrap_or(i32::MAX);
    let mut contribution = if days_until >= 0 {
        if window_days > 0 && days_until <= window_days {
            f64::from(window_days - days_until) * config.approaching_per_day
        } else {
            0.0
        }
    } else {
        let full_approaching = f64::from(window_days) * config.approaching_per_day;
        full_approaching + f64::from(-days_until) * config.overdue_per_day
    };
    if let Some(cap) = config.max_score {
        if cap > 0.0 {
            contribution = contribution.min(cap);
        }
    }
    contribution
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(
        window: u32,
        per_day: f64,
        overdue_per_day: f64,
        max_score: Option<f64>,
    ) -> DateVelocityConfig {
        DateVelocityConfig {
            approaching_window: window,
            approaching_per_day: per_day,
            overdue_per_day,
            max_score,
        }
    }

    #[test]
    fn returns_zero_when_window_is_zero_and_not_overdue() {
        let c = cfg(0, 1.0, 0.0, None);
        assert!((date_velocity_contribution(5, &c) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn returns_zero_outside_approaching_window() {
        let c = cfg(7, 1.0, 0.0, None);
        assert!((date_velocity_contribution(10, &c) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn ramps_up_inside_approaching_window() {
        let c = cfg(7, 1.0, 0.0, None);
        // window=7, per_day=1, days_until=4 → (7-4)*1 = 3
        assert!((date_velocity_contribution(4, &c) - 3.0).abs() < f64::EPSILON);
    }

    #[test]
    fn peaks_on_the_target_day() {
        let c = cfg(7, 1.0, 0.0, None);
        // window=7, per_day=1, days_until=0 → 7*1 = 7
        assert!((date_velocity_contribution(0, &c) - 7.0).abs() < f64::EPSILON);
    }

    #[test]
    fn accrues_overdue_per_day_even_with_zero_window() {
        let c = cfg(0, 0.0, 2.0, None);
        // window=0, overdue_per_day=2, days_until=-5 → 0 + 5*2 = 10
        assert!((date_velocity_contribution(-5, &c) - 10.0).abs() < f64::EPSILON);
    }

    #[test]
    fn combines_full_window_plus_overdue_when_past_target() {
        let c = cfg(7, 1.0, 2.0, None);
        // full_approaching = 7*1 = 7; overdue = 3*2 = 6; total = 13
        assert!((date_velocity_contribution(-3, &c) - 13.0).abs() < f64::EPSILON);
    }

    #[test]
    fn caps_contribution_at_max_score_when_positive() {
        let c = cfg(10, 1.0, 0.0, Some(5.0));
        // window=10, per_day=1, days_until=0 → 10, capped at 5
        assert!((date_velocity_contribution(0, &c) - 5.0).abs() < f64::EPSILON);
    }

    #[test]
    fn max_score_zero_does_not_cap() {
        let c = cfg(7, 1.0, 0.0, Some(0.0));
        // Python: `max_score > 0` so 0 disables the cap; expect 7
        assert!((date_velocity_contribution(0, &c) - 7.0).abs() < f64::EPSILON);
    }

    #[test]
    fn max_score_negative_does_not_cap() {
        let c = cfg(7, 1.0, 0.0, Some(-3.0));
        assert!((date_velocity_contribution(0, &c) - 7.0).abs() < f64::EPSILON);
    }
}
