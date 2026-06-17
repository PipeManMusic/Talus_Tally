//! Replay an [`crate::command::Event`] stream into a [`crate::project::Project`].
//!
//! Events are facts produced by [`crate::command::apply_command`] on a
//! valid project. Folding them in order over a freshly-minted project
//! reconstructs the original state.

use crate::command::Event;
use crate::error::Result;
use crate::project::Project;

/// Apply a single [`Event`] to `state`.
///
/// # Errors
/// Propagates any validation error from the underlying [`Project`]
/// mutators. On a well-formed event stream produced by
/// [`crate::command::apply_command`], this never errors.
pub fn apply_event(state: &mut Project, event: Event) -> Result<()> {
    use crate::error::Error;

    match event {
        Event::NodeTypeRegistered(nt) => state.register_node_type(*nt),
        Event::NodeInserted(node) => state.insert_node(node),
        Event::ParentChanged { child, parent } => state.set_parent(child, parent),
        Event::PropertyChanged { node, pid, value } => state.set_property(node, pid, value),
        Event::SubtreeRemoved { ids } => {
            let root = *ids.first().ok_or_else(|| {
                Error::InvariantViolation("SubtreeRemoved event has empty ids".into())
            })?;
            state.remove_node(root).map(|_| ())
        }
    }
}

/// Fold an iterator of [`Event`]s into `state`, in order.
///
/// # Errors
/// Returns on the first event that fails to apply. Earlier events
/// remain applied.
pub fn replay<I>(events: I, state: &mut Project) -> Result<()>
where
    I: IntoIterator<Item = Event>,
{
    for event in events {
        apply_event(state, event)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::command::{apply_command, Command};
    use crate::ids::TemplateId;
    use crate::node::Node;
    use crate::node_type::NodeType;

    /// Run a sequence of commands against `state`, returning the
    /// emitted events in order.
    fn drive(state: &mut Project, commands: Vec<Command>) -> Vec<Event> {
        commands
            .into_iter()
            .map(|c| apply_command(state, c).expect("apply"))
            .collect()
    }

    #[test]
    fn replay_of_empty_stream_leaves_project_unchanged() {
        let template = TemplateId::new();
        let mut original = Project::new("P", template);
        let mut replayed = Project::new("P", template);
        replay(Vec::<Event>::new(), &mut replayed).unwrap();
        assert_eq!(replayed.node_types().count(), original.node_types().count());
        assert_eq!(replayed.graph().node_count(), original.graph().node_count());
        // sanity: the original was untouched
        let _ = &mut original;
    }

    #[test]
    fn replay_reconstructs_a_project_with_node_types_nodes_and_parent() {
        let template = TemplateId::new();
        let mut original = Project::new("Original", template);

        let child_kind = NodeType::new("Task");
        let child_kind_id = child_kind.id();
        let parent_kind = NodeType::new("Section").with_allowed_child(child_kind_id);
        let parent_kind_id = parent_kind.id();
        let parent_node = Node::new(parent_kind_id, "Root");
        let parent_id = parent_node.id();
        let child_node = Node::new(child_kind_id, "Leaf");
        let child_id = child_node.id();

        let events = drive(
            &mut original,
            vec![
                Command::RegisterNodeType(Box::new(child_kind)),
                Command::RegisterNodeType(Box::new(parent_kind)),
                Command::InsertNode(parent_node),
                Command::InsertNode(child_node),
                Command::SetParent {
                    child: child_id,
                    parent: parent_id,
                },
            ],
        );

        let mut replayed = Project::new("Original", template);
        replay(events, &mut replayed).unwrap();

        assert_eq!(replayed.node_types().count(), 2);
        assert_eq!(replayed.graph().node_count(), 2);
        assert_eq!(replayed.graph().children_of(parent_id), vec![child_id]);
    }

    #[test]
    fn replay_applies_property_changes() {
        let template = TemplateId::new();
        let mut original = Project::new("P", template);
        let pid = crate::ids::PropertyId::new();
        let nt = NodeType::new("Task").with_allowed_property(pid);
        let kind = nt.id();
        let node = Node::new(kind, "n");
        let nid = node.id();

        let events = drive(
            &mut original,
            vec![
                Command::RegisterNodeType(Box::new(nt)),
                Command::InsertNode(node),
                Command::SetProperty {
                    node: nid,
                    pid,
                    value: crate::property::Property::Boolean(true),
                },
            ],
        );

        let mut replayed = Project::new("P", template);
        replay(events, &mut replayed).unwrap();

        assert_eq!(
            replayed
                .graph()
                .get(nid)
                .unwrap()
                .properties()
                .get(&pid)
                .cloned(),
            Some(crate::property::Property::Boolean(true))
        );
    }

    #[test]
    fn replay_applies_subtree_removal() {
        let template = TemplateId::new();
        let mut original = Project::new("P", template);
        let child_kind = NodeType::new("Task");
        let child_kind_id = child_kind.id();
        let parent_kind = NodeType::new("Section").with_allowed_child(child_kind_id);
        let parent_kind_id = parent_kind.id();
        let parent_node = Node::new(parent_kind_id, "Root");
        let parent_id = parent_node.id();
        let child_node = Node::new(child_kind_id, "Leaf");
        let child_id = child_node.id();

        let events = drive(
            &mut original,
            vec![
                Command::RegisterNodeType(Box::new(child_kind)),
                Command::RegisterNodeType(Box::new(parent_kind)),
                Command::InsertNode(parent_node),
                Command::InsertNode(child_node),
                Command::SetParent {
                    child: child_id,
                    parent: parent_id,
                },
                Command::RemoveNode { id: parent_id },
            ],
        );

        let mut replayed = Project::new("P", template);
        replay(events, &mut replayed).unwrap();

        assert_eq!(replayed.graph().node_count(), 0);
    }
}
