//! Command / Event pipeline.
//!
//! All runtime mutations of a [`crate::project::Project`] flow through
//! a `Command` value passed to `apply_command`. Each accepted command
//! produces an `Event` describing what changed. Commands are intent;
//! events are fact. Rejected commands leave state unchanged and
//! surface an [`crate::error::Error`].

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
