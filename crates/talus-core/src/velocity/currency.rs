//! Currency-string parser for numerical velocity properties.
//!
//! Mirrors the Python parsing path inside `_calculate_numerical_scores`:
//!
//! ```python
//! value = float(value.replace("$", "").replace(",", "").strip())
//! ```
//!
//! Returns `None` when the input is empty after stripping or fails to parse,
//! matching the Python `try / except: continue` behaviour that drops the
//! contribution silently.

/// Parse a currency-formatted string into an `f64`.
///
/// Strips all `$` and `,` characters, trims surrounding whitespace, then
/// attempts `f64::parse`. Returns `None` when the result is empty or
/// unparseable.
#[must_use]
pub fn parse_currency_value(input: &str) -> Option<f64> {
    let _ = input;
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_dollar_sign_with_commas() {
        assert_eq!(parse_currency_value("$1,234.56"), Some(1234.56));
    }

    #[test]
    fn parses_plain_number() {
        assert_eq!(parse_currency_value("42"), Some(42.0));
    }

    #[test]
    fn trims_surrounding_whitespace() {
        assert_eq!(parse_currency_value("  $50  "), Some(50.0));
    }

    #[test]
    fn returns_none_for_empty_string() {
        assert_eq!(parse_currency_value(""), None);
    }

    #[test]
    fn returns_none_for_whitespace_only() {
        assert_eq!(parse_currency_value("   "), None);
    }

    #[test]
    fn returns_none_for_non_numeric() {
        assert_eq!(parse_currency_value("abc"), None);
    }

    #[test]
    fn returns_none_when_only_currency_symbols() {
        assert_eq!(parse_currency_value("$"), None);
        assert_eq!(parse_currency_value("$$,,"), None);
    }

    #[test]
    fn handles_negative_values() {
        assert_eq!(parse_currency_value("-50"), Some(-50.0));
    }

    #[test]
    fn strips_multiple_dollar_signs() {
        assert_eq!(parse_currency_value("$$50$$"), Some(50.0));
    }

    #[test]
    fn handles_leading_decimal() {
        assert_eq!(parse_currency_value("0.5"), Some(0.5));
    }

    #[test]
    fn returns_none_for_partial_numeric_suffix() {
        assert_eq!(parse_currency_value("12abc"), None);
    }

    #[test]
    fn returns_none_when_internal_whitespace_breaks_number() {
        // "$1, 234" → "1 234" → not a valid float.
        assert_eq!(parse_currency_value("$1, 234"), None);
    }
}
