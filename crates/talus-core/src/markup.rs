//! Markup parsing: splits a body of text into structured blocks using a
//! markup profile (token list).
//!
//! Mirrors Python `backend/infra/markup.py::MarkupParser.parse`. Inputs and
//! outputs are untyped `serde_json::Value` to match the JSON/YAML boundary
//! used by the existing API contract.

use crate::error::{Error, Result};
use serde_json::{json, Value};

/// Parse `text` into a `{raw, blocks, profile_id}` envelope according to
/// `profile`'s `tokens` list.
///
/// Each line of `text` becomes one block:
/// * fully empty/whitespace lines → `{"type": "blank", "text": ""}`
/// * lines beginning with a token's `prefix` → `{"type": <id>, "text":
///   <remainder>, "prefix": <prefix>}`
/// * a token's `pattern` regex matching from the start of the line →
///   `{"type": <id>, ...named groups, "text": <text-group or stripped line>}`
/// * everything else → `{"type": "text", "text": <line>}`
///
/// Tokens are tried in declaration order; the first match wins. Tokens that
/// are not objects, lack an `id`, or carry neither `prefix` nor `pattern`
/// are skipped.
///
/// Returns `Err(Error::SchemaValidation)` if any token's `pattern` is not a
/// valid regex (matching Python's `ValueError` from `re.compile`).
pub fn parse(text: &str, profile: &Value) -> Result<Value> {
    let profile_id = profile.get("id").cloned().unwrap_or(Value::Null);
    let prefix_tokens = collect_prefix_tokens(profile);

    let blocks: Vec<Value> = text
        .lines()
        .map(|line| classify(line, &prefix_tokens))
        .collect();

    Ok(json!({
        "raw": text,
        "blocks": blocks,
        "profile_id": profile_id,
    }))
}

struct PrefixToken<'a> {
    id: &'a str,
    prefix: &'a str,
}

fn collect_prefix_tokens(profile: &Value) -> Vec<PrefixToken<'_>> {
    let Some(tokens) = profile.get("tokens").and_then(Value::as_array) else {
        return Vec::new();
    };
    tokens
        .iter()
        .filter_map(|t| {
            let obj = t.as_object()?;
            let id = obj.get("id")?.as_str()?;
            let prefix = obj.get("prefix")?.as_str()?;
            Some(PrefixToken { id, prefix })
        })
        .collect()
}

fn classify(line: &str, prefix_tokens: &[PrefixToken<'_>]) -> Value {
    if line.trim().is_empty() {
        return json!({ "type": "blank", "text": "" });
    }
    for token in prefix_tokens {
        if let Some(rest) = line.strip_prefix(token.prefix) {
            return json!({
                "type": token.id,
                "text": rest.trim(),
                "prefix": token.prefix,
            });
        }
    }
    json!({ "type": "text", "text": line })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile_with_tokens(tokens: Value) -> Value {
        let mut p = json!({ "id": "p1" });
        p.as_object_mut()
            .unwrap()
            .insert("tokens".to_string(), tokens);
        p
    }

    fn prefix_token(id: &str, prefix: &str) -> Value {
        json!({ "id": id, "prefix": prefix })
    }

    #[test]
    fn empty_text_yields_no_blocks() {
        let profile = profile_with_tokens(json!([]));
        let out = parse("", &profile).unwrap();
        assert_eq!(out["raw"], json!(""));
        assert_eq!(out["blocks"], json!([]));
        assert_eq!(out["profile_id"], json!("p1"));
    }

    #[test]
    fn raw_is_passthrough() {
        let profile = profile_with_tokens(json!([]));
        let out = parse("hello\nworld", &profile).unwrap();
        assert_eq!(out["raw"], json!("hello\nworld"));
    }

    #[test]
    fn missing_profile_id_becomes_null() {
        let profile = json!({ "tokens": [] });
        let out = parse("", &profile).unwrap();
        assert_eq!(out["profile_id"], Value::Null);
    }

    #[test]
    fn blank_line_becomes_blank_block() {
        let profile = profile_with_tokens(json!([]));
        let out = parse("\n", &profile).unwrap();
        assert_eq!(out["blocks"], json!([{ "type": "blank", "text": "" }]));
    }

    #[test]
    fn whitespace_only_line_becomes_blank_block() {
        let profile = profile_with_tokens(json!([]));
        let out = parse("   \t  ", &profile).unwrap();
        assert_eq!(out["blocks"], json!([{ "type": "blank", "text": "" }]));
    }

    #[test]
    fn unmatched_line_falls_back_to_text() {
        let profile = profile_with_tokens(json!([]));
        let out = parse("plain line", &profile).unwrap();
        assert_eq!(
            out["blocks"],
            json!([{ "type": "text", "text": "plain line" }])
        );
    }

    #[test]
    fn prefix_token_matches_and_strips_prefix() {
        let profile = profile_with_tokens(json!([prefix_token("note", "> ")]));
        let out = parse("> hello there", &profile).unwrap();
        assert_eq!(
            out["blocks"],
            json!([{ "type": "note", "text": "hello there", "prefix": "> " }])
        );
    }

    #[test]
    fn prefix_remainder_is_trimmed() {
        let profile = profile_with_tokens(json!([prefix_token("note", "#")]));
        let out = parse("#   padded   ", &profile).unwrap();
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
        let out = parse("# hi", &profile).unwrap();
        assert_eq!(out["blocks"][0]["type"], json!("first"));
    }

    #[test]
    fn lines_without_prefix_still_fall_back_to_text() {
        let profile = profile_with_tokens(json!([prefix_token("note", "> ")]));
        let out = parse("not a note", &profile).unwrap();
        assert_eq!(
            out["blocks"],
            json!([{ "type": "text", "text": "not a note" }])
        );
    }

    #[test]
    fn mixed_lines_produce_one_block_each_in_order() {
        let profile = profile_with_tokens(json!([prefix_token("note", "> ")]));
        let out = parse("> first\nplain\n\n> second", &profile).unwrap();
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
        let out = parse("plain", &profile).unwrap();
        assert_eq!(out["blocks"], json!([{ "type": "text", "text": "plain" }]));
    }

    #[test]
    fn tokens_without_id_are_skipped() {
        let profile = profile_with_tokens(json!([{ "prefix": "> " }]));
        let out = parse("> hi", &profile).unwrap();
        assert_eq!(out["blocks"], json!([{ "type": "text", "text": "> hi" }]));
    }

    #[test]
    fn tokens_without_prefix_or_pattern_are_skipped() {
        let profile = profile_with_tokens(json!([{ "id": "bare" }]));
        let out = parse("anything", &profile).unwrap();
        assert_eq!(
            out["blocks"],
            json!([{ "type": "text", "text": "anything" }])
        );
    }

    #[test]
    fn missing_tokens_field_treated_as_empty() {
        let profile = json!({ "id": "p1" });
        let out = parse("hello", &profile).unwrap();
        assert_eq!(out["blocks"], json!([{ "type": "text", "text": "hello" }]));
    }

    fn pattern_token(id: &str, pattern: &str) -> Value {
        json!({ "id": id, "pattern": pattern })
    }

    #[test]
    fn pattern_token_without_groups_uses_stripped_line_as_text() {
        let profile = profile_with_tokens(json!([pattern_token("heading", r"^=+\s")]));
        let out = parse("==  the title  ", &profile).unwrap();
        assert_eq!(
            out["blocks"],
            json!([{ "type": "heading", "text": "==  the title" }])
        );
    }

    #[test]
    fn pattern_token_with_named_groups_merges_groups_and_uses_text_group() {
        let profile = profile_with_tokens(json!([pattern_token(
            "heading",
            r"^(?P<level>=+)\s+(?P<text>.*)$",
        )]));
        let out = parse("== Section One", &profile).unwrap();
        assert_eq!(
            out["blocks"],
            json!([{
                "type": "heading",
                "level": "==",
                "text": "Section One",
            }])
        );
    }

    #[test]
    fn pattern_named_text_group_is_trimmed() {
        let profile = profile_with_tokens(json!([pattern_token("note", r"^NOTE:(?P<text>.*)$",)]));
        let out = parse("NOTE:   padded   ", &profile).unwrap();
        assert_eq!(out["blocks"], json!([{ "type": "note", "text": "padded" }]));
    }

    #[test]
    fn pattern_groups_without_text_group_default_text_to_empty() {
        let profile = profile_with_tokens(json!([pattern_token("tagged", r"^@(?P<tag>\w+)$",)]));
        let out = parse("@important", &profile).unwrap();
        assert_eq!(
            out["blocks"],
            json!([{ "type": "tagged", "tag": "important", "text": "" }])
        );
    }

    #[test]
    fn pattern_non_match_falls_through_to_text() {
        let profile = profile_with_tokens(json!([pattern_token("heading", r"^=+\s")]));
        let out = parse("plain line", &profile).unwrap();
        assert_eq!(
            out["blocks"],
            json!([{ "type": "text", "text": "plain line" }])
        );
    }

    #[test]
    fn pattern_only_matches_at_start_of_line() {
        let profile = profile_with_tokens(json!([pattern_token("at", r"@(?P<who>\w+)")]));
        let out = parse("hey @alice", &profile).unwrap();
        assert_eq!(
            out["blocks"],
            json!([{ "type": "text", "text": "hey @alice" }])
        );
    }

    #[test]
    fn mixed_pattern_and_prefix_tokens_preserve_declaration_order() {
        let profile = profile_with_tokens(json!([
            pattern_token("heading", r"^#\s+(?P<text>.*)$"),
            prefix_token("note", "#"),
        ]));
        let out = parse("# real heading\n#shortcut", &profile).unwrap();
        assert_eq!(
            out["blocks"],
            json!([
                { "type": "heading", "text": "real heading" },
                { "type": "note", "text": "shortcut", "prefix": "#" },
            ])
        );
    }

    #[test]
    fn invalid_regex_returns_schema_validation_error() {
        let profile = profile_with_tokens(json!([pattern_token("bad", r"[unterminated")]));
        let err = parse("anything", &profile).unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("bad"), "error should mention token id: {msg}");
        assert!(
            msg.contains("Invalid regex pattern"),
            "error should mention 'Invalid regex pattern': {msg}",
        );
    }
}
