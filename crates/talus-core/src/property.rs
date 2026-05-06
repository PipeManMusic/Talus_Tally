//! Typed property values.
//!
//! This module is the typed replacement for the Python backend's untyped
//! `Dict[str, Any]` node properties (see
//! `RUST_MIGRATION_PLAN.md` §4b — "Data model / schema"). Every property
//! value is one of a known set of variants, parsed at the boundary and
//! checked by the compiler from then on.
//!
//! Variants are added one TDD cycle at a time as Phase 1 progresses.

/// A typed property value attached to a node.
///
/// One variant per shape we know how to handle. Adding a variant is a
/// breaking change to persisted data and requires a `schema_version` bump.
#[derive(Debug, Clone, PartialEq)]
pub enum Property {
    /// A finite numeric value (currency, hours, percentage, count, ...).
    ///
    /// `NaN` and infinities are rejected at construction; see future
    /// constructor cycles. The raw `f64` form is exposed for now to keep
    /// the GREEN step minimal.
    Number(f64),
}

#[cfg(test)]
mod tests {
    use crate::property::Property;

    #[test]
    fn number_variant_holds_a_finite_f64() {
        let p = Property::Number(42.0);
        match p {
            Property::Number(n) => assert!((n - 42.0).abs() < f64::EPSILON),
        }
    }
}
