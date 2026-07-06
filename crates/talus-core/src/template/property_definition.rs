//! Typed definition of a single template property.
//!
//! Ports the property entries of a template's `node_types[].properties[]`
//! (see `data/templates/*.yaml`) into a typed struct, replacing the Python
//! loader's untyped dicts in `backend/infra/schema_loader.py`. The on-disk
//! shape is preserved field-for-field so existing templates round-trip
//! losslessly (§4b rule 2, "YAML import compatibility forever").

use serde::{Deserialize, Serialize};

use crate::ids::PropertyId;
use crate::template::PropertyKind;
use crate::velocity::PropertyVelocityConfig;

/// One option of a `select`-typed property.
///
/// Mirrors the `options[]` entries in a template property: a stable id, a
/// human-readable name, and an optional indicator (icon) id.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SelectOptionDef {
    /// The option's stable identifier (a UUID string in current templates).
    pub id: String,
    /// The human-readable option name (also used as the scoring key).
    pub name: String,
    /// Optional indicator (icon) id drawn from the property's
    /// `indicator_set`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub indicator_id: Option<String>,
}

/// A typed template property definition.
///
/// Field names match the template YAML keys via serde renames (`uuid` →
/// [`PropertyDefinition::property_id`], `type` → [`PropertyDefinition::kind`])
/// so a `PropertyDefinition` deserializes directly from a property entry.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PropertyDefinition {
    /// The legacy slug id (`"name"`, `"prop_1775916275686"`, ...). Display
    /// and legacy-reference only; not the canonical identity.
    pub id: String,
    /// The canonical property identifier (the template's `uuid`).
    #[serde(rename = "uuid")]
    pub property_id: PropertyId,
    /// Human-readable label shown in the UI.
    pub label: String,
    /// Whether the property must be set.
    #[serde(default)]
    pub required: bool,
    /// The property's declared kind (the template's `type`).
    #[serde(rename = "type")]
    pub kind: PropertyKind,
    /// Optional indicator-set name backing the property's display.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub indicator_set: Option<String>,
    /// The fixed option set, populated only for `select` properties.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<SelectOptionDef>,
    /// Per-property velocity configuration (`velocityConfig`), if declared.
    #[serde(
        rename = "velocityConfig",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub velocity_config: Option<PropertyVelocityConfig>,
}

impl PropertyDefinition {
    /// Whether this property is a single-choice `select`.
    #[must_use]
    pub fn is_select(&self) -> bool {
        self.kind == PropertyKind::Select
    }

    /// Find a select option by its stored id, mirroring the velocity
    /// engine's value→name resolution. Returns `None` for non-select
    /// properties or unknown ids.
    #[must_use]
    pub fn select_option(&self, id: &str) -> Option<&SelectOptionDef> {
        self.options.iter().find(|opt| opt.id == id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SELECT_PROP: &str = r"
id: prop_1776363438244
uuid: 7c217cbc-45ce-84fa-a34d-102b7e72f99f
label: Status
type: select
required: false
indicator_set: status
options:
  - id: fab31900-f7d8-07f3-9dc1-f215469b75d3
    indicator_id: x-mark
    name: Unverified
  - id: 4a803397-1951-f7a1-08d3-037a99301d16
    indicator_id: check
    name: verified
";

    const TEXT_PROP: &str = r"
id: name
uuid: fa022033-b113-6c72-9d43-23ffbb36331a
label: Title
type: text
required: false
";

    fn parse(yaml: &str) -> PropertyDefinition {
        serde_yaml::from_str(yaml).unwrap()
    }

    #[test]
    fn select_property_is_select() {
        assert!(parse(SELECT_PROP).is_select());
    }

    #[test]
    fn text_property_is_not_select() {
        assert!(!parse(TEXT_PROP).is_select());
    }

    #[test]
    fn select_option_resolves_by_id() {
        let prop = parse(SELECT_PROP);
        let opt = prop
            .select_option("4a803397-1951-f7a1-08d3-037a99301d16")
            .expect("option present");
        assert_eq!(opt.name, "verified");
        assert_eq!(opt.indicator_id.as_deref(), Some("check"));
    }

    #[test]
    fn select_option_unknown_id_is_none() {
        let prop = parse(SELECT_PROP);
        assert!(prop.select_option("does-not-exist").is_none());
    }

    #[test]
    fn select_option_on_text_property_is_none() {
        let prop = parse(TEXT_PROP);
        assert!(prop.select_option("anything").is_none());
    }

    #[test]
    fn deserializes_typed_fields_from_yaml() {
        let prop = parse(SELECT_PROP);
        assert_eq!(prop.id, "prop_1776363438244");
        assert_eq!(prop.kind, PropertyKind::Select);
        assert_eq!(prop.indicator_set.as_deref(), Some("status"));
        assert_eq!(prop.options.len(), 2);
        assert_eq!(prop.options[0].name, "Unverified");
    }
}
