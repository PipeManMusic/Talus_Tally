//! Command / Event pipeline.
//!
//! All runtime mutations of a [`crate::project::Project`] flow through
//! a `Command` value passed to `apply_command`. Each accepted command
//! produces an `Event` describing what changed. Commands are intent;
//! events are fact. Rejected commands leave state unchanged and
//! surface an [`crate::error::Error`].

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::ids::NodeTypeId;
use crate::node_type::NodeType;
use crate::project::Project;

/// A request to mutate a [`Project`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum Command {
    /// Register a new [`NodeType`] in the project's registry.
    RegisterNodeType(NodeType),
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
}
