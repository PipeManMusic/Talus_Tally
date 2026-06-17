//! End-to-end durability proof: command -> log -> reopen -> replay
//! reconstructs the same project state.

use talus_core::command::Command;
use talus_core::ids::TemplateId;
use talus_core::node::Node;
use talus_core::node_type::NodeType;
use talus_core::project::Project;
use talus_core::replay::replay;
use talus_storage::command_log::apply_command_logged;
use talus_storage::event_log::EventLog;

#[test]
fn project_state_survives_log_close_reopen_and_replay() {
    let dir = tempfile::tempdir().expect("tempdir");
    let log_path = dir.path().join("events.ndjson");
    let template = TemplateId::new();

    // Drive an original project through the logged pipeline.
    let child_kind = NodeType::new("Task");
    let child_kind_id = child_kind.id();
    let parent_kind = NodeType::new("Section").with_allowed_child(child_kind_id);
    let parent_kind_id = parent_kind.id();
    let parent_node = Node::new(parent_kind_id, "Root");
    let parent_id = parent_node.id();
    let child_node = Node::new(child_kind_id, "Leaf");
    let child_id = child_node.id();

    {
        let log = EventLog::open(&log_path).expect("open log");
        let mut original = Project::new("Durable", template);
        for cmd in [
            Command::RegisterNodeType(Box::new(child_kind)),
            Command::RegisterNodeType(Box::new(parent_kind)),
            Command::InsertNode(parent_node),
            Command::InsertNode(child_node),
            Command::SetParent {
                child: child_id,
                parent: parent_id,
            },
        ] {
            apply_command_logged(&mut original, cmd, &log).expect("apply ok");
        }
        // original goes out of scope; log file remains on disk.
        let _ = original;
    }

    // Reopen the log, read its events, and replay into a fresh project.
    let reopened = EventLog::open(&log_path).expect("reopen log");
    let events = reopened.read_all().expect("read events");
    assert_eq!(events.len(), 5);

    let mut replayed = Project::new("Durable", template);
    replay(events, &mut replayed).expect("replay ok");

    assert_eq!(replayed.node_types().count(), 2);
    assert_eq!(replayed.graph().node_count(), 2);
    assert_eq!(replayed.graph().children_of(parent_id), vec![child_id]);
    assert!(replayed.get_node_type(child_kind_id).is_some());
    assert!(replayed.get_node_type(parent_kind_id).is_some());
}
