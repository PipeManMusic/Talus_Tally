//! End-to-end durability proof for snapshot+log sessions: commands
//! drive a live project, `save` checkpoints mid-stream, more commands
//! extend the log past the snapshot, then `load` from a fresh process
//! reconstructs the same state.

use talus_core::command::Command;
use talus_core::ids::TemplateId;
use talus_core::node::Node;
use talus_core::node_type::NodeType;
use talus_core::project::Project;
use talus_storage::command_log::apply_command_logged;
use talus_storage::event_log::EventLog;
use talus_storage::memory::MemoryProjectStore;
use talus_storage::session::{load, save};

#[test]
fn save_mid_stream_then_load_reconstructs_same_state() {
    let dir = tempfile::tempdir().expect("tempdir");
    let log_path = dir.path().join("events.ndjson");
    let store = MemoryProjectStore::new();
    let template = TemplateId::new();

    let leaf_kind = NodeType::new("Task");
    let leaf_kind_id = leaf_kind.id();
    let parent_kind = NodeType::new("Section").with_allowed_child(leaf_kind_id);
    let parent_kind_id = parent_kind.id();
    let parent_node = Node::new(parent_kind_id, "Root");
    let parent_id = parent_node.id();
    let pre_leaf = Node::new(leaf_kind_id, "Before");
    let pre_leaf_id = pre_leaf.id();
    let post_leaf = Node::new(leaf_kind_id, "After");
    let post_leaf_id = post_leaf.id();

    let project_id;

    {
        let log = EventLog::open(&log_path).expect("open log");
        let mut live = Project::new("Durable", template);
        project_id = live.id();

        // Pre-snapshot commands.
        for cmd in [
            Command::RegisterNodeType(leaf_kind),
            Command::RegisterNodeType(parent_kind),
            Command::InsertNode(parent_node),
            Command::InsertNode(pre_leaf),
            Command::SetParent {
                child: pre_leaf_id,
                parent: parent_id,
            },
        ] {
            apply_command_logged(&mut live, cmd, &log).expect("apply pre-save");
        }

        // Checkpoint: snapshot to store, log gets truncated.
        save(&live, &store, &log).expect("save");
        assert_eq!(log.read_all().expect("read post-save").len(), 0);

        // Post-snapshot commands — these live only in the log until next save.
        apply_command_logged(&mut live, Command::InsertNode(post_leaf), &log)
            .expect("insert post-save");
        apply_command_logged(
            &mut live,
            Command::SetParent {
                child: post_leaf_id,
                parent: parent_id,
            },
            &log,
        )
        .expect("reparent post-save");

        // Sanity: live state has both leaves under parent.
        assert_eq!(live.graph().node_count(), 3);
        let mut kids = live.graph().children_of(parent_id);
        kids.sort();
        let mut expected = vec![pre_leaf_id, post_leaf_id];
        expected.sort();
        assert_eq!(kids, expected);
    }
    // Live project + log handle dropped. Only `store` (snapshot) and the
    // log file on disk remain.

    let reopened_log = EventLog::open(&log_path).expect("reopen log");
    assert_eq!(
        reopened_log.read_all().expect("read post-reopen").len(),
        2,
        "exactly the two post-snapshot events survived on disk"
    );

    let restored = load(project_id, &store, &reopened_log).expect("load");

    assert_eq!(restored.id(), project_id);
    assert_eq!(restored.node_types().count(), 2);
    assert!(restored.get_node_type(leaf_kind_id).is_some());
    assert!(restored.get_node_type(parent_kind_id).is_some());
    assert_eq!(restored.graph().node_count(), 3);
    let mut restored_kids = restored.graph().children_of(parent_id);
    restored_kids.sort();
    let mut expected_kids = vec![pre_leaf_id, post_leaf_id];
    expected_kids.sort();
    assert_eq!(restored_kids, expected_kids);
}

#[test]
fn repeated_save_load_cycles_preserve_state() {
    let dir = tempfile::tempdir().expect("tempdir");
    let log_path = dir.path().join("events.ndjson");
    let store = MemoryProjectStore::new();
    let template = TemplateId::new();

    let kind = NodeType::new("Item");
    let kind_id = kind.id();
    let project_id;

    // Round 1: register kind, save.
    {
        let log = EventLog::open(&log_path).expect("open log");
        let mut p = Project::new("Cycles", template);
        project_id = p.id();
        apply_command_logged(&mut p, Command::RegisterNodeType(kind), &log).expect("register");
        save(&p, &store, &log).expect("save 1");
    }

    // Round 2: load, insert a node via direct apply (no log yet), then log a second insert, save.
    let second_id;
    {
        let log = EventLog::open(&log_path).expect("reopen log");
        let mut p = load(project_id, &store, &log).expect("load 1");
        assert_eq!(p.node_types().count(), 1);
        let first = Node::new(kind_id, "first");
        apply_command_logged(&mut p, Command::InsertNode(first), &log).expect("insert first");
        let second = Node::new(kind_id, "second");
        second_id = second.id();
        apply_command_logged(&mut p, Command::InsertNode(second), &log).expect("insert second");
        save(&p, &store, &log).expect("save 2");
    }

    // Round 3: load again, both nodes present, log is empty (post-save truncate).
    {
        let log = EventLog::open(&log_path).expect("reopen log");
        assert_eq!(log.read_all().expect("read").len(), 0);
        let p = load(project_id, &store, &log).expect("load 2");
        assert_eq!(p.graph().node_count(), 2);
        assert!(p.graph().get(second_id).is_some());
    }
}
