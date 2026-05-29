//! Top-level project aggregate.
//!
//! A `Project` owns:
//! - its identity ([`crate::ids::ProjectId`])
//! - a display name
//! - the structural [`crate::graph::Graph`] of nodes + parent edges
//! - the registry of [`crate::node_type::NodeType`] definitions that
//!   the graph's nodes are typed against
//!
//! In Python this corresponds (loosely) to the on-disk
//! `project_talus.json` document plus the blueprint it references.
//! Validation hooks (allowed-property, allowed-child, schema)
//! land in subsequent cycles.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use crate::graph::Graph;
use crate::ids::{NodeTypeId, ProjectId, TemplateId};
use crate::node_type::NodeType;

/// Schema version for serialized `Project`. Bump on any breaking shape change.
pub const PROJECT_SCHEMA_VERSION: u32 = 1;

/// Top-level project aggregate.
///
/// Owns the structural [`Graph`] and the [`NodeType`] registry the
/// graph's nodes are typed against. All fields are private; mutation
/// goes through dedicated methods (and, in Phase 2, through
/// `apply_command`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Project {
    id: ProjectId,
    name: String,
    schema_version: u32,
    graph: Graph,
    #[serde(default)]
    node_types: IndexMap<NodeTypeId, NodeType>,
}

impl Project {
    /// Mint a new empty `Project` bound to the given template.
    ///
    /// The id is freshly generated per §4a "one ID generator". The
    /// inner [`Graph`] is empty (no nodes, no edges) and the node-type
    /// registry is empty.
    #[must_use]
    pub fn new(name: impl Into<String>, template: TemplateId) -> Self {
        Self {
            id: ProjectId::new(),
            name: name.into(),
            schema_version: PROJECT_SCHEMA_VERSION,
            graph: Graph::new(template),
            node_types: IndexMap::new(),
        }
    }

    /// Stable identifier for this project.
    #[must_use]
    pub fn id(&self) -> ProjectId {
        self.id
    }

    /// Human-readable name (display only; not a key).
    #[must_use]
    pub fn name(&self) -> &str {
        &self.name
    }

    /// On-disk schema version of this struct.
    #[must_use]
    pub fn schema_version(&self) -> u32 {
        self.schema_version
    }

    /// Read-only access to the inner graph.
    #[must_use]
    pub fn graph(&self) -> &Graph {
        &self.graph
    }

    /// Iterate the registered [`NodeType`] definitions in insertion order.
    pub fn node_types(&self) -> impl Iterator<Item = &NodeType> + '_ {
        self.node_types.values()
    }

    /// Look up a registered [`NodeType`] by id.
    #[must_use]
    pub fn get_node_type(&self, id: NodeTypeId) -> Option<&NodeType> {
        self.node_types.get(&id)
    }

    /// Register a new [`NodeType`] in this project's registry.
    ///
    /// # Errors
    /// - [`crate::error::Error::InvariantViolation`] if a `NodeType` with
    ///   the same id is already registered. On error the registry is
    ///   unchanged. Callers that want to replace a `NodeType` must
    ///   remove the existing entry first (a future `unregister` slice).
    pub fn register_node_type(&mut self, nt: NodeType) -> crate::error::Result<()> {
        use crate::error::Error;

        if self.node_types.contains_key(&nt.id()) {
            return Err(Error::InvariantViolation(format!(
                "node type {} is already registered",
                nt.id()
            )));
        }
        self.node_types.insert(nt.id(), nt);
        Ok(())
    }
}

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

    #[test]
    fn register_node_type_stores_it_in_the_registry() {
        let mut p = Project::new("P", TemplateId::new());
        let nt = crate::node_type::NodeType::new("Equipment");
        let nt_id = nt.id();
        p.register_node_type(nt.clone()).unwrap();
        assert_eq!(p.node_types().count(), 1);
        assert_eq!(p.get_node_type(nt_id), Some(&nt));
    }

    #[test]
    fn register_node_type_preserves_insertion_order() {
        let mut p = Project::new("P", TemplateId::new());
        let a = crate::node_type::NodeType::new("A");
        let b = crate::node_type::NodeType::new("B");
        let c = crate::node_type::NodeType::new("C");
        let (aid, bid, cid) = (a.id(), b.id(), c.id());
        p.register_node_type(a).unwrap();
        p.register_node_type(b).unwrap();
        p.register_node_type(c).unwrap();
        let ids: Vec<_> = p.node_types().map(NodeType::id).collect();
        assert_eq!(ids, vec![aid, bid, cid]);
    }

    #[test]
    fn register_node_type_rejects_duplicate_id() {
        let mut p = Project::new("P", TemplateId::new());
        let nt = crate::node_type::NodeType::new("Equipment");
        p.register_node_type(nt.clone()).unwrap();
        let err = p
            .register_node_type(nt)
            .expect_err("same id registered twice");
        assert!(
            matches!(err, crate::error::Error::InvariantViolation(_)),
            "got {err:?}"
        );
        // Registry is unchanged on rejection.
        assert_eq!(p.node_types().count(), 1);
    }

    #[test]
    fn get_node_type_returns_none_for_unknown_id() {
        let p = Project::new("P", TemplateId::new());
        assert!(p.get_node_type(crate::ids::NodeTypeId::new()).is_none());
    }
}
