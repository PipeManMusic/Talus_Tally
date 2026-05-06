//! Typed property values.
//!
//! This module is the typed replacement for the Python backend's untyped
//! `Dict[str, Any]` node properties (see
//! `RUST_MIGRATION_PLAN.md` §4b — "Data model / schema"). Every property
//! value is one of a known set of variants, parsed at the boundary and
//! checked by the compiler from then on.
//!
//! Variants are added one TDD cycle at a time as Phase 1 progresses.

// Implementation lives below the test module so the failing test is added
// first (RED) and made to compile and pass in the next commit (GREEN).

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
