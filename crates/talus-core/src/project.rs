//! Top-level project aggregate.
//!
//! A `Project` owns:
//! - its identity ([`ProjectId`])
//! - a display name
//! - the structural [`Graph`] of nodes + parent edges
//! - the registry of [`NodeType`] definitions that the graph's nodes
//!   are typed against
//!
//! In Python this corresponds (loosely) to the on-disk
//! `project_talus.json` document plus the blueprint it references.
//! Validation hooks (allowed-property, allowed-child, schema)
//! land in subsequent cycles.

/// Schema version for serialized `Project`. Bump on any breaking shape change.
pub const PROJECT_SCHEMA_VERSION: u32 = 1;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::TemplateId;

    #[test]
    fn new_project_has_unique_id_name_and_empty_graph() {
        let template = TemplateId::new();
        let p1 = Project::new("Sample", template);
        let p2 = Project::new("Sample", template);
        assert_ne!(p1.id(), p2.id(), "each Project gets a fresh ProjectId");
        assert_eq!(p1.name(), "Sample");
        assert_eq!(p1.schema_version(), PROJECT_SCHEMA_VERSION);
        assert_eq!(p1.graph().node_count(), 0);
        assert_eq!(p1.node_types().count(), 0);
    }

    #[test]
    fn project_roundtrips_through_json() {
        let p = Project::new("Round Trip", TemplateId::new());
        let json = serde_json::to_string(&p).unwrap();
        let parsed: Project = serde_json::from_str(&json).unwrap();
        assert_eq!(p, parsed);
    }
}
