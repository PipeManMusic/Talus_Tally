//! Typed definition of a whole template document.
//!
//! Ports the top level of a template file (see `data/templates/*.yaml`) into
//! a typed struct, replacing the Python loader's dict handling in
//! `backend/infra/schema_loader.py`. Only the structural keys the domain
//! needs are modeled; presentation-only extras (`blocking_view`, ...) are
//! ignored at this layer and handled by the later template→registry
//! converter.

use serde::{Deserialize, Serialize};

use crate::ids::TemplateId;
use crate::template::NodeTypeDef;

/// A typed template document.
///
/// Field names match the template YAML keys via serde renames (`uuid` →
/// [`TemplateDef::template_id`]). Required top-level keys are `name` and
/// `node_types`, mirroring the Python template validator.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TemplateDef {
    /// Human-readable template name.
    pub name: String,
    /// Optional prose description.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Optional template version string (`"0.1.0"`, ...).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// The canonical template identifier (the file's `uuid`).
    #[serde(rename = "uuid")]
    pub template_id: TemplateId,
    /// The node-type definitions declared by this template.
    #[serde(default)]
    pub node_types: Vec<NodeTypeDef>,
}

impl TemplateDef {
    /// Find a node-type definition by its slug `id`. Returns `None` if no
    /// node type in this template has that id.
    #[must_use]
    pub fn node_type(&self, _id: &str) -> Option<&NodeTypeDef> {
        None
    }

    /// The node types flagged as roots (declaring the `is_root` feature).
    #[must_use]
    pub fn root_node_types(&self) -> Vec<&NodeTypeDef> {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEMPLATE: &str = r"
name: Book
description: A template to help you write a book
version: 0.1.0
uuid: 69ff5bb9-c64b-4f66-a241-9573e2d5b173
blocking_view:
  node_size:
    base_height: 100
node_types:
  - id: root
    uuid: dda577b6-9f7c-8feb-e893-5e6f32522a56
    label: Book
    features:
      - is_root
    allowed_children:
      - chapter
    properties: []
  - id: chapter
    uuid: a5a68b68-95f5-f84a-2626-d46603662310
    label: Chapter
    properties: []
";

    fn parse() -> TemplateDef {
        serde_yaml::from_str(TEMPLATE).unwrap()
    }

    #[test]
    fn node_type_lookup_finds_by_slug() {
        let tpl = parse();
        let nt = tpl.node_type("chapter").expect("chapter present");
        assert_eq!(nt.label, "Chapter");
    }

    #[test]
    fn node_type_lookup_unknown_slug_is_none() {
        let tpl = parse();
        assert!(tpl.node_type("does-not-exist").is_none());
    }

    #[test]
    fn root_node_types_returns_is_root_flagged() {
        let tpl = parse();
        let roots = tpl.root_node_types();
        assert_eq!(roots.len(), 1);
        assert_eq!(roots[0].id, "root");
    }

    #[test]
    fn deserializes_top_level_fields_from_yaml() {
        let tpl = parse();
        assert_eq!(tpl.name, "Book");
        assert_eq!(
            tpl.description.as_deref(),
            Some("A template to help you write a book")
        );
        assert_eq!(tpl.version.as_deref(), Some("0.1.0"));
        assert_eq!(tpl.node_types.len(), 2);
    }
}
