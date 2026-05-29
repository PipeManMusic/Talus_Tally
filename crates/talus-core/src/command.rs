//! Command / Event pipeline.
//!
//! All runtime mutations of a [`crate::project::Project`] flow through
//! a `Command` value passed to `apply_command`. Each accepted command
//! produces an `Event` describing what changed. Commands are intent;
//! events are fact. Rejected commands leave state unchanged and
//! surface an [`crate::error::Error`].

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::ids::{NodeId, NodeTypeId, PropertyId};
use crate::node::Node;
use crate::node_type::NodeType;
use crate::project::Project;
use crate::property::Property;

/// A request to mutate a [`Project`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum Command {
    /// Register a new [`NodeType`] in the project's registry.
    RegisterNodeType(NodeType),
    /// Insert a new [`Node`] into the project's graph. The node's
    /// kind must already be registered, and every property on the
    /// node must be in the kind's `allowed_properties`.
    InsertNode(Node),
    /// Set `parent` as the parent of `child`. The parent's
    /// [`NodeType`] must list the child's kind in its
    /// `allowed_children`. Overwrites any previous parent of `child`.
    SetParent {
        /// The node being re-parented.
        child: NodeId,
        /// The new parent.
        parent: NodeId,
    },
    /// Insert or overwrite a property on an existing node. `pid` must
    /// be in the node kind's `allowed_properties`.
    SetProperty {
        /// The node whose property is being set.
        node: NodeId,
        /// The property id.
        pid: PropertyId,
        /// The new value.
        value: Property,
    },
    /// Remove a node and its descendants from the graph.
    RemoveNode {
        /// The root of the subtree to remove.
        id: NodeId,
    },
}

/// A fact describing a change that was applied to a [`Project`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum Event {
    /// A new [`NodeType`] was added to the registry.
    NodeTypeRegistered {
        /// The id of the newly registered [`NodeType`].
        node_type_id: NodeTypeId,
    },
    /// A new [`Node`] was inserted into the graph.
    NodeInserted {
        /// The id of the inserted [`Node`].
        node_id: NodeId,
    },
    /// `child`'s parent was set to `parent`.
    ParentChanged {
        /// The re-parented node.
        child: NodeId,
        /// Its new parent.
        parent: NodeId,
    },
    /// A property value on a node was inserted or overwritten.
    PropertyChanged {
        /// The node whose property was changed.
        node: NodeId,
        /// The property id whose value was set.
        pid: PropertyId,
    },
    /// A subtree rooted at the first id was removed from the graph.
    SubtreeRemoved {
        /// All removed node ids in BFS order, root first.
        ids: Vec<NodeId>,
    },
}

/// Apply `cmd` to `state`, mutating it in place on success.
///
/// On `Ok`, the project has been updated and the returned `Event`
/// describes the change. On `Err`, the project is unchanged.
///
/// # Errors
/// Propagates whatever the underlying [`Project`] mutation returns;
/// see each [`Command`] variant for the specifics.
pub fn apply_command(state: &mut Project, cmd: Command) -> Result<Event> {
    match cmd {
        Command::RegisterNodeType(nt) => {
            let id = nt.id();
            state.register_node_type(nt)?;
            Ok(Event::NodeTypeRegistered { node_type_id: id })
        }
        Command::InsertNode(node) => {
            let id = node.id();
            state.insert_node(node)?;
            Ok(Event::NodeInserted { node_id: id })
        }
        Command::SetParent { child, parent } => {
            state.set_parent(child, parent)?;
            Ok(Event::ParentChanged { child, parent })
        }
        Command::SetProperty { node, pid, value } => {
            state.set_property(node, pid, value)?;
            Ok(Event::PropertyChanged { node, pid })
        }
        Command::RemoveNode { id } => {
            let ids = state.remove_node(id)?;
            Ok(Event::SubtreeRemoved { ids })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::Error;
    use crate::ids::TemplateId;
    use crate::node_type::NodeType;
    use crate::project::Project;

    #[test]
    fn register_node_type_command_succeeds_and_emits_registered_event() {
        let mut p = Project::new("P", TemplateId::new());
        let nt = NodeType::new("Task");
        let nt_id = nt.id();
        let ev = apply_command(&mut p, Command::RegisterNodeType(nt)).unwrap();
        assert_eq!(
            ev,
            Event::NodeTypeRegistered {
                node_type_id: nt_id
            }
        );
        assert!(p.get_node_type(nt_id).is_some());
    }

    #[test]
    fn register_node_type_command_rejects_duplicate_and_leaves_state_unchanged() {
        let mut p = Project::new("P", TemplateId::new());
        let nt = NodeType::new("Task");
        let nt_id = nt.id();
        apply_command(&mut p, Command::RegisterNodeType(nt.clone())).unwrap();
        let err = apply_command(&mut p, Command::RegisterNodeType(nt))
            .expect_err("duplicate registration");
        assert!(matches!(err, Error::InvariantViolation(_)), "got {err:?}");
        assert_eq!(p.node_types().count(), 1);
        assert!(p.get_node_type(nt_id).is_some());
    }

    #[test]
    fn insert_node_command_succeeds_and_emits_node_inserted_event() {
        let mut p = Project::new("P", TemplateId::new());
        let nt = NodeType::new("Task");
        let kind = nt.id();
        apply_command(&mut p, Command::RegisterNodeType(nt)).unwrap();

        let node = crate::node::Node::new(kind, "n");
        let nid = node.id();
        let ev = apply_command(&mut p, Command::InsertNode(node)).unwrap();
        assert_eq!(ev, Event::NodeInserted { node_id: nid });
        assert!(p.graph().get(nid).is_some());
    }

    #[test]
    fn insert_node_command_rejects_unknown_kind_and_leaves_graph_unchanged() {
        let mut p = Project::new("P", TemplateId::new());
        let stray_kind = crate::ids::NodeTypeId::new();
        let node = crate::node::Node::new(stray_kind, "n");
        let err = apply_command(&mut p, Command::InsertNode(node)).expect_err("unknown node kind");
        assert!(matches!(err, Error::NotFound(_)), "got {err:?}");
        assert_eq!(p.graph().node_count(), 0);
    }

    // Test helper: project with parent kind allowing child kind, and one
    // node of each kind already inserted. Returns (project, parent_id, child_id).
    fn project_ready_for_set_parent() -> (Project, crate::ids::NodeId, crate::ids::NodeId) {
        let mut p = Project::new("P", TemplateId::new());
        let child_kind = NodeType::new("Task");
        let child_kind_id = child_kind.id();
        let parent_kind = NodeType::new("Section").with_allowed_child(child_kind_id);
        let parent_kind_id = parent_kind.id();
        apply_command(&mut p, Command::RegisterNodeType(child_kind)).unwrap();
        apply_command(&mut p, Command::RegisterNodeType(parent_kind)).unwrap();
        let parent_node = crate::node::Node::new(parent_kind_id, "Root");
        let parent_id = parent_node.id();
        let child_node = crate::node::Node::new(child_kind_id, "Leaf");
        let child_id = child_node.id();
        apply_command(&mut p, Command::InsertNode(parent_node)).unwrap();
        apply_command(&mut p, Command::InsertNode(child_node)).unwrap();
        (p, parent_id, child_id)
    }

    #[test]
    fn set_parent_command_succeeds_and_emits_parent_changed_event() {
        let (mut p, parent_id, child_id) = project_ready_for_set_parent();
        let ev = apply_command(
            &mut p,
            Command::SetParent {
                child: child_id,
                parent: parent_id,
            },
        )
        .unwrap();
        assert_eq!(
            ev,
            Event::ParentChanged {
                child: child_id,
                parent: parent_id,
            }
        );
        assert_eq!(p.graph().children_of(parent_id), vec![child_id]);
    }

    #[test]
    fn set_parent_command_rejects_unknown_child_and_leaves_graph_unchanged() {
        let (mut p, parent_id, _child_id) = project_ready_for_set_parent();
        let stray = crate::ids::NodeId::new();
        let err = apply_command(
            &mut p,
            Command::SetParent {
                child: stray,
                parent: parent_id,
            },
        )
        .expect_err("unknown child");
        assert!(matches!(err, Error::NotFound(_)), "got {err:?}");
        assert_eq!(
            p.graph().children_of(parent_id),
            Vec::<crate::ids::NodeId>::new()
        );
    }

    #[test]
    fn set_property_command_succeeds_and_emits_property_changed_event() {
        let mut p = Project::new("P", TemplateId::new());
        let pid = crate::ids::PropertyId::new();
        let nt = NodeType::new("Task").with_allowed_property(pid);
        let kind = nt.id();
        apply_command(&mut p, Command::RegisterNodeType(nt)).unwrap();
        let node = crate::node::Node::new(kind, "n");
        let nid = node.id();
        apply_command(&mut p, Command::InsertNode(node)).unwrap();

        let ev = apply_command(
            &mut p,
            Command::SetProperty {
                node: nid,
                pid,
                value: crate::property::Property::Boolean(true),
            },
        )
        .unwrap();
        assert_eq!(ev, Event::PropertyChanged { node: nid, pid });
        assert_eq!(
            p.graph().get(nid).unwrap().properties().get(&pid).cloned(),
            Some(crate::property::Property::Boolean(true))
        );
    }

    #[test]
    fn set_property_command_rejects_disallowed_pid_and_leaves_node_unchanged() {
        let mut p = Project::new("P", TemplateId::new());
        let nt = NodeType::new("Task"); // no allowed_properties
        let kind = nt.id();
        apply_command(&mut p, Command::RegisterNodeType(nt)).unwrap();
        let node = crate::node::Node::new(kind, "n");
        let nid = node.id();
        apply_command(&mut p, Command::InsertNode(node)).unwrap();

        let stray = crate::ids::PropertyId::new();
        let err = apply_command(
            &mut p,
            Command::SetProperty {
                node: nid,
                pid: stray,
                value: crate::property::Property::Boolean(true),
            },
        )
        .expect_err("disallowed property");
        assert!(matches!(err, Error::InvariantViolation(_)), "got {err:?}");
        assert!(p.graph().get(nid).unwrap().properties().is_empty());
    }

    #[test]
    fn remove_node_command_succeeds_and_emits_subtree_removed_event() {
        let (mut p, parent_id, child_id) = project_ready_for_set_parent();
        apply_command(
            &mut p,
            Command::SetParent {
                child: child_id,
                parent: parent_id,
            },
        )
        .unwrap();
        let ev = apply_command(&mut p, Command::RemoveNode { id: parent_id }).unwrap();
        assert_eq!(
            ev,
            Event::SubtreeRemoved {
                ids: vec![parent_id, child_id],
            }
        );
        assert_eq!(p.graph().node_count(), 0);
    }

    #[test]
    fn remove_node_command_rejects_unknown_id_and_leaves_graph_unchanged() {
        let (mut p, _, _) = project_ready_for_set_parent();
        let stray = crate::ids::NodeId::new();
        let err =
            apply_command(&mut p, Command::RemoveNode { id: stray }).expect_err("unknown node");
        assert!(matches!(err, Error::NotFound(_)), "got {err:?}");
        assert_eq!(p.graph().node_count(), 2);
    }

    #[test]
    fn command_json_shape_is_locked() {
        use crate::ids::{NodeId, NodeTypeId, PropertyId};
        use uuid::Uuid;

        let mk =
            |n: u8| Uuid::parse_str(&format!("00000000-0000-4000-8000-0000000000{n:02}")).unwrap();

        let kind_id = NodeTypeId::from(mk(0x20));
        let node_id = NodeId::from(mk(0x10));
        let parent_id = NodeId::from(mk(0x11));
        let pid = PropertyId::from(mk(0x30));

        let nt = crate::node_type::NodeType::with_id_for_test(kind_id, "Task")
            .with_allowed_property(pid);
        let node = crate::node::Node::with_id_for_test(node_id, kind_id, "n");

        let commands: Vec<Command> = vec![
            Command::RegisterNodeType(nt),
            Command::InsertNode(node),
            Command::SetParent {
                child: node_id,
                parent: parent_id,
            },
            Command::SetProperty {
                node: node_id,
                pid,
                value: crate::property::Property::Boolean(true),
            },
            Command::RemoveNode { id: node_id },
        ];
        insta::assert_json_snapshot!("command_all_variants", commands);
    }

    #[test]
    fn event_json_shape_is_locked() {
        use crate::ids::{NodeId, NodeTypeId, PropertyId};
        use uuid::Uuid;

        let mk =
            |n: u8| Uuid::parse_str(&format!("00000000-0000-4000-8000-0000000000{n:02}")).unwrap();

        let kind_id = NodeTypeId::from(mk(0x20));
        let node_id = NodeId::from(mk(0x10));
        let parent_id = NodeId::from(mk(0x11));
        let child_id = NodeId::from(mk(0x12));
        let pid = PropertyId::from(mk(0x30));

        let events: Vec<Event> = vec![
            Event::NodeTypeRegistered {
                node_type_id: kind_id,
            },
            Event::NodeInserted { node_id },
            Event::ParentChanged {
                child: child_id,
                parent: parent_id,
            },
            Event::PropertyChanged { node: node_id, pid },
            Event::SubtreeRemoved {
                ids: vec![parent_id, child_id],
            },
        ];
        insta::assert_json_snapshot!("event_all_variants", events);
    }
}
