//! Date-property value parser.
//!
//! Pure port of `_parse_date_value` from `backend/core/velocity_engine.py`.
//! Accepts `YYYY-MM-DD` strings and full ISO 8601 datetimes (including
//! trailing `Z` for UTC); returns `None` for empty or unparseable input so
//! callers can short-circuit without penalising unset dates.

use chrono::NaiveDate;

/// Parse a stored date property string into a `NaiveDate`.
///
/// Mirrors Python parity:
/// * Returns `None` for empty / whitespace-only / unparseable input.
/// * Tries `YYYY-MM-DD` first (cheapest path; takes the first 10 chars).
/// * Falls back to ISO 8601 datetime parsing, normalising trailing `Z` to
///   `+00:00` to match Python's `replace("Z", "+00:00")` behaviour.
#[must_use]
pub fn parse_date_value(input: &str) -> Option<NaiveDate> {
    let stripped = input.trim();
    if stripped.is_empty() {
        return None;
    }
    if stripped.len() >= 10 {
        if let Ok(date) = NaiveDate::parse_from_str(&stripped[..10], "%Y-%m-%d") {
            return Some(date);
        }
    }
    let normalised = stripped.replace('Z', "+00:00");
    chrono::DateTime::parse_from_rfc3339(&normalised)
        .ok()
        .map(|dt| dt.date_naive())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(y: i32, m: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, day).unwrap()
    }

    #[test]
    fn parses_plain_yyyy_mm_dd() {
        assert_eq!(parse_date_value("2026-06-12"), Some(d(2026, 6, 12)));
    }

    #[test]
    fn parses_iso_datetime_with_z_suffix() {
        assert_eq!(
            parse_date_value("2026-06-12T14:30:00Z"),
            Some(d(2026, 6, 12))
        );
    }

    #[test]
    fn parses_iso_datetime_with_offset() {
        assert_eq!(
            parse_date_value("2026-06-12T14:30:00+02:00"),
            Some(d(2026, 6, 12))
        );
    }

    #[test]
    fn trims_surrounding_whitespace() {
        assert_eq!(parse_date_value("  2026-06-12  "), Some(d(2026, 6, 12)));
    }

    #[test]
    fn takes_first_ten_chars_as_date() {
        // Python: date.fromisoformat(stripped[:10]) wins before datetime fallback.
        assert_eq!(parse_date_value("2026-06-12 extra"), Some(d(2026, 6, 12)));
    }

    #[test]
    fn returns_none_for_empty_string() {
        assert_eq!(parse_date_value(""), None);
    }

    #[test]
    fn returns_none_for_whitespace_only() {
        assert_eq!(parse_date_value("   "), None);
    }

    #[test]
    fn returns_none_for_non_date_string() {
        assert_eq!(parse_date_value("not a date"), None);
    }

    #[test]
    fn returns_none_for_invalid_date_components() {
        // Python date.fromisoformat raises ValueError for impossible dates.
        assert_eq!(parse_date_value("2026-13-01"), None);
        assert_eq!(parse_date_value("2026-02-30"), None);
    }

    #[test]
    fn returns_none_for_partial_date() {
        // "2026-06" is only 7 chars; Python's stripped[:10] would still try
        // "2026-06" and fail.
        assert_eq!(parse_date_value("2026-06"), None);
    }

    #[test]
    fn accepts_iso_datetime_without_seconds() {
        // Some serializers omit seconds; chrono accepts T14:30:00 but not T14:30.
        // Verify the YYYY-MM-DD prefix path still catches this.
        assert_eq!(parse_date_value("2026-06-12T14:30"), Some(d(2026, 6, 12)));
    }
}
