//! The structural container for a project's nodes and their tree edges.
//!
//! See `docs/architecture/RUST_MIGRATION_PLAN.md` §4a. This type replaces
//! [`backend/core/graph.py`](../../../../backend/core/graph.py) and absorbs the
//! parent/child information that the Python `Node` carried inline. Keeping
//! edges in one place (and only one place) makes "node disagrees with its
//! parent's children list" impossible by construction.
//!
//! Built one TDD cycle at a time.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use crate::ids::{NodeId, TemplateId};
use crate::node::Node;

/// Schema version of the persisted `Graph` shape.
pub const GRAPH_SCHEMA_VERSION: u32 = 1;

/// Whether a node is a root of the tree or has a parent.
///
/// Modeled as an enum with payload (§4a "make illegal states
/// unrepresentable") rather than `Option<NodeId>` so calling code is
/// forced to handle both cases explicitly.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Parent {
    /// The node is a tree root — no parent.
    Root,
    /// The node has the given parent.
    Of(NodeId),
}

/// The structural container for a project's nodes and tree edges.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Graph {
    template: TemplateId,
    schema_version: u32,
    nodes: IndexMap<NodeId, Node>,
    /// child → parent. A node is a root iff it is absent here.
    edges: IndexMap<NodeId, NodeId>,
}

impl Graph {
    /// Construct an empty graph bound to a template.
    #[must_use]
    pub fn new(template: TemplateId) -> Self {
        Self {
            template,
            schema_version: GRAPH_SCHEMA_VERSION,
            nodes: IndexMap::new(),
            edges: IndexMap::new(),
        }
    }

    /// Number of nodes currently in the graph.
    #[must_use]
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    /// Insert (or replace) a node by its id.
    pub fn insert_node(&mut self, node: Node) {
        self.nodes.insert(node.id(), node);
    }

    /// Borrow a node by id.
    #[must_use]
    pub fn get(&self, id: NodeId) -> Option<&Node> {
        self.nodes.get(&id)
    }

    /// Return the parent relationship of a node.
    #[must_use]
    pub fn parent_of(&self, id: NodeId) -> Parent {
        match self.edges.get(&id) {
            Some(p) => Parent::Of(*p),
            None => Parent::Root,
        }
    }

    /// Set `parent` as the parent of `child`. Overwrites any previous parent.
    ///
    /// # Errors
    /// - [`Error::NotFound`] if either `child` or `parent` is not in the graph.
    /// - [`Error::InvariantViolation`] if `child == parent`, or if the edge
    ///   would create a cycle (i.e. `child` is already an ancestor of `parent`).
    ///
    /// On error the graph is unchanged.
    pub fn set_parent(&mut self, child: NodeId, parent: NodeId) -> crate::error::Result<()> {
        use crate::error::Error;

        if !self.nodes.contains_key(&child) {
            return Err(Error::NotFound(format!("child node {child}")));
        }
        if !self.nodes.contains_key(&parent) {
            return Err(Error::NotFound(format!("parent node {parent}")));
        }
        if child == parent {
            return Err(Error::InvariantViolation(format!(
                "node {child} cannot be its own parent"
            )));
        }
        // Walk the proposed parent's ancestry; if we hit `child`, this edge
        // would close a cycle.
        let mut cursor = parent;
        while let Some(next) = self.edges.get(&cursor) {
            if *next == child {
                return Err(Error::InvariantViolation(format!(
                    "edge {child} -> {parent} would form a cycle"
                )));
            }
            cursor = *next;
        }
        self.edges.insert(child, parent);
        Ok(())
    }

    /// All node ids with no parent edge, in insertion order.
    #[must_use]
    pub fn roots(&self) -> Vec<NodeId> {
        self.nodes
            .keys()
            .filter(|id| !self.edges.contains_key(*id))
            .copied()
            .collect()
    }

    /// All node ids whose parent edge points at `parent`, in insertion order.
    #[must_use]
    pub fn children_of(&self, parent: NodeId) -> Vec<NodeId> {
        self.edges
            .iter()
            .filter_map(|(child, p)| (*p == parent).then_some(*child))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_graph_has_no_nodes() {
        let g = Graph::new(crate::ids::TemplateId::new());
        assert_eq!(g.node_count(), 0);
    }

    #[test]
    fn inserted_node_can_be_looked_up_by_id() {
        let mut g = Graph::new(crate::ids::TemplateId::new());
        let node = crate::node::Node::new(crate::ids::NodeTypeId::new(), "root");
        let id = node.id();
        g.insert_node(node.clone());
        assert_eq!(g.node_count(), 1);
        assert_eq!(g.get(id), Some(&node));
    }

    #[test]
    fn newly_inserted_node_is_a_root() {
        let mut g = Graph::new(crate::ids::TemplateId::new());
        let n = crate::node::Node::new(crate::ids::NodeTypeId::new(), "n");
        let id = n.id();
        g.insert_node(n);
        assert_eq!(g.parent_of(id), Parent::Root);
        assert_eq!(g.roots(), vec![id]);
        assert!(g.children_of(id).is_empty());
    }

    #[test]
    fn set_parent_links_child_to_parent() {
        let mut g = Graph::new(crate::ids::TemplateId::new());
        let parent = crate::node::Node::new(crate::ids::NodeTypeId::new(), "p");
        let child = crate::node::Node::new(crate::ids::NodeTypeId::new(), "c");
        let (pid, cid) = (parent.id(), child.id());
        g.insert_node(parent);
        g.insert_node(child);

        g.set_parent(cid, pid).expect("valid edge");

        assert_eq!(g.parent_of(cid), Parent::Of(pid));
        assert_eq!(g.parent_of(pid), Parent::Root);
        assert_eq!(g.roots(), vec![pid]);
        assert_eq!(g.children_of(pid), vec![cid]);
        assert!(g.children_of(cid).is_empty());
    }

    #[test]
    fn set_parent_overwrites_previous_parent() {
        let mut g = Graph::new(crate::ids::TemplateId::new());
        let a = crate::node::Node::new(crate::ids::NodeTypeId::new(), "a");
        let b = crate::node::Node::new(crate::ids::NodeTypeId::new(), "b");
        let c = crate::node::Node::new(crate::ids::NodeTypeId::new(), "c");
        let (aid, bid, cid) = (a.id(), b.id(), c.id());
        g.insert_node(a);
        g.insert_node(b);
        g.insert_node(c);

        g.set_parent(cid, aid).expect("valid edge");
        g.set_parent(cid, bid).expect("valid edge");

        assert_eq!(g.parent_of(cid), Parent::Of(bid));
        assert!(g.children_of(aid).is_empty(), "a no longer parents c");
        assert_eq!(g.children_of(bid), vec![cid]);
    }

    #[test]
    fn set_parent_rejects_unknown_child() {
        let mut g = Graph::new(crate::ids::TemplateId::new());
        let p = crate::node::Node::new(crate::ids::NodeTypeId::new(), "p");
        let pid = p.id();
        g.insert_node(p);
        let ghost = crate::ids::NodeId::new();

        let err = g.set_parent(ghost, pid).expect_err("unknown child");
        assert!(
            matches!(err, crate::error::Error::NotFound(_)),
            "got {err:?}"
        );
    }

    #[test]
    fn set_parent_rejects_unknown_parent() {
        let mut g = Graph::new(crate::ids::TemplateId::new());
        let c = crate::node::Node::new(crate::ids::NodeTypeId::new(), "c");
        let cid = c.id();
        g.insert_node(c);
        let ghost = crate::ids::NodeId::new();

        let err = g.set_parent(cid, ghost).expect_err("unknown parent");
        assert!(
            matches!(err, crate::error::Error::NotFound(_)),
            "got {err:?}"
        );
    }

    #[test]
    fn set_parent_rejects_self_parent() {
        let mut g = Graph::new(crate::ids::TemplateId::new());
        let n = crate::node::Node::new(crate::ids::NodeTypeId::new(), "n");
        let id = n.id();
        g.insert_node(n);

        let err = g.set_parent(id, id).expect_err("self-parent");
        assert!(
            matches!(err, crate::error::Error::InvariantViolation(_)),
            "got {err:?}"
        );
    }

    #[test]
    fn set_parent_rejects_cycle_through_ancestry() {
        // a -> b -> c, then try to make a a child of c (would form a cycle)
        let mut g = Graph::new(crate::ids::TemplateId::new());
        let a = crate::node::Node::new(crate::ids::NodeTypeId::new(), "a");
        let b = crate::node::Node::new(crate::ids::NodeTypeId::new(), "b");
        let c = crate::node::Node::new(crate::ids::NodeTypeId::new(), "c");
        let (aid, bid, cid) = (a.id(), b.id(), c.id());
        g.insert_node(a);
        g.insert_node(b);
        g.insert_node(c);
        g.set_parent(bid, aid).unwrap();
        g.set_parent(cid, bid).unwrap();

        let err = g.set_parent(aid, cid).expect_err("would cycle");
        assert!(
            matches!(err, crate::error::Error::InvariantViolation(_)),
            "got {err:?}"
        );
        // Graph is unchanged after a rejected mutation.
        assert_eq!(g.parent_of(aid), Parent::Root);
    }
}
