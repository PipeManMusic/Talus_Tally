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
//! * `date_parse` — date-string parser (YYYY-MM-DD and ISO 8601 datetimes).
//! * `numerical_score` — number / numeric / currency property multiplier
//!   contribution (with optional penalty-mode inversion).
//! * `currency` — currency-string parser (`"$1,234.56"` → `1234.56`).
//! * `checkbox_score` — checkbox-property contribution (checked / unchecked).
//! * `status_score` — status (select) property contribution with UUID-backed
//!   option resolution.
//! * `mode` — typed `ScoreMode` / `VelocityMode` enums (replace magic strings).
//! * `calculation` — `VelocityCalculation` per-node result record.
//! * `config` — node-level `NodeVelocityConfig` wire shape.
//! * `property_config` — per-property `PropertyVelocityConfig` wire shape.

mod calculation;
mod checkbox_score;
mod config;
mod currency;
mod date_parse;
mod date_score;
mod mode;
mod numerical_score;
mod property_config;
mod status_score;

pub use calculation::VelocityCalculation;
pub use checkbox_score::{
    checkbox_contribution, is_checkbox_checked, CheckboxValue, CheckboxVelocityConfig,
};
pub use config::NodeVelocityConfig;
pub use currency::parse_currency_value;
pub use date_parse::parse_date_value;
pub use date_score::{date_velocity_contribution, DateVelocityConfig};
pub use mode::{ScoreMode, VelocityMode};
pub use numerical_score::{numerical_contribution, NumericalVelocityConfig};
pub use property_config::{PropertyVelocityConfig, PropertyVelocityMode};
pub use status_score::{status_contribution, SelectOption};
