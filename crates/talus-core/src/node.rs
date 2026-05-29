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

    /// Return a new `Node` with `value` inserted (or overwritten) at `id`.
    ///
    /// Consuming-self builder shape: this is construction, not in-place
    /// mutation, so it doesn't violate §4a "all mutation through
    /// `apply_command`". The actual `Command::SetProperty` pipeline
    /// arrives in Phase 2 and will be the only entry point for changing
    /// an existing node's properties at runtime.
    #[must_use]
    pub fn with_property(mut self, id: PropertyId, value: Property) -> Self {
        self.properties.insert(id, value);
        self
    }

    /// Test-only constructor accepting an explicit [`NodeId`].
    ///
    /// Public `Node::new` always mints a fresh id per §4a "one ID
    /// generator". This sibling constructor exists solely so cross-module
    /// tests (most notably the `Graph` snapshot test in `graph.rs`) can
    /// build deterministic fixtures with stable UUIDs without violating
    /// field privacy. Gated behind `#[cfg(test)]` so production code
    /// cannot reach it.
    #[cfg(test)]
    #[must_use]
    pub(crate) fn with_id_for_test(id: NodeId, kind: NodeTypeId, name: impl Into<String>) -> Self {
        Self {
            id,
            kind,
            name: name.into(),
            schema_version: NODE_SCHEMA_VERSION,
            properties: IndexMap::new(),
        }
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

    #[test]
    fn node_json_shape_is_locked() {
        use uuid::Uuid;

        // Deterministic ids so the snapshot is stable across runs.
        let mk =
            |n: u8| Uuid::parse_str(&format!("00000000-0000-4000-8000-0000000000{n:02}")).unwrap();
        let node = Node {
            id: NodeId::from(mk(1)),
            kind: NodeTypeId::from(mk(2)),
            name: "Task A".into(),
            schema_version: NODE_SCHEMA_VERSION,
            properties: IndexMap::new(),
        }
        .with_property(PropertyId::from(mk(3)), Property::Text("Alice".into()))
        .with_property(PropertyId::from(mk(4)), Property::Boolean(true));

        insta::assert_json_snapshot!("node_with_two_properties", node);
    }

    #[test]
    fn with_property_returns_new_node_with_property_inserted() {
        let pid = PropertyId::new();
        let node = Node::new(NodeTypeId::new(), "Task A")
            .with_property(pid, Property::Text("Alice".into()));

        assert_eq!(node.properties().len(), 1);
        assert_eq!(
            node.properties().get(&pid),
            Some(&Property::Text("Alice".into()))
        );
    }

    #[test]
    fn with_property_overwrites_existing_value_for_same_id() {
        let pid = PropertyId::new();
        let node = Node::new(NodeTypeId::new(), "Task A")
            .with_property(pid, Property::Text("first".into()))
            .with_property(pid, Property::Text("second".into()));

        assert_eq!(node.properties().len(), 1);
        assert_eq!(
            node.properties().get(&pid),
            Some(&Property::Text("second".into()))
        );
    }

    #[test]
    fn with_property_preserves_insertion_order() {
        let p1 = PropertyId::new();
        let p2 = PropertyId::new();
        let p3 = PropertyId::new();
        let node = Node::new(NodeTypeId::new(), "Task A")
            .with_property(p1, Property::Boolean(true))
            .with_property(p2, Property::Number(1.0))
            .with_property(p3, Property::Text("x".into()));

        let keys: Vec<_> = node.properties().keys().copied().collect();
        assert_eq!(keys, vec![p1, p2, p3]);
    }
}
