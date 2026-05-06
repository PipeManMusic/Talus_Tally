//! Typed property values.
//!
//! This module is the typed replacement for the Python backend's untyped
//! `Dict[str, Any]` node properties (see
//! `RUST_MIGRATION_PLAN.md` §4b — "Data model / schema"). Every property
//! value is one of a known set of variants, parsed at the boundary and
//! checked by the compiler from then on.
//!
//! Variants are added one TDD cycle at a time as Phase 1 progresses.

use crate::ids::NodeId;

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

    /// A calendar date in proleptic Gregorian, with no time-of-day or
    /// timezone component.
    ///
    /// Stored as an explicit `(year, month, day)` triple, not as a
    /// string. Any persisted form (JSON, etc.) MUST round-trip through
    /// [`Property::date_iso`] / [`Property::date_iso_string`] so
    /// invalid dates cannot exist in memory.
    DateIso {
        /// Proleptic Gregorian year. May be negative (BCE).
        year: i32,
        /// Month, `1..=12`.
        month: u8,
        /// Day of month, `1..=days_in_month(year, month)`.
        day: u8,
    },

    /// A reference to another node within the same project.
    ///
    /// The compiler enforces that only a [`NodeId`] can be placed here —
    /// a [`crate::ids::TemplateId`] or [`crate::ids::PropertyId`] is a
    /// type error at the call site. This is the typed replacement for
    /// the Python pattern of storing the target's UUID as a bare string
    /// (see e.g. `data/examples/budget_smoke_test_project.json`).
    ///
    /// # Doctest: cross-id substitution is rejected
    ///
    /// ```compile_fail
    /// use talus_core::ids::TemplateId;
    /// use talus_core::property::Property;
    /// let _ = Property::NodeRef(TemplateId::new());
    /// ```
    NodeRef(NodeId),
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

    /// Construct a [`Property::DateIso`] from a strict `YYYY-MM-DD` string.
    ///
    /// Format requirements:
    /// - exactly 10 characters
    /// - 4-digit year, 2-digit month, 2-digit day, separated by `-`
    /// - month in `1..=12`, day valid for that month and year (Gregorian)
    ///
    /// # Errors
    /// Returns [`crate::error::Error::SchemaValidation`] if `s` is not a
    /// well-formed Gregorian date.
    pub fn date_iso(s: &str) -> crate::error::Result<Self> {
        let bytes = s.as_bytes();
        let invalid = || {
            crate::error::Error::SchemaValidation(format!(
                "DateIso requires strict YYYY-MM-DD, got {s:?}"
            ))
        };
        if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
            return Err(invalid());
        }
        let year: i32 = s
            .get(0..4)
            .ok_or_else(invalid)?
            .parse()
            .map_err(|_| invalid())?;
        let month: u8 = s
            .get(5..7)
            .ok_or_else(invalid)?
            .parse()
            .map_err(|_| invalid())?;
        let day: u8 = s
            .get(8..10)
            .ok_or_else(invalid)?
            .parse()
            .map_err(|_| invalid())?;
        if !(1..=12).contains(&month) {
            return Err(invalid());
        }
        if day < 1 || day > days_in_month(year, month) {
            return Err(invalid());
        }
        Ok(Property::DateIso { year, month, day })
    }
}

/// Days in `month` for `year`, accounting for Gregorian leap rules.
///
/// Caller must pass `month` in `1..=12`.
fn days_in_month(year: i32, month: u8) -> u8 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => 0, // unreachable for caller-validated input
    }
}

/// Gregorian leap-year rule: divisible by 4, but not 100, unless 400.
fn is_leap_year(year: i32) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

#[cfg(test)]
mod tests {
    use crate::property::Property;

    #[test]
    fn number_variant_holds_a_finite_f64() {
        let p = Property::Number(42.0);
        match p {
            Property::Number(n) => assert!((n - 42.0).abs() < f64::EPSILON),
            Property::Text(_) | Property::DateIso { .. } | Property::NodeRef(_) => {
                panic!("expected Number variant")
            }
        }
    }

    #[test]
    fn text_variant_holds_a_string() {
        let p = Property::Text("Alice Chen".to_owned());
        match p {
            Property::Text(s) => assert_eq!(s, "Alice Chen"),
            Property::Number(_) | Property::DateIso { .. } | Property::NodeRef(_) => {
                panic!("expected Text variant")
            }
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
            Property::Number(_) | Property::Text(_) | Property::NodeRef(_) => {
                panic!("expected DateIso variant")
            }
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
    fn node_ref_variant_holds_a_node_id() {
        use crate::ids::NodeId;
        let target = NodeId::new();
        let p = Property::NodeRef(target);
        match p {
            Property::NodeRef(id) => assert_eq!(id, target),
            Property::Number(_) | Property::Text(_) | Property::DateIso { .. } => {
                panic!("expected NodeRef variant")
            }
        }
    }

    /// Compile-time guarantee: a `TemplateId` cannot be used where a
    /// `NodeRef` is expected. This test exists so that if a future
    /// refactor accidentally relaxes the type, a reviewer is forced to
    /// confront the compile error here.
    #[test]
    fn node_ref_does_not_accept_other_id_kinds() {
        use crate::ids::NodeId;
        // The body is a positive construction; the negative case is
        // expressed in a doctest below (see `Property::NodeRef`).
        let _ = Property::NodeRef(NodeId::new());
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
