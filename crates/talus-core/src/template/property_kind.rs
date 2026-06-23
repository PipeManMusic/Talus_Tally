//! The typed `type:` field of a template property definition.
//!
//! Templates declare each property's shape with a lowercase string such as
//! `text`, `select`, or `currency` (see `data/templates/*.yaml` and the
//! Python `backend/infra/schema_loader.py`). [`PropertyKind`] is the typed
//! replacement: known kinds become explicit variants, and any unrecognized
//! kind is preserved verbatim in [`PropertyKind::Other`] so unknown
//! templates still round-trip losslessly (§4b rule 2, "YAML import
//! compatibility forever").

use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// The declared shape of a template property.
///
/// Serializes to / deserializes from the lowercase kind string used in
/// template files (`"text"`, `"node_reference"`, ...). Unknown kinds are
/// retained in [`PropertyKind::Other`] rather than rejected, mirroring the
/// Python loader's deliberately permissive handling of property types.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PropertyKind {
    /// Single-line free text.
    Text,
    /// Rich-text / markup editor body.
    Editor,
    /// One choice from a fixed set of options.
    Select,
    /// A plain numeric value.
    Number,
    /// A monetary value.
    Currency,
    /// A calendar date.
    Date,
    /// A boolean checkbox.
    Checkbox,
    /// A reference to another node.
    NodeReference,
    /// Any kind string not in the known set, preserved verbatim so it
    /// round-trips unchanged.
    Other(String),
}

impl PropertyKind {
    /// Parse a template kind string into a [`PropertyKind`]. Unrecognized
    /// strings are kept as [`PropertyKind::Other`].
    #[must_use]
    pub fn from_kind_str(kind: &str) -> Self {
        match kind {
            "text" => Self::Text,
            "editor" => Self::Editor,
            "select" => Self::Select,
            "number" => Self::Number,
            "currency" => Self::Currency,
            "date" => Self::Date,
            "checkbox" => Self::Checkbox,
            "node_reference" => Self::NodeReference,
            other => Self::Other(other.to_owned()),
        }
    }

    /// The lowercase kind string this variant serializes to.
    #[must_use]
    pub fn as_str(&self) -> &str {
        match self {
            Self::Text => "text",
            Self::Editor => "editor",
            Self::Select => "select",
            Self::Number => "number",
            Self::Currency => "currency",
            Self::Date => "date",
            Self::Checkbox => "checkbox",
            Self::NodeReference => "node_reference",
            Self::Other(raw) => raw,
        }
    }
}

impl Serialize for PropertyKind {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for PropertyKind {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(deserializer)?;
        Ok(Self::from_kind_str(&raw))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_kinds_parse_to_variants() {
        assert_eq!(PropertyKind::from_kind_str("text"), PropertyKind::Text);
        assert_eq!(PropertyKind::from_kind_str("editor"), PropertyKind::Editor);
        assert_eq!(PropertyKind::from_kind_str("select"), PropertyKind::Select);
        assert_eq!(PropertyKind::from_kind_str("number"), PropertyKind::Number);
        assert_eq!(
            PropertyKind::from_kind_str("currency"),
            PropertyKind::Currency
        );
        assert_eq!(PropertyKind::from_kind_str("date"), PropertyKind::Date);
        assert_eq!(
            PropertyKind::from_kind_str("checkbox"),
            PropertyKind::Checkbox
        );
        assert_eq!(
            PropertyKind::from_kind_str("node_reference"),
            PropertyKind::NodeReference
        );
    }

    #[test]
    fn unknown_kind_is_retained_verbatim() {
        assert_eq!(
            PropertyKind::from_kind_str("person"),
            PropertyKind::Other("person".to_owned())
        );
    }

    #[test]
    fn as_str_renders_each_variant() {
        assert_eq!(PropertyKind::Text.as_str(), "text");
        assert_eq!(PropertyKind::Editor.as_str(), "editor");
        assert_eq!(PropertyKind::Select.as_str(), "select");
        assert_eq!(PropertyKind::Number.as_str(), "number");
        assert_eq!(PropertyKind::Currency.as_str(), "currency");
        assert_eq!(PropertyKind::Date.as_str(), "date");
        assert_eq!(PropertyKind::Checkbox.as_str(), "checkbox");
        assert_eq!(PropertyKind::NodeReference.as_str(), "node_reference");
        assert_eq!(PropertyKind::Other("person".to_owned()).as_str(), "person");
    }

    #[test]
    fn known_kind_round_trips_through_serde() {
        let kind: PropertyKind = serde_json::from_str("\"select\"").unwrap();
        assert_eq!(kind, PropertyKind::Select);
        assert_eq!(serde_json::to_string(&kind).unwrap(), "\"select\"");
    }

    #[test]
    fn unknown_kind_round_trips_through_serde() {
        let kind: PropertyKind = serde_json::from_str("\"person\"").unwrap();
        assert_eq!(kind, PropertyKind::Other("person".to_owned()));
        assert_eq!(serde_json::to_string(&kind).unwrap(), "\"person\"");
    }
}
