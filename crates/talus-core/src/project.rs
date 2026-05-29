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
use crate::ids::{NodeId, NodeTypeId, ProjectId, TemplateId};
use crate::node::Node;
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

    /// Build a `Project` with a caller-supplied id, for deterministic
    /// snapshot fixtures only.
    #[cfg(test)]
    pub(crate) fn with_id_for_test(
        id: ProjectId,
        name: impl Into<String>,
        template: TemplateId,
    ) -> Self {
        Self {
            id,
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

    /// Insert `node` into the project's graph after validating its kind.
    ///
    /// # Errors
    /// - [`crate::error::Error::NotFound`] if `node.kind()` is not in
    ///   the node-type registry.
    /// - [`crate::error::Error::InvariantViolation`] if any of the
    ///   node's properties carries a `PropertyId` outside the
    ///   registered `NodeType`'s allowed-property set.
    ///
    /// On error the inner graph is unchanged.
    pub fn insert_node(&mut self, node: Node) -> crate::error::Result<()> {
        use crate::error::Error;

        let Some(nt) = self.node_types.get(&node.kind()) else {
            return Err(Error::NotFound(format!(
                "node type {} is not registered",
                node.kind()
            )));
        };
        for pid in node.properties().keys() {
            if !nt.allows_property(*pid) {
                return Err(Error::InvariantViolation(format!(
                    "property {pid} is not in the allowlist for node type {}",
                    node.kind()
                )));
            }
        }
        self.graph.insert_node(node);
        Ok(())
    }

    /// Set `parent` as the parent of `child`, enforcing the
    /// allowed-children rule from the parent's [`NodeType`].
    ///
    /// # Errors
    /// - [`crate::error::Error::NotFound`] if either id is not in the
    ///   graph (propagated from [`Graph::set_parent`]), or if the
    ///   parent node's kind isn't in the registry.
    /// - [`crate::error::Error::InvariantViolation`] if the parent
    ///   `NodeType`'s `allowed_children` does not contain the child's
    ///   kind, or if the edge would violate any structural rule
    ///   enforced by [`Graph::set_parent`] (self-parent, cycle).
    ///
    /// On error the graph is unchanged.
    pub fn set_parent(&mut self, child: NodeId, parent: NodeId) -> crate::error::Result<()> {
        use crate::error::Error;

        let child_kind = self
            .graph
            .get(child)
            .ok_or_else(|| Error::NotFound(format!("child node {child}")))?
            .kind();
        let parent_kind = self
            .graph
            .get(parent)
            .ok_or_else(|| Error::NotFound(format!("parent node {parent}")))?
            .kind();
        let parent_nt = self
            .node_types
            .get(&parent_kind)
            .ok_or_else(|| Error::NotFound(format!("node type {parent_kind} is not registered")))?;
        if !parent_nt.allows_child(child_kind) {
            return Err(Error::InvariantViolation(format!(
                "node type {parent_kind} does not allow child of kind {child_kind}",
            )));
        }
        self.graph.set_parent(child, parent)
    }

    /// Remove a node and its descendants from the project's graph.
    ///
    /// Delegates to [`Graph::remove_node`]; see that method for the
    /// removal order and error semantics.
    ///
    /// # Errors
    /// - [`crate::error::Error::NotFound`] if `id` is not in the graph.
    ///   On error the graph is unchanged.
    pub fn remove_node(&mut self, id: NodeId) -> crate::error::Result<Vec<NodeId>> {
        self.graph.remove_node(id)
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

    #[test]
    fn insert_node_with_registered_kind_succeeds() {
        let mut p = Project::new("P", TemplateId::new());
        let nt = crate::node_type::NodeType::new("Equipment");
        let kind = nt.id();
        p.register_node_type(nt).unwrap();

        let node = crate::node::Node::new(kind, "Excavator");
        let nid = node.id();
        p.insert_node(node).unwrap();

        assert_eq!(p.graph().node_count(), 1);
        assert!(p.graph().get(nid).is_some());
    }

    #[test]
    fn insert_node_with_unregistered_kind_is_rejected() {
        let mut p = Project::new("P", TemplateId::new());
        let stray_kind = crate::ids::NodeTypeId::new();
        let node = crate::node::Node::new(stray_kind, "Orphan");

        let err = p.insert_node(node).expect_err("kind not registered");
        assert!(
            matches!(err, crate::error::Error::NotFound(_)),
            "got {err:?}"
        );
        // Graph is unchanged on rejection.
        assert_eq!(p.graph().node_count(), 0);
    }

    #[test]
    fn insert_node_with_allowed_property_succeeds() {
        let mut p = Project::new("P", TemplateId::new());
        let pid = crate::ids::PropertyId::new();
        let nt = crate::node_type::NodeType::new("Equipment").with_allowed_property(pid);
        let kind = nt.id();
        p.register_node_type(nt).unwrap();

        let node = crate::node::Node::new(kind, "Crane")
            .with_property(pid, crate::property::Property::Boolean(true));
        let nid = node.id();
        p.insert_node(node).unwrap();
        assert!(p.graph().get(nid).is_some());
    }

    #[test]
    fn insert_node_with_disallowed_property_is_rejected() {
        let mut p = Project::new("P", TemplateId::new());
        let allowed_pid = crate::ids::PropertyId::new();
        let stray_pid = crate::ids::PropertyId::new();
        let nt = crate::node_type::NodeType::new("Equipment").with_allowed_property(allowed_pid);
        let kind = nt.id();
        p.register_node_type(nt).unwrap();

        // Mix one allowed property and one disallowed property; the whole
        // insert must be rejected, leaving the graph unchanged.
        let node = crate::node::Node::new(kind, "Crane")
            .with_property(allowed_pid, crate::property::Property::Boolean(true))
            .with_property(stray_pid, crate::property::Property::Number(1.0));

        let err = p.insert_node(node).expect_err("disallowed property");
        assert!(
            matches!(err, crate::error::Error::InvariantViolation(_)),
            "got {err:?}"
        );
        assert_eq!(p.graph().node_count(), 0);
    }

    // Test helper: register two NodeTypes (parent allowing child) and
    // insert one node of each kind. Returns (project, parent_id, child_id).
    fn project_with_two_kinds_and_two_nodes() -> (Project, crate::ids::NodeId, crate::ids::NodeId) {
        let mut p = Project::new("P", TemplateId::new());
        let child_kind = crate::node_type::NodeType::new("Task");
        let child_kind_id = child_kind.id();
        let parent_kind =
            crate::node_type::NodeType::new("Project").with_allowed_child(child_kind_id);
        let parent_kind_id = parent_kind.id();
        p.register_node_type(child_kind).unwrap();
        p.register_node_type(parent_kind).unwrap();

        let parent_node = crate::node::Node::new(parent_kind_id, "Root");
        let parent_id = parent_node.id();
        let child_node = crate::node::Node::new(child_kind_id, "Leaf");
        let child_id = child_node.id();
        p.insert_node(parent_node).unwrap();
        p.insert_node(child_node).unwrap();

        (p, parent_id, child_id)
    }

    #[test]
    fn set_parent_succeeds_when_parent_kind_allows_child_kind() {
        let (mut p, parent_id, child_id) = project_with_two_kinds_and_two_nodes();
        p.set_parent(child_id, parent_id).unwrap();
        assert_eq!(p.graph().children_of(parent_id), vec![child_id]);
    }

    #[test]
    fn set_parent_rejects_when_parent_kind_disallows_child_kind() {
        // Build a project where the parent's NodeType does NOT list the
        // child's kind in allowed_children.
        let mut p = Project::new("P", TemplateId::new());
        let child_kind = crate::node_type::NodeType::new("Task");
        let parent_kind = crate::node_type::NodeType::new("Project"); // no allowed_children
        let (child_kind_id, parent_kind_id) = (child_kind.id(), parent_kind.id());
        p.register_node_type(child_kind).unwrap();
        p.register_node_type(parent_kind).unwrap();

        let parent_node = crate::node::Node::new(parent_kind_id, "Root");
        let child_node = crate::node::Node::new(child_kind_id, "Leaf");
        let (parent_id, child_id) = (parent_node.id(), child_node.id());
        p.insert_node(parent_node).unwrap();
        p.insert_node(child_node).unwrap();

        let err = p
            .set_parent(child_id, parent_id)
            .expect_err("child kind not allowed under parent kind");
        assert!(
            matches!(err, crate::error::Error::InvariantViolation(_)),
            "got {err:?}"
        );
        // Graph is unchanged on rejection.
        assert_eq!(
            p.graph().children_of(parent_id),
            Vec::<crate::ids::NodeId>::new()
        );
    }

    #[test]
    fn set_parent_returns_not_found_when_child_missing_from_graph() {
        let (mut p, parent_id, _) = project_with_two_kinds_and_two_nodes();
        let stray = crate::ids::NodeId::new();
        let err = p.set_parent(stray, parent_id).expect_err("unknown child");
        assert!(
            matches!(err, crate::error::Error::NotFound(_)),
            "got {err:?}"
        );
    }

    #[test]
    fn remove_node_returns_subtree_and_drops_nodes() {
        let (mut p, parent_id, child_id) = project_with_two_kinds_and_two_nodes();
        p.set_parent(child_id, parent_id).unwrap();
        let removed = p.remove_node(parent_id).unwrap();
        assert_eq!(removed, vec![parent_id, child_id]);
        assert_eq!(p.graph().node_count(), 0);
        assert!(p.graph().get(parent_id).is_none());
        assert!(p.graph().get(child_id).is_none());
    }

    #[test]
    fn remove_node_returns_not_found_for_unknown_id() {
        let (mut p, _, _) = project_with_two_kinds_and_two_nodes();
        let stray = crate::ids::NodeId::new();
        let err = p.remove_node(stray).expect_err("unknown id");
        assert!(
            matches!(err, crate::error::Error::NotFound(_)),
            "got {err:?}"
        );
        // Graph is unchanged.
        assert_eq!(p.graph().node_count(), 2);
    }

    #[test]
    fn project_json_shape_is_locked() {
        use crate::ids::{NodeId, NodeTypeId, ProjectId, PropertyId, TemplateId};
        use crate::node::Node;
        use crate::node_type::NodeType;
        use crate::property::Property;
        use uuid::Uuid;

        let mk =
            |n: u8| Uuid::parse_str(&format!("00000000-0000-4000-8000-0000000000{n:02}")).unwrap();

        let child_kind_id = NodeTypeId::from(mk(0x20));
        let parent_kind_id = NodeTypeId::from(mk(0x21));
        let prop_id = PropertyId::from(mk(0x30));

        let child_kind =
            NodeType::with_id_for_test(child_kind_id, "Task").with_allowed_property(prop_id);
        let parent_kind =
            NodeType::with_id_for_test(parent_kind_id, "Section").with_allowed_child(child_kind_id);

        let mut p = Project::with_id_for_test(
            ProjectId::from(mk(0x01)),
            "Snapshot",
            TemplateId::from(mk(0x02)),
        );
        p.register_node_type(parent_kind).unwrap();
        p.register_node_type(child_kind).unwrap();

        let root = Node::with_id_for_test(NodeId::from(mk(0x10)), parent_kind_id, "Root");
        let leaf = Node::with_id_for_test(NodeId::from(mk(0x11)), child_kind_id, "Leaf")
            .with_property(prop_id, Property::Boolean(true));
        let (root_id, leaf_id) = (root.id(), leaf.id());
        p.insert_node(root).unwrap();
        p.insert_node(leaf).unwrap();
        p.set_parent(leaf_id, root_id).unwrap();

        insta::assert_json_snapshot!("project_full_shape", p);
    }

    // Test helper: project with one NodeType "Task" that allows one
    // PropertyId, and one node of that kind already inserted. Returns
    // (project, node_id, allowed_pid).
    fn project_with_one_allowed_property() -> (Project, crate::ids::NodeId, crate::ids::PropertyId)
    {
        let mut p = Project::new("P", TemplateId::new());
        let pid = crate::ids::PropertyId::new();
        let nt = crate::node_type::NodeType::new("Task").with_allowed_property(pid);
        let kind = nt.id();
        p.register_node_type(nt).unwrap();
        let node = crate::node::Node::new(kind, "n");
        let nid = node.id();
        p.insert_node(node).unwrap();
        (p, nid, pid)
    }

    #[test]
    fn set_property_succeeds_when_property_is_allowed() {
        let (mut p, nid, pid) = project_with_one_allowed_property();
        p.set_property(nid, pid, crate::property::Property::Boolean(true))
            .unwrap();
        let stored = p.graph().get(nid).unwrap().properties().get(&pid).cloned();
        assert_eq!(stored, Some(crate::property::Property::Boolean(true)));
    }

    #[test]
    fn set_property_overwrites_existing_value_for_same_pid() {
        let (mut p, nid, pid) = project_with_one_allowed_property();
        p.set_property(nid, pid, crate::property::Property::Boolean(false))
            .unwrap();
        p.set_property(nid, pid, crate::property::Property::Boolean(true))
            .unwrap();
        let stored = p.graph().get(nid).unwrap().properties().get(&pid).cloned();
        assert_eq!(stored, Some(crate::property::Property::Boolean(true)));
        assert_eq!(p.graph().get(nid).unwrap().properties().len(), 1);
    }

    #[test]
    fn set_property_rejects_pid_not_in_allowed_properties() {
        let (mut p, nid, _allowed) = project_with_one_allowed_property();
        let stray = crate::ids::PropertyId::new();
        let err = p
            .set_property(nid, stray, crate::property::Property::Boolean(true))
            .expect_err("disallowed property");
        assert!(
            matches!(err, crate::error::Error::InvariantViolation(_)),
            "got {err:?}"
        );
        // Node unchanged.
        assert!(p.graph().get(nid).unwrap().properties().is_empty());
    }

    #[test]
    fn set_property_returns_not_found_for_unknown_node() {
        let (mut p, _nid, pid) = project_with_one_allowed_property();
        let stray = crate::ids::NodeId::new();
        let err = p
            .set_property(stray, pid, crate::property::Property::Boolean(true))
            .expect_err("unknown node");
        assert!(
            matches!(err, crate::error::Error::NotFound(_)),
            "got {err:?}"
        );
    }
}
