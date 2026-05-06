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

/// Identifier for one option of a select-typed property.
///
/// **Phase 1 compromise.** Today this wraps a slug string carried over
/// from the Python backend (`"to_do"`, `"in_progress"`, ...) so we can
/// round-trip existing project data unchanged. This violates the
/// project-wide rule "one ID generator, UUID v4 only" stated in
/// `docs/architecture/RUST_MIGRATION_PLAN.md` §4a. The compromise is
/// scoped, tracked, and explicitly temporary:
///
/// - Phase 3 ports template loading and introduces an alias side-table
///   that maps legacy slugs to freshly-minted `Uuid`s.
/// - At that point this newtype's inner type changes from `String` to
///   `Uuid`. The newtype shape is preserved, so consumers that pattern
///   match on `Property::SelectToken(SelectOptionId(_))` keep working.
/// - The slug becomes a display label on the blueprint, never an id.
///
/// Until then, treat select-option slugs as opaque external data: they
/// flow through the system but they are NOT the canonical identifier.
// TODO(phase-3): replace `String` with `uuid::Uuid`. See
// docs/architecture/RUST_MIGRATION_PLAN.md §4b "Data model / schema".
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SelectOptionId(String);

impl SelectOptionId {
    /// Borrow the slug as a `&str`.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

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

    /// A reference to one option of a select-typed property.
    ///
    /// Construct via [`Property::select_token`] which enforces the slug
    /// shape (non-empty, no whitespace).
    SelectToken(SelectOptionId),
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

    /// Construct a [`Property::SelectToken`] from a slug.
    ///
    /// The slug must be non-empty and must not contain whitespace; a
    /// slug with internal whitespace is almost always a UI display
    /// string accidentally being stored as an option id.
    ///
    /// # Errors
    /// Returns [`crate::error::Error::SchemaValidation`] if `slug` is
    /// empty, whitespace-only, or contains any whitespace character.
    pub fn select_token(slug: &str) -> crate::error::Result<Self> {
        if slug.is_empty() || slug.chars().any(char::is_whitespace) {
            return Err(crate::error::Error::SchemaValidation(format!(
                "SelectToken requires a non-empty whitespace-free slug, got {slug:?}"
            )));
        }
        Ok(Property::SelectToken(SelectOptionId(slug.to_owned())))
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

    /// Discriminant tag used by tests to assert "this is variant X" without
    /// repeating an exhaustive match arm in every test. Update sites are
    /// guaranteed by the compiler: adding a `Property` variant forces a new
    /// `Tag` variant and a new arm in `Property::tag()`.
    #[derive(Debug, PartialEq, Eq)]
    enum Tag {
        Number,
        Text,
        DateIso,
        NodeRef,
        SelectToken,
    }

    impl Property {
        fn tag(&self) -> Tag {
            match self {
                Property::Number(_) => Tag::Number,
                Property::Text(_) => Tag::Text,
                Property::DateIso { .. } => Tag::DateIso,
                Property::NodeRef(_) => Tag::NodeRef,
                Property::SelectToken(_) => Tag::SelectToken,
            }
        }
    }

    #[test]
    fn number_variant_holds_a_finite_f64() {
        let p = Property::Number(42.0);
        assert_eq!(p.tag(), Tag::Number);
        if let Property::Number(n) = p {
            assert!((n - 42.0).abs() < f64::EPSILON);
        }
    }

    #[test]
    fn text_variant_holds_a_string() {
        let p = Property::Text("Alice Chen".to_owned());
        assert_eq!(p.tag(), Tag::Text);
        if let Property::Text(s) = p {
            assert_eq!(s, "Alice Chen");
        }
    }

    #[test]
    fn date_iso_constructor_accepts_valid_iso_date() {
        let p = Property::date_iso("2025-01-20").expect("valid ISO date");
        assert_eq!(p.tag(), Tag::DateIso);
        if let Property::DateIso { year, month, day } = p {
            assert_eq!((year, month, day), (2025, 1, 20));
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
        assert_eq!(p.tag(), Tag::NodeRef);
        if let Property::NodeRef(id) = p {
            assert_eq!(id, target);
        }
    }

    #[test]
    fn select_token_constructor_accepts_valid_slug() {
        let p = Property::select_token("in_progress").expect("valid slug");
        assert_eq!(p.tag(), Tag::SelectToken);
        if let Property::SelectToken(tok) = p {
            assert_eq!(tok.as_str(), "in_progress");
        }
    }

    #[test]
    fn select_token_constructor_rejects_empty_string() {
        assert!(Property::select_token("").is_err());
    }

    #[test]
    fn select_token_constructor_rejects_whitespace_only() {
        assert!(Property::select_token("   ").is_err());
    }

    #[test]
    fn select_token_constructor_rejects_internal_whitespace() {
        // Slugs must be a single token; whitespace inside indicates a UI
        // string accidentally being stored as a token id.
        assert!(Property::select_token("in progress").is_err());
        assert!(Property::select_token("a\tb").is_err());
        assert!(Property::select_token("a\nb").is_err());
    }

    #[test]
    fn select_token_accepts_slugs_seen_in_python_data() {
        // From the Python backend audit (data/examples/...):
        for slug in ["to_do", "in_progress", "done"] {
            assert!(Property::select_token(slug).is_ok(), "failed on {slug}");
        }
    }

    #[test]
    fn boolean_variant_holds_a_bool() {
        let t = Property::Boolean(true);
        let f = Property::Boolean(false);
        assert_eq!(t.tag(), Tag::Boolean);
        assert_eq!(f.tag(), Tag::Boolean);
        if let (Property::Boolean(a), Property::Boolean(b)) = (t, f) {
            assert!(a);
            assert!(!b);
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
