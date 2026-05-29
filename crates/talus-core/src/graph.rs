//! The structural container for a project's nodes and their tree edges.
//!
//! See `docs/architecture/RUST_MIGRATION_PLAN.md` §4a. This type replaces
//! [`backend/core/graph.py`](../../../../backend/core/graph.py) and absorbs the
//! parent/child information that the Python `Node` carried inline. Keeping
//! edges in one place (and only one place) makes "node disagrees with its
//! parent's children list" impossible by construction.
//!
//! Built one TDD cycle at a time.

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
