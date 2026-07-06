//! Typed definition of a single template node type.
//!
//! Ports a template's `node_types[]` entry (see `data/templates/*.yaml`)
//! into a typed struct, replacing the Python `NodeTypeDef` dict handling in
//! `backend/infra/schema_loader.py`. Structural fields are modeled
//! explicitly; presentation-only extras (`color`, `shape`, `velocityConfig`,
//! ...) are ignored at this layer and handled by the later template→registry
//! converter.

use serde::{Deserialize, Serialize};

use crate::ids::NodeTypeId;
use crate::template::PropertyDefinition;

/// A typed template node-type definition.
///
/// Field names match the template YAML keys via serde renames (`uuid` →
/// [`NodeTypeDef::node_type_id`]). The `label` key also accepts `name` as an
/// alias, mirroring the Python template validator.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NodeTypeDef {
    /// The legacy slug id (`"root"`, `"node_type_1775916012216"`, ...).
    /// Used to resolve `allowed_children` references; not the canonical
    /// identity.
    pub id: String,
    /// The canonical node-type identifier (the template's `uuid`).
    #[serde(rename = "uuid")]
    pub node_type_id: NodeTypeId,
    /// Human-readable label shown in the UI.
    #[serde(alias = "name")]
    pub label: String,
    /// Optional icon name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    /// Slugs of node types allowed as children.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub allowed_children: Vec<String>,
    /// Slugs of asset types allowed on this node type.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub allowed_asset_types: Vec<String>,
    /// The property definitions declared on this node type.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub properties: Vec<PropertyDefinition>,
    /// Slug of the property that drives this node type's primary status
    /// indicator, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub primary_status_property_id: Option<String>,
    /// Feature flags declared on this node type (`"is_root"`, ...).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub features: Vec<String>,
}

impl NodeTypeDef {
    /// Find a property definition by its slug `id`. Returns `None` if no
    /// property on this node type has that id.
    #[must_use]
    pub fn property(&self, id: &str) -> Option<&PropertyDefinition> {
        self.properties.iter().find(|prop| prop.id == id)
    }

    /// Whether this node type declares the given feature flag.
    #[must_use]
    pub fn has_feature(&self, feature: &str) -> bool {
        self.features.iter().any(|f| f == feature)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::template::PropertyKind;

    const ROOT_NODE_TYPE: &str = r"
id: project_root
uuid: 292b9e11-45c7-94f4-20db-7f6085266a4f
label: Project
icon: film
features:
  - is_root
allowed_children:
  - season
  - task
allowed_asset_types: []
properties:
  - id: name
    uuid: 19419fc9-6b1c-c58c-8c6b-2b00ae2dbcc2
    label: Project Name
    type: text
    required: false
  - id: budget
    uuid: f2300937-eec4-630c-1e05-fdeb74860715
    label: Estimated Budget
    type: currency
    required: false
";

    const LEAF_NODE_TYPE: &str = r"
id: source
uuid: 8e677411-e9ad-76ef-d713-4b91da711270
name: Source
properties: []
";

    fn parse(yaml: &str) -> NodeTypeDef {
        serde_yaml::from_str(yaml).unwrap()
    }

    #[test]
    fn property_lookup_finds_by_slug() {
        let nt = parse(ROOT_NODE_TYPE);
        let prop = nt.property("budget").expect("budget present");
        assert_eq!(prop.label, "Estimated Budget");
        assert_eq!(prop.kind, PropertyKind::Currency);
    }

    #[test]
    fn property_lookup_unknown_slug_is_none() {
        let nt = parse(ROOT_NODE_TYPE);
        assert!(nt.property("does-not-exist").is_none());
    }

    #[test]
    fn has_feature_true_for_declared_flag() {
        let nt = parse(ROOT_NODE_TYPE);
        assert!(nt.has_feature("is_root"));
    }

    #[test]
    fn has_feature_false_for_absent_flag() {
        let nt = parse(ROOT_NODE_TYPE);
        assert!(!nt.has_feature("is_leaf"));
    }

    #[test]
    fn deserializes_structural_fields_from_yaml() {
        let nt = parse(ROOT_NODE_TYPE);
        assert_eq!(nt.id, "project_root");
        assert_eq!(nt.label, "Project");
        assert_eq!(nt.icon.as_deref(), Some("film"));
        assert_eq!(nt.allowed_children, vec!["season", "task"]);
        assert_eq!(nt.properties.len(), 2);
    }

    #[test]
    fn label_accepts_name_alias() {
        let nt = parse(LEAF_NODE_TYPE);
        assert_eq!(nt.label, "Source");
        assert!(nt.properties.is_empty());
    }
}
