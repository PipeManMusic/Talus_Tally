//! Node-type blueprint: defines the kind of a [`Node`](crate::node::Node).
//!
//! A `NodeType` is the runtime representation of a template's declaration
//! "a node of this kind exists, is named X, and carries the following
//! properties". In Python this lives in
//! `backend/infra/schema_loader.py::NodeTypeDef` and carries a lot of
//! legacy debt (legacy-id + uuid duality, `_extra_props` bag, mutable
//! feature flags). This Rust port starts with the irreducible minimum
//! and layers behaviour in subsequent cycles.

/// Schema version for serialized `NodeType`. Bump on any breaking shape
/// change so the migration layer can route old payloads correctly.
pub const NODE_TYPE_SCHEMA_VERSION: u32 = 1;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_node_type_has_unique_id_and_given_name() {
        let a = NodeType::new("Equipment");
        let b = NodeType::new("Equipment");
        assert_ne!(a.id(), b.id(), "each NodeType gets a fresh id");
        assert_eq!(a.name(), "Equipment");
        assert_eq!(a.schema_version(), NODE_TYPE_SCHEMA_VERSION);
    }

    #[test]
    fn node_type_roundtrips_through_json() {
        let nt = NodeType::new("Person");
        let json = serde_json::to_string(&nt).unwrap();
        let parsed: NodeType = serde_json::from_str(&json).unwrap();
        assert_eq!(nt, parsed);
    }
}
