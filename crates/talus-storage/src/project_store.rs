//! The `ProjectStore` trait — abstract persistence for project documents.
//!
//! At Phase 1 the trait is intentionally minimal: open a project by id, get
//! its raw bytes, write its raw bytes back. The Automerge document shape and
//! delta-application semantics arrive in Phase 3.

use talus_core::prelude::*;

/// Abstract storage backend for project documents.
///
/// Implementations must be `Send + Sync` so they can be used from async server
/// contexts. They MUST NOT panic on I/O errors; return [`Error`] instead.
pub trait ProjectStore: Send + Sync {
    /// Read the raw serialized bytes for a project.
    ///
    /// Returns [`Error::NotFound`] if no project with that id exists.
    fn read(&self, project_id: ProjectId) -> Result<Vec<u8>>;

    /// Persist the raw serialized bytes for a project, creating it if it
    /// does not exist.
    ///
    /// Implementations MUST be atomic with respect to crashes: a partial
    /// write must not leave the project in an unreadable state.
    fn write(&self, project_id: ProjectId, bytes: &[u8]) -> Result<()>;

    /// Delete a project. Idempotent: deleting a missing project is not an error.
    fn delete(&self, project_id: ProjectId) -> Result<()>;

    /// List all known project ids. Order is not specified.
    fn list(&self) -> Result<Vec<ProjectId>>;
}
