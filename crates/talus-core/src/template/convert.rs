//! Convert a typed [`TemplateDef`] into runtime [`NodeType`] blueprints.
//!
//! This is the redesign payoff of the template port: the untyped Python
//! `SchemaLoader` (`backend/infra/schema_loader.py`) that built node-type
//! dicts becomes a total, typed function from the on-disk [`TemplateDef`] to
//! the in-memory [`NodeType`] registry. The template's `uuid`s are the
//! canonical ids (no content-hashed ids, per §4a "one ID generator"); the
//! slug `id` fields are used only to resolve `allowed_children` references
//! between node types.

use crate::node_type::NodeType;
use crate::template::TemplateDef;

impl TemplateDef {
    /// Build the runtime [`NodeType`] blueprints declared by this template,
    /// in declaration order.
    ///
    /// Each node type keeps its canonical `uuid` as its id and its `label`
    /// as its name. Declared properties become the allowed-property set, and
    /// `allowed_children` slugs are resolved to the ids of the referenced
    /// node types (unknown slugs are skipped).
    #[must_use]
    pub fn to_node_types(&self) -> Vec<NodeType> {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEMPLATE: &str = r"
name: Book
uuid: 69ff5bb9-c64b-4f66-a241-9573e2d5b173
node_types:
  - id: root
    uuid: dda577b6-9f7c-8feb-e893-5e6f32522a56
    label: Book
    features:
      - is_root
    allowed_children:
      - chapter
      - ghost
    properties:
      - id: name
        uuid: fa022033-b113-6c72-9d43-23ffbb36331a
        label: Title
        type: text
        required: false
  - id: chapter
    uuid: a5a68b68-95f5-f84a-2626-d46603662310
    label: Chapter
    properties: []
";

    fn template() -> TemplateDef {
        serde_yaml::from_str(TEMPLATE).unwrap()
    }

    fn find<'a>(types: &'a [NodeType], name: &str) -> &'a NodeType {
        types
            .iter()
            .find(|nt| nt.name() == name)
            .expect("node type")
    }

    #[test]
    fn converts_every_node_type() {
        let types = template().to_node_types();
        assert_eq!(types.len(), 2);
    }

    #[test]
    fn keeps_uuid_as_id_and_label_as_name() {
        let types = template().to_node_types();
        let root = find(&types, "Book");
        assert_eq!(
            *root.id().as_uuid(),
            uuid::uuid!("dda577b6-9f7c-8feb-e893-5e6f32522a56")
        );
    }

    #[test]
    fn declared_properties_become_allowed() {
        let types = template().to_node_types();
        let root = find(&types, "Book");
        let pid = crate::ids::PropertyId::from(uuid::uuid!("fa022033-b113-6c72-9d43-23ffbb36331a"));
        assert!(root.allows_property(pid));
    }

    #[test]
    fn known_child_slug_resolves_to_id() {
        let types = template().to_node_types();
        let root = find(&types, "Book");
        let chapter = find(&types, "Chapter");
        assert!(root.allows_child(chapter.id()));
    }

    #[test]
    fn unknown_child_slug_is_skipped() {
        let types = template().to_node_types();
        let root = find(&types, "Book");
        // "ghost" references no declared node type, so it contributes nothing.
        assert_eq!(root.allowed_children().count(), 1);
    }
}
