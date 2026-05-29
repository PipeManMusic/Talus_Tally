//! Snapshot+log session wrappers.
//!
//! [`save`] writes a [`Project`] snapshot via a [`ProjectStore`] and then
//! truncates the [`EventLog`], so the log restarts from the snapshot point.
//! [`load`] reads the snapshot, decodes it, and replays any events accumulated
//! since the last snapshot. Together they bound log growth.

use talus_core::command::Event;
use talus_core::ids::ProjectId;
use talus_core::prelude::*;
use talus_core::project::Project;
use talus_core::replay::replay;

use crate::codec::{decode, encode};
use crate::event_log::EventLog;
use crate::project_store::ProjectStore;

/// Persist `project` as a snapshot and clear the log.
///
/// # Errors
/// Returns any [`Error`] produced by encoding, the store, or the log.
pub fn save<S: ProjectStore>(project: &Project, store: &S, log: &EventLog) -> Result<()> {
    let _ = (project, store, log);
    unimplemented!("session::save")
}

/// Reconstruct a project: read the snapshot, decode it, replay the log.
///
/// # Errors
/// Returns any [`Error`] produced by the store, decoding, the log, or replay.
pub fn load<S: ProjectStore>(
    project_id: ProjectId,
    store: &S,
    log: &EventLog,
) -> Result<Project> {
    let _ = (project_id, store, log);
    let _: fn(_, &mut _) -> _ = replay::<std::vec::IntoIter<Event>>;
    let _ = (decode, encode);
    unimplemented!("session::load")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::MemoryProjectStore;
    use talus_core::command::{apply_command, Command};
    use talus_core::ids::TemplateId;
    use talus_core::node::Node;
    use talus_core::node_type::NodeType;

    fn fixture() -> (MemoryProjectStore, EventLog, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let log = EventLog::open(dir.path().join("events.ndjson")).expect("open log");
        (MemoryProjectStore::new(), log, dir)
    }

    fn new_project(name: &str) -> Project {
        Project::new(name, TemplateId::new())
    }

    #[test]
    fn save_persists_project_and_clears_log() {
        let (store, log, _dir) = fixture();
        let mut project = new_project("p");
        let nt = NodeType::new("widget");
        let nt_id = nt.id();
        apply_command(&mut project, Command::RegisterNodeType(nt)).unwrap();
        let node = Node::new(nt_id, "n");
        let ev = apply_command(&mut project, Command::InsertNode(node)).unwrap();
        log.append(&ev).unwrap();
        assert_eq!(log.read_all().unwrap().len(), 1);

        save(&project, &store, &log).unwrap();

        assert!(store.read(project.id()).is_ok());
        assert_eq!(log.read_all().unwrap(), Vec::<Event>::new());
    }

    #[test]
    fn load_returns_snapshot_when_log_is_empty() {
        let (store, log, _dir) = fixture();
        let mut project = new_project("p");
        let nt = NodeType::new("widget");
        apply_command(&mut project, Command::RegisterNodeType(nt)).unwrap();
        save(&project, &store, &log).unwrap();

        let loaded = load(project.id(), &store, &log).unwrap();

        assert_eq!(loaded.id(), project.id());
        assert_eq!(loaded.node_types().count(), 1);
    }

    #[test]
    fn load_replays_events_after_snapshot() {
        let (store, log, _dir) = fixture();
        let mut project = new_project("p");
        let nt = NodeType::new("widget");
        let nt_id = nt.id();
        apply_command(&mut project, Command::RegisterNodeType(nt)).unwrap();
        save(&project, &store, &log).unwrap();

        // Mutate after snapshot — these events must replay on load.
        let node = Node::new(nt_id, "after-snapshot");
        let node_id = node.id();
        let ev = apply_command(&mut project, Command::InsertNode(node)).unwrap();
        log.append(&ev).unwrap();

        let loaded = load(project.id(), &store, &log).unwrap();

        assert_eq!(loaded.graph().node_count(), 1);
        assert!(loaded.graph().get(node_id).is_some());
    }

    #[test]
    fn save_then_load_round_trips_without_events() {
        let (store, log, _dir) = fixture();
        let project = new_project("solo");
        save(&project, &store, &log).unwrap();

        let loaded = load(project.id(), &store, &log).unwrap();
        assert_eq!(loaded.id(), project.id());
        assert_eq!(loaded.graph().node_count(), 0);
    }

    #[test]
    fn load_missing_project_is_not_found() {
        let (store, log, _dir) = fixture();
        let err = load(ProjectId::new(), &store, &log).unwrap_err();
        assert!(matches!(err, Error::NotFound(_)), "got {err:?}");
    }
}
