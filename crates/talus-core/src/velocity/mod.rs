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
//! * `numerical_score` — number / numeric / currency property multiplier
//!   contribution (with optional penalty-mode inversion).

mod date_score;
mod numerical_score;

pub use date_score::{date_velocity_contribution, DateVelocityConfig};
pub use numerical_score::{numerical_contribution, NumericalVelocityConfig};
