//! Crate-wide error and result types.

use thiserror::Error;

/// Errors raised by `talus-core` domain operations.
///
/// Variants are intentionally coarse-grained at this stage; they will be
/// refined as more of the domain is ported.
#[derive(Debug, Error)]
pub enum Error {
    /// A value failed schema validation.
    #[error("schema validation failed: {0}")]
    SchemaValidation(String),

    /// A required identifier was not found in the project / template.
    #[error("not found: {0}")]
    NotFound(String),

    /// A mutation could not be applied because it would violate an invariant.
    #[error("invariant violation: {0}")]
    InvariantViolation(String),

    /// A serialization or deserialization step failed.
    #[error("serialization error: {0}")]
    Serialization(String),
}

/// Convenience alias for `Result<T, Error>`.
pub type Result<T> = std::result::Result<T, Error>;
