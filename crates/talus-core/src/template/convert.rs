//! Convert a typed [`TemplateDef`] into runtime [`NodeType`] blueprints.
//!
//! This is the redesign payoff of the template port: the untyped Python
//! `SchemaLoader` (`backend/infra/schema_loader.py`) that built node-type
//! dicts becomes a total, typed function from the on-disk [`TemplateDef`] to
//! the in-memory [`NodeType`] registry. The template's `uuid`s are the
//! canonical ids (no content-hashed ids, per §4a "one ID generator"); the
//! slug `id` fields are used only to resolve `allowed_children` references
//! between node types.

use std::collections::HashMap;

use crate::ids::NodeTypeId;
use crate::node_type::NodeType;
use crate::template::TemplateDef;
use crate::velocity::SelectOption;

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
        let by_slug = self.slug_to_id();
        self.node_types
            .iter()
            .map(|def| {
                let mut node_type = NodeType::from_template(def.node_type_id, def.label.clone());
                for property in &def.properties {
                    node_type = node_type.with_allowed_property(property.property_id);
                    if property.is_select() {
                        let options = property
                            .options
                            .iter()
                            .map(|opt| SelectOption {
                                id: opt.id.clone(),
                                name: opt.name.clone(),
                            })
                            .collect();
                        node_type =
                            node_type.with_property_select_options(property.property_id, options);
                    }
                }
                for child_slug in &def.allowed_children {
                    if let Some(&child_id) = by_slug.get(child_slug.as_str()) {
                        node_type = node_type.with_allowed_child(child_id);
                    }
                }
                if let Some(config) = &def.velocity_config {
                    node_type = node_type.with_velocity_config(config.clone());
                }
                node_type
            })
            .collect()
    }

    /// Build a slug → node-type-id map from every node type in this template.
    fn slug_to_id(&self) -> HashMap<&str, NodeTypeId> {
        self.node_types
            .iter()
            .map(|nt| (nt.id.as_str(), nt.node_type_id))
            .collect()
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
    velocityConfig:
      baseScore: 5
      scoreMode: inherit
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
    properties:
      - id: status
        uuid: b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e
        label: Status
        type: select
        velocityConfig:
          enabled: true
          mode: status
          statusScores:
            Draft: 1
            Done: 5
        options:
          - id: opt-draft
            name: Draft
            indicator_id: ind-draft
          - id: opt-done
            name: Done
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
    fn select_property_options_are_attached() {
        let types = template().to_node_types();
        let chapter = find(&types, "Chapter");
        let pid = crate::ids::PropertyId::from(uuid::uuid!("b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e"));
        let options = chapter.property_select_options(pid);
        assert_eq!(options.len(), 2);
        assert_eq!(options[0].id, "opt-draft");
        assert_eq!(options[0].name, "Draft");
        assert_eq!(options[1].id, "opt-done");
        assert_eq!(options[1].name, "Done");
    }

    #[test]
    fn non_select_property_has_no_options() {
        let types = template().to_node_types();
        let root = find(&types, "Book");
        let pid = crate::ids::PropertyId::from(uuid::uuid!("fa022033-b113-6c72-9d43-23ffbb36331a"));
        assert!(root.property_select_options(pid).is_empty());
    }

    #[test]
    fn node_velocity_config_is_attached() {
        use crate::velocity::ScoreMode;
        let types = template().to_node_types();
        let root = find(&types, "Book");
        let cfg = root.velocity_config().expect("velocity config");
        assert!((cfg.base_score - 5.0).abs() < f64::EPSILON);
        assert_eq!(cfg.score_mode, ScoreMode::Inherit);
    }

    #[test]
    fn node_without_velocity_config_has_none() {
        let types = template().to_node_types();
        let chapter = find(&types, "Chapter");
        assert!(chapter.velocity_config().is_none());
    }

    #[test]
    fn property_velocity_config_is_attached() {
        use crate::velocity::PropertyVelocityMode;
        let types = template().to_node_types();
        let chapter = find(&types, "Chapter");
        let pid = crate::ids::PropertyId::from(uuid::uuid!("b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e"));
        let cfg = chapter
            .property_velocity_config(pid)
            .expect("property velocity config");
        assert!(cfg.enabled);
        match &cfg.mode {
            PropertyVelocityMode::Status { status_scores } => {
                assert!((status_scores["Done"] - 5.0).abs() < f64::EPSILON);
                assert!((status_scores["Draft"] - 1.0).abs() < f64::EPSILON);
            }
            other => panic!("expected status mode, got {other:?}"),
        }
    }

    #[test]
    fn property_without_velocity_config_has_none() {
        let types = template().to_node_types();
        let root = find(&types, "Book");
        let pid = crate::ids::PropertyId::from(uuid::uuid!("fa022033-b113-6c72-9d43-23ffbb36331a"));
        assert!(root.property_velocity_config(pid).is_none());
    }

    #[test]
    fn unknown_child_slug_is_skipped() {
        let types = template().to_node_types();
        let root = find(&types, "Book");
        // "ghost" references no declared node type, so it contributes nothing.
        assert_eq!(root.allowed_children().count(), 1);
    }
}
