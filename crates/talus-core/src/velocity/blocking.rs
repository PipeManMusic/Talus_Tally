//! Blocking relationships and their cascade rules.
//!
//! Ports the blocking helpers of `backend/core/velocity_engine.py`
//! (`_is_node_blocked`, `_get_blocking_nodes`, `_get_blocked_node_ids`). The
//! blocking graph is a **separate input** from the project tree: in Python it
//! arrives as `{"relationships": [{"blockedNodeId": ..., "blockingNodeId": ...}]}`.
//!
//! A node is blocked if it is the `blocked` side of any relationship, or if
//! any of its ancestors is — a block cascades down the tree to descendants.
//! The scoring fold (`_get_blocked_nodes_score` and the zeroing of a blocked
//! node's total) lives in the engine, since it recurses into per-node scores.

use serde::{Deserialize, Serialize};

use crate::graph::{Graph, Parent};
use crate::ids::NodeId;

/// Maximum ancestor walk depth, mirroring the Python `range(100)` guard. The
/// project graph forbids cycles structurally, so this is purely defensive.
const MAX_ANCESTOR_DEPTH: usize = 100;

/// A single "X blocks Y" relationship.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockingRelationship {
    /// The node that is blocked.
    pub blocked_node_id: NodeId,
    /// The node doing the blocking.
    pub blocking_node_id: NodeId,
}

/// The full set of blocking relationships for a project.
///
/// Wire shape: `{ "relationships": [ { "blockedNodeId": .., "blockingNodeId": .. } ] }`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct BlockingGraph {
    /// Every blocking relationship; order is preserved for parity with the
    /// Python list-scan order.
    #[serde(default)]
    pub relationships: Vec<BlockingRelationship>,
}

impl BlockingGraph {
    /// Whether `node_id` is blocked, directly or via any ancestor.
    #[must_use]
    pub fn is_blocked(&self, graph: &Graph, node_id: NodeId) -> bool {
        if self.is_directly_blocked(node_id) {
            return true;
        }
        ancestors(graph, node_id)
            .into_iter()
            .any(|ancestor| self.is_directly_blocked(ancestor))
    }

    /// The nodes blocking `node_id`, directly first then via each ancestor
    /// (ancestors walked nearest-first, each ancestor's relationships in
    /// list order). Mirrors `_get_blocking_nodes`.
    #[must_use]
    pub fn blocking_nodes(&self, graph: &Graph, node_id: NodeId) -> Vec<NodeId> {
        let mut blocking = self.blockers_of(node_id);
        for ancestor in ancestors(graph, node_id) {
            blocking.extend(self.blockers_of(ancestor));
        }
        blocking
    }

    /// The nodes that `node_id` directly blocks (no cascade). Mirrors
    /// `_get_blocked_node_ids`.
    #[must_use]
    pub fn blocked_node_ids(&self, node_id: NodeId) -> Vec<NodeId> {
        self.relationships
            .iter()
            .filter(|r| r.blocking_node_id == node_id)
            .map(|r| r.blocked_node_id)
            .collect()
    }

    /// Whether `node_id` is named as the blocked side of any relationship.
    fn is_directly_blocked(&self, node_id: NodeId) -> bool {
        self.relationships
            .iter()
            .any(|r| r.blocked_node_id == node_id)
    }

    /// The nodes directly blocking `node_id`, in relationship order.
    fn blockers_of(&self, node_id: NodeId) -> Vec<NodeId> {
        self.relationships
            .iter()
            .filter(|r| r.blocked_node_id == node_id)
            .map(|r| r.blocking_node_id)
            .collect()
    }
}

/// Collect a node's ancestors, nearest first, capped at [`MAX_ANCESTOR_DEPTH`].
fn ancestors(graph: &Graph, node_id: NodeId) -> Vec<NodeId> {
    let mut result = Vec::new();
    let mut current = node_id;
    for _ in 0..MAX_ANCESTOR_DEPTH {
        match graph.parent_of(current) {
            Parent::Root => break,
            Parent::Of(parent) => {
                result.push(parent);
                current = parent;
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::ids::TemplateId;
    use crate::node::Node;
    use crate::node_type::NodeType;
    use crate::project::Project;

    /// Build a project with a `Top` > `Mid` > `Leaf` chain. Returns
    /// `(project, top_id, mid_id, leaf_id)`.
    fn chain() -> (Project, NodeId, NodeId, NodeId) {
        let mut p = Project::new("P", TemplateId::new());
        let leaf = NodeType::new("Task");
        let leaf_kind = leaf.id();
        let mid = NodeType::new("Mid").with_allowed_child(leaf_kind);
        let mid_kind = mid.id();
        let top = NodeType::new("Top").with_allowed_child(mid_kind);
        let top_kind = top.id();
        p.register_node_type(leaf).unwrap();
        p.register_node_type(mid).unwrap();
        p.register_node_type(top).unwrap();

        let top_node = Node::new(top_kind, "Top");
        let top_id = top_node.id();
        let mid_node = Node::new(mid_kind, "Mid");
        let mid_id = mid_node.id();
        let leaf_node = Node::new(leaf_kind, "Leaf");
        let leaf_id = leaf_node.id();
        p.insert_node(top_node).unwrap();
        p.insert_node(mid_node).unwrap();
        p.insert_node(leaf_node).unwrap();
        p.set_parent(mid_id, top_id).unwrap();
        p.set_parent(leaf_id, mid_id).unwrap();

        (p, top_id, mid_id, leaf_id)
    }

    fn rel(blocked: NodeId, blocking: NodeId) -> BlockingRelationship {
        BlockingRelationship {
            blocked_node_id: blocked,
            blocking_node_id: blocking,
        }
    }

    #[test]
    fn empty_graph_blocks_nothing() {
        let (p, _top, _mid, leaf) = chain();
        let bg = BlockingGraph::default();
        assert!(!bg.is_blocked(p.graph(), leaf));
        assert!(bg.blocking_nodes(p.graph(), leaf).is_empty());
        assert!(bg.blocked_node_ids(leaf).is_empty());
    }

    #[test]
    fn directly_blocked_node_is_blocked() {
        let (p, _top, _mid, leaf) = chain();
        let blocker = NodeId::new();
        let bg = BlockingGraph {
            relationships: vec![rel(leaf, blocker)],
        };
        assert!(bg.is_blocked(p.graph(), leaf));
        assert_eq!(bg.blocking_nodes(p.graph(), leaf), vec![blocker]);
    }

    #[test]
    fn unrelated_node_is_not_blocked() {
        let (p, _top, mid, _leaf) = chain();
        let blocker = NodeId::new();
        let bg = BlockingGraph {
            relationships: vec![rel(mid, blocker)],
        };
        // A node that is neither blocked nor a descendant of a blocked node.
        let stray = NodeId::new();
        assert!(!bg.is_blocked(p.graph(), stray));
    }

    #[test]
    fn ancestor_block_cascades_to_descendant() {
        let (p, top, _mid, leaf) = chain();
        let blocker = NodeId::new();
        let bg = BlockingGraph {
            relationships: vec![rel(top, blocker)],
        };
        // top is blocked => mid and leaf inherit the block.
        assert!(bg.is_blocked(p.graph(), leaf));
        assert_eq!(bg.blocking_nodes(p.graph(), leaf), vec![blocker]);
    }

    #[test]
    fn blocking_nodes_combines_direct_and_ancestor() {
        let (p, top, _mid, leaf) = chain();
        let direct = NodeId::new();
        let via_ancestor = NodeId::new();
        let bg = BlockingGraph {
            relationships: vec![rel(leaf, direct), rel(top, via_ancestor)],
        };
        // direct first, then ancestor walk (mid has none, top has one).
        assert_eq!(
            bg.blocking_nodes(p.graph(), leaf),
            vec![direct, via_ancestor]
        );
    }

    #[test]
    fn blocked_node_ids_lists_direct_targets_only() {
        let (_p, top, mid, leaf) = chain();
        let blocker = NodeId::new();
        let bg = BlockingGraph {
            relationships: vec![rel(mid, blocker), rel(leaf, blocker)],
        };
        // blocker blocks mid and leaf directly; no cascade in this accessor.
        assert_eq!(bg.blocked_node_ids(blocker), vec![mid, leaf]);
        assert!(bg.blocked_node_ids(top).is_empty());
    }

    #[test]
    fn wire_shape_uses_camelcase_keys() {
        let blocked = NodeId::new();
        let blocking = NodeId::new();
        let bg = BlockingGraph {
            relationships: vec![rel(blocked, blocking)],
        };
        let value = serde_json::to_value(&bg).unwrap();
        let rel0 = &value["relationships"][0];
        assert!(rel0.get("blockedNodeId").is_some());
        assert!(rel0.get("blockingNodeId").is_some());

        let back: BlockingGraph = serde_json::from_value(value).unwrap();
        assert_eq!(back, bg);
    }

    #[test]
    fn missing_relationships_key_defaults_empty() {
        let bg: BlockingGraph = serde_json::from_str("{}").unwrap();
        assert!(bg.relationships.is_empty());
    }
}
