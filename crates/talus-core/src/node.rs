//! A single node in a project tree.
//!
//! See `docs/architecture/RUST_MIGRATION_PLAN.md` §4a — this type intentionally
//! carries less than `backend/core/node.py`: no `parent_id`/`children` (tree
//! edges live on `Graph`), no untyped `metadata`, and `schema_version` is
//! mandatory.
//!
//! Built one TDD cycle at a time.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use crate::ids::{NodeId, NodeTypeId, PropertyId};
use crate::property::Property;

/// Schema version of the persisted `Node` shape.
///
/// Bumped any time `Node`'s on-disk representation changes. Migrations are
/// typed `(NodeV{N}) -> NodeV{N+1}` conversions, never stringly-typed key
/// remapping like `backend/infra/migrations.py`.
pub const NODE_SCHEMA_VERSION: u32 = 1;

/// A single node in a project tree.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Node {
    id: NodeId,
    kind: NodeTypeId,
    name: String,
    schema_version: u32,
    properties: IndexMap<PropertyId, Property>,
}

impl Node {
    /// Construct a new `Node` with a freshly minted [`NodeId`] and an empty
    /// property map.
    ///
    /// Properties are hydrated by an explicit `Command` after construction,
    /// never inline — see §4a "one pipeline, no exceptions".
    pub fn new(kind: NodeTypeId, name: impl Into<String>) -> Self {
        Self {
            id: NodeId::new(),
            kind,
            name: name.into(),
            schema_version: NODE_SCHEMA_VERSION,
            properties: IndexMap::new(),
        }
    }

    /// This node's identifier.
    #[must_use]
    pub fn id(&self) -> NodeId {
        self.id
    }

    /// The blueprint this node is an instance of.
    #[must_use]
    pub fn kind(&self) -> NodeTypeId {
        self.kind
    }

    /// Display name. Blueprint-driven validation arrives with the `Schema` slice.
    #[must_use]
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Schema version this instance was constructed under.
    #[must_use]
    pub fn schema_version(&self) -> u32 {
        self.schema_version
    }

    /// Borrow the property map. Iteration order matches insertion order.
    #[must_use]
    pub fn properties(&self) -> &IndexMap<PropertyId, Property> {
        &self.properties
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_node_has_unique_id_and_zero_properties() {
        let nt = crate::ids::NodeTypeId::new();
        let a = Node::new(nt, "Task A");
        let b = Node::new(nt, "Task B");

        assert_ne!(a.id(), b.id(), "every Node::new mints a fresh NodeId");
        assert_eq!(a.kind(), nt);
        assert_eq!(a.name(), "Task A");
        assert_eq!(a.schema_version(), NODE_SCHEMA_VERSION);
        assert!(a.properties().is_empty());
    }

    #[test]
    fn node_roundtrips_through_json() {
        let nt = crate::ids::NodeTypeId::new();
        let original = Node::new(nt, "Task A");
        let json = serde_json::to_string(&original).expect("serialize");
        let parsed: Node =
            serde_json::from_str(&json).unwrap_or_else(|e| panic!("deserialize {json}: {e}"));
        assert_eq!(original, parsed);
    }
}
