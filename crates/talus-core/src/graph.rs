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

/// The structural container for a project's nodes and tree edges.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Graph {
    template: TemplateId,
    schema_version: u32,
    nodes: IndexMap<NodeId, Node>,
}

impl Graph {
    /// Construct an empty graph bound to a template.
    #[must_use]
    pub fn new(template: TemplateId) -> Self {
        Self {
            template,
            schema_version: GRAPH_SCHEMA_VERSION,
            nodes: IndexMap::new(),
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
}
