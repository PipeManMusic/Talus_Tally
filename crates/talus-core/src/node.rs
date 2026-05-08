//! A single node in a project tree.
//!
//! See `docs/architecture/RUST_MIGRATION_PLAN.md` §4a — this type intentionally
//! carries less than `backend/core/node.py`: no `parent_id`/`children` (tree
//! edges live on `Graph`), no untyped `metadata`, and `schema_version` is
//! mandatory.
//!
//! Built one TDD cycle at a time.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_node_has_unique_id_and_zero_properties() {
        let nt = crate::ids::NodeTypeId::new();
        let a = Node::new(nt, "Task A");
        let b = Node::new(nt, "Task B");

        assert_ne!(a.id(), b.id(), "every Node::new mints a fresh NodeId");
        assert_eq!(a.node_type(), nt);
        assert_eq!(a.name(), "Task A");
        assert_eq!(a.schema_version(), NODE_SCHEMA_VERSION);
        assert!(a.properties().is_empty());
    }
}
