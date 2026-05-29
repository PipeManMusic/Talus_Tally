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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn io_variant_displays_with_io_prefix() {
        let err = Error::Io("disk on fire".to_string());
        assert_eq!(err.to_string(), "io error: disk on fire");
    }

    #[test]
    fn io_variant_is_distinct_from_serialization() {
        let err = Error::Io("x".into());
        assert!(matches!(err, Error::Io(_)));
        assert!(!matches!(err, Error::Serialization(_)));
    }
}
