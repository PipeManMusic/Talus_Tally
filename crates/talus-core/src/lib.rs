//! Talus Tally domain core.
//!
//! Pure business logic ported from the Python `backend/` package. This crate
//! intentionally has no knowledge of:
//!
//! * networking (no `tokio`, `axum`, no HTTP, no Sockets)
//! * persistence (storage is provided by `talus-storage` via traits)
//! * users / authentication (the hosted server enforces those)
//! * UI (consumers are Tauri, a future web frontend, the CLI, the server)
//!
//! See `docs/architecture/RUST_MIGRATION_PLAN.md` for the migration phases.

#![doc(html_no_source)]

/// Crate-wide error type. Domain errors only; never wraps I/O or network errors.
pub mod error;

/// Domain identifier types (project IDs, node IDs, template IDs, ...).
pub mod ids;

/// Typed property values (replaces Python's `Dict[str, Any]`).
pub mod property;

/// A single node in a project tree.
pub mod node;

/// The structural container for a project's nodes and tree edges.
pub mod graph;

/// Schema and validation primitives. Phase 1: types only; rules ported per module.
pub mod schema;

/// Re-exports for convenient `use talus_core::prelude::*;`.
pub mod prelude {
    pub use crate::error::{Error, Result};
    pub use crate::ids::{NodeId, ProjectId, TemplateId};
}
