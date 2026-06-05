//! Velocity scoring engine.
//!
//! Mirrors `backend/core/velocity_engine.py` (the production engine, not the
//! dead-code `infra/velocity.py` that uses `eval()`). Decomposed into pure
//! functions and typed configuration shapes so each scoring component is
//! independently testable.
//!
//! Submodules:
//! * `date_score` — date-property velocity ramp (approaching window + overdue
//!   accrual, with optional cap).

mod date_score;

pub use date_score::{date_velocity_contribution, DateVelocityConfig};
