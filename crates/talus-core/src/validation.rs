//! Validation rules for untyped YAML/JSON inputs at the system boundary.
//!
//! These validators mirror the Python `backend/infra/schema_validator.py`
//! family and return a `Vec<String>` of human-readable errors so that the
//! existing API surface and UI behavior is preserved byte-for-byte during
//! the migration. See `docs/architecture/RUST_MIGRATION_PLAN.md` § Phase 1.

pub mod icon_catalog;
pub mod indicator_catalog;
pub mod markup_profile;
