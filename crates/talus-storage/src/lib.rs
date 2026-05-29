//! Storage abstractions for `talus-core`.
//!
//! Phase 1 ships only the trait + an in-memory implementation used by tests.
//! A `SQLite` implementation arrives in Phase 3 alongside the Automerge document
//! shape.
//!
//! See `docs/architecture/RUST_MIGRATION_PLAN.md` § Phases 1 and 3.

#![doc(html_no_source)]

pub mod codec;
pub mod command_log;
pub mod event_log;
pub mod filesystem;
pub mod memory;
pub mod project_store;

pub use project_store::ProjectStore;
