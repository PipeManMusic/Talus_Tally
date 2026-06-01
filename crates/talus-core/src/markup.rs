//! Markup parsing: splits a body of text into structured blocks using a
//! markup profile (token list).
//!
//! Mirrors Python `backend/infra/markup.py::MarkupParser.parse`. Inputs and
//! outputs are untyped `serde_json::Value` to match the JSON/YAML boundary
//! used by the existing API contract.

use serde_json::{json, Value};

/// Parse `text` into a `{raw, blocks, profile_id}` envelope according to
/// `profile`'s `tokens` list.
///
/// Each line of `text` becomes one block:
/// * fully empty/whitespace lines → `{"type": "blank", "text": ""}`
/// * lines beginning with a token's `prefix` → `{"type": <id>, "text":
///   <remainder>, "prefix": <prefix>}`
/// * everything else → `{"type": "text", "text": <line>}`
///
/// Tokens are tried in declaration order; the first match wins. Tokens that
/// are not objects, lack an `id`, or carry neither `prefix` nor `pattern`
/// are skipped. (Regex `pattern` matching is not implemented in this slice.)
pub fn parse(text: &str, profile: &Value) -> Value {
    let profile_id = profile.get("id").cloned().unwrap_or(Value::Null);

    json!({
        "raw": text,
        "blocks": Vec::<Value>::new(),
        "profile_id": profile_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile_with_tokens(tokens: Value) -> Value {
        json!({ "id": "p1", "tokens": tokens })
    }

    fn prefix_token(id: &str, prefix: &str) -> Value {
        json!({ "id": id, "prefix": prefix })
    }

    #[test]
    fn empty_text_yields_no_blocks() {
        let profile = profile_with_tokens(json!([]));
        let out = parse("", &profile);
        assert_eq!(out["raw"], json!(""));
        assert_eq!(out["blocks"], json!([]));
        assert_eq!(out["profile_id"], json!("p1"));
    }

    #[test]
    fn raw_is_passthrough() {
        let profile = profile_with_tokens(json!([]));
        let out = parse("hello\nworld", &profile);
        assert_eq!(out["raw"], json!("hello\nworld"));
    }

    #[test]
    fn missing_profile_id_becomes_null() {
        let profile = json!({ "tokens": [] });
        let out = parse("", &profile);
        assert_eq!(out["profile_id"], Value::Null);
    }

    #[test]
    fn blank_line_becomes_blank_block() {
        let profile = profile_with_tokens(json!([]));
        let out = parse("\n", &profile);
        assert_eq!(out["blocks"], json!([{ "type": "blank", "text": "" }]));
    }

    #[test]
    fn whitespace_only_line_becomes_blank_block() {
        let profile = profile_with_tokens(json!([]));
        let out = parse("   \t  ", &profile);
        assert_eq!(out["blocks"], json!([{ "type": "blank", "text": "" }]));
    }

    #[test]
    fn unmatched_line_falls_back_to_text() {
        let profile = profile_with_tokens(json!([]));
        let out = parse("plain line", &profile);
        assert_eq!(
            out["blocks"],
            json!([{ "type": "text", "text": "plain line" }])
        );
    }

    #[test]
    fn prefix_token_matches_and_strips_prefix() {
        let profile = profile_with_tokens(json!([prefix_token("note", "> ")]));
        let out = parse("> hello there", &profile);
        assert_eq!(
            out["blocks"],
            json!([{ "type": "note", "text": "hello there", "prefix": "> " }])
        );
    }

    #[test]
    fn prefix_remainder_is_trimmed() {
        let profile = profile_with_tokens(json!([prefix_token("note", "#")]));
        let out = parse("#   padded   ", &profile);
        assert_eq!(
            out["blocks"],
            json!([{ "type": "note", "text": "padded", "prefix": "#" }])
        );
    }

    #[test]
    fn first_matching_token_wins() {
        let profile = profile_with_tokens(json!([
            prefix_token("first", "#"),
            prefix_token("second", "#"),
        ]));
        let out = parse("# hi", &profile);
        assert_eq!(out["blocks"][0]["type"], json!("first"));
    }

    #[test]
    fn lines_without_prefix_still_fall_back_to_text() {
        let profile = profile_with_tokens(json!([prefix_token("note", "> ")]));
        let out = parse("not a note", &profile);
        assert_eq!(
            out["blocks"],
            json!([{ "type": "text", "text": "not a note" }])
        );
    }

    #[test]
    fn mixed_lines_produce_one_block_each_in_order() {
        let profile = profile_with_tokens(json!([prefix_token("note", "> ")]));
        let out = parse("> first\nplain\n\n> second", &profile);
        assert_eq!(
            out["blocks"],
            json!([
                { "type": "note", "text": "first",  "prefix": "> " },
                { "type": "text", "text": "plain" },
                { "type": "blank", "text": "" },
                { "type": "note", "text": "second", "prefix": "> " },
            ])
        );
    }

    #[test]
    fn non_object_tokens_are_skipped() {
        let profile = profile_with_tokens(json!(["nope", 7, null]));
        let out = parse("plain", &profile);
        assert_eq!(out["blocks"], json!([{ "type": "text", "text": "plain" }]));
    }

    #[test]
    fn tokens_without_id_are_skipped() {
        let profile = profile_with_tokens(json!([{ "prefix": "> " }]));
        let out = parse("> hi", &profile);
        assert_eq!(out["blocks"], json!([{ "type": "text", "text": "> hi" }]));
    }

    #[test]
    fn tokens_without_prefix_or_pattern_are_skipped() {
        let profile = profile_with_tokens(json!([{ "id": "bare" }]));
        let out = parse("anything", &profile);
        assert_eq!(
            out["blocks"],
            json!([{ "type": "text", "text": "anything" }])
        );
    }

    #[test]
    fn missing_tokens_field_treated_as_empty() {
        let profile = json!({ "id": "p1" });
        let out = parse("hello", &profile);
        assert_eq!(out["blocks"], json!([{ "type": "text", "text": "hello" }]));
    }
}
