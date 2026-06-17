//! Glue between [`apply_command`] and the [`EventLog`].
//!
//! On a successful command, the produced event is appended to the
//! log before returning. On a rejected command nothing is appended
//! and the error propagates unchanged.

use talus_core::command::{apply_command, Command, Event};
use talus_core::error::Result;
use talus_core::project::Project;

use crate::event_log::EventLog;

/// Apply `cmd` to `state`, and on success append the resulting
/// [`Event`] to `log` before returning it.
///
/// If `apply_command` rejects the command, `log` is untouched.
///
/// # Errors
/// Propagates the error from [`apply_command`], or returns
/// [`talus_core::error::Error::Io`] / [`talus_core::error::Error::Serialization`]
/// if the log append fails.
pub fn apply_command_logged(state: &mut Project, cmd: Command, log: &EventLog) -> Result<Event> {
    let event = apply_command(state, cmd)?;
    log.append(&event)?;
    Ok(event)
}

#[cfg(test)]
mod tests {
    use super::*;
    use talus_core::ids::TemplateId;
    use talus_core::node_type::NodeType;

    fn fixture() -> (Project, EventLog, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let log = EventLog::open(dir.path().join("events.ndjson")).expect("open log");
        let project = Project::new("Logged", TemplateId::new());
        (project, log, dir)
    }

    #[test]
    fn successful_command_appends_event_and_returns_it() {
        let (mut project, log, _dir) = fixture();
        let nt = NodeType::new("Equipment");
        let nt_clone = nt.clone();
        let event =
            apply_command_logged(&mut project, Command::RegisterNodeType(Box::new(nt)), &log)
                .expect("apply ok");
        assert_eq!(event, Event::NodeTypeRegistered(Box::new(nt_clone)));
        assert_eq!(log.read_all().unwrap(), vec![event]);
    }

    #[test]
    fn rejected_command_does_not_append() {
        let (mut project, log, _dir) = fixture();
        let nt = NodeType::new("Equipment");
        // First registration succeeds...
        apply_command_logged(
            &mut project,
            Command::RegisterNodeType(Box::new(nt.clone())),
            &log,
        )
        .unwrap();
        // ...duplicate registration is rejected.
        let err = apply_command_logged(&mut project, Command::RegisterNodeType(Box::new(nt)), &log)
            .expect_err("duplicate should fail");
        let _ = err;
        // Only the first event made it to the log.
        assert_eq!(log.read_all().unwrap().len(), 1);
    }

    #[test]
    fn multiple_commands_append_in_order() {
        let (mut project, log, _dir) = fixture();
        let a = NodeType::new("A");
        let b = NodeType::new("B");
        let (a_clone, b_clone) = (a.clone(), b.clone());
        apply_command_logged(&mut project, Command::RegisterNodeType(Box::new(a)), &log).unwrap();
        apply_command_logged(&mut project, Command::RegisterNodeType(Box::new(b)), &log).unwrap();
        assert_eq!(
            log.read_all().unwrap(),
            vec![
                Event::NodeTypeRegistered(Box::new(a_clone)),
                Event::NodeTypeRegistered(Box::new(b_clone)),
            ]
        );
    }
}
