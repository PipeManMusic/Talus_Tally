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
    /// Construct via [`Property::number`] to reject `NaN` and infinities.
    /// The variant remains public so pattern-matching in consumers stays
    /// ergonomic, but trusted callers (deserializers, ports from Python
    /// JSON) must validate before constructing.
    Number(f64),

    /// A free-form string value (names, descriptions, email-shaped
    /// strings, etc.).
    ///
    /// Domain-specific validation (e.g. email format) is the
    /// responsibility of the property's blueprint, not this type.
    Text(String),
}

impl Property {
    /// Construct a [`Property::Number`] after validating the value is finite.
    ///
    /// Returns [`crate::error::Error::SchemaValidation`] if `value` is
    /// `NaN` or infinite. JSON cannot represent these natively, so any
    /// such value would be data corruption.
    ///
    /// # Errors
    /// Returns an error if `value` is not finite.
    pub fn number(value: f64) -> crate::error::Result<Self> {
        if value.is_finite() {
            Ok(Property::Number(value))
        } else {
            Err(crate::error::Error::SchemaValidation(format!(
                "Property::Number requires a finite f64, got {value}"
            )))
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::property::Property;

    #[test]
    fn number_variant_holds_a_finite_f64() {
        let p = Property::Number(42.0);
        match p {
            Property::Number(n) => assert!((n - 42.0).abs() < f64::EPSILON),
            Property::Text(_) => panic!("expected Number variant"),
        }
    }

    #[test]
    fn text_variant_holds_a_string() {
        let p = Property::Text("Alice Chen".to_owned());
        match p {
            Property::Text(s) => assert_eq!(s, "Alice Chen"),
            Property::Number(_) => panic!("expected Text variant"),
        }
    }

    #[test]
    fn date_iso_constructor_accepts_valid_iso_date() {
        let p = Property::date_iso("2025-01-20").expect("valid ISO date");
        match p {
            Property::DateIso { year, month, day } => {
                assert_eq!(year, 2025);
                assert_eq!(month, 1);
                assert_eq!(day, 20);
            }
            _ => panic!("expected DateIso variant"),
        }
    }

    #[test]
    fn date_iso_constructor_rejects_wrong_separator() {
        assert!(Property::date_iso("2025/01/20").is_err());
    }

    #[test]
    fn date_iso_constructor_rejects_short_form() {
        assert!(Property::date_iso("2025-1-20").is_err());
    }

    #[test]
    fn date_iso_constructor_rejects_out_of_range_month() {
        assert!(Property::date_iso("2025-13-01").is_err());
    }

    #[test]
    fn date_iso_constructor_rejects_out_of_range_day() {
        assert!(Property::date_iso("2025-02-30").is_err());
        assert!(Property::date_iso("2025-04-31").is_err());
    }

    #[test]
    fn date_iso_constructor_accepts_leap_day() {
        assert!(Property::date_iso("2024-02-29").is_ok());
        assert!(Property::date_iso("2025-02-29").is_err());
    }

    #[test]
    fn number_constructor_rejects_nan() {
        assert!(Property::number(f64::NAN).is_err());
    }

    #[test]
    fn number_constructor_rejects_positive_infinity() {
        assert!(Property::number(f64::INFINITY).is_err());
    }

    #[test]
    fn number_constructor_rejects_negative_infinity() {
        assert!(Property::number(f64::NEG_INFINITY).is_err());
    }

    #[test]
    fn number_constructor_accepts_finite_values() {
        assert!(Property::number(0.0).is_ok());
        assert!(Property::number(-1.5).is_ok());
        assert!(Property::number(1e9).is_ok());
    }

    proptest::proptest! {
        #[test]
        fn number_constructor_accepts_every_finite_f64(value in proptest::num::f64::NORMAL | proptest::num::f64::ZERO | proptest::num::f64::SUBNORMAL) {
            let result = Property::number(value);
            proptest::prop_assert!(result.is_ok(), "expected Ok for finite {value}, got {result:?}");
            if let Ok(Property::Number(stored)) = result {
                proptest::prop_assert!(stored.to_bits() == value.to_bits(), "value not preserved");
            }
        }

        #[test]
        fn number_constructor_rejects_every_non_finite_f64(value in proptest::num::f64::INFINITE | proptest::num::f64::QUIET_NAN | proptest::num::f64::SIGNALING_NAN) {
            proptest::prop_assert!(Property::number(value).is_err());
        }
    }
}
