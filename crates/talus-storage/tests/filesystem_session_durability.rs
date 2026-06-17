//! Cross-process durability proof: snapshot+log session survives
//! when both the store and the log live on disk (no in-memory state).

use talus_core::command::Command;
use talus_core::ids::TemplateId;
use talus_core::node::Node;
use talus_core::node_type::NodeType;
use talus_core::project::Project;
use talus_storage::command_log::apply_command_logged;
use talus_storage::event_log::EventLog;
use talus_storage::filesystem::FilesystemProjectStore;
use talus_storage::session::{load, save};

#[test]
fn filesystem_store_plus_log_survives_full_handle_drop() {
    let dir = tempfile::tempdir().expect("tempdir");
    let store_root = dir.path().join("store");
    std::fs::create_dir_all(&store_root).expect("mkdir store");
    let log_path = dir.path().join("events.ndjson");
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

    // "Process 1": drive commands, snapshot mid-stream, drive more, drop everything.
    {
        let store = FilesystemProjectStore::new(&store_root).expect("open store");
        let log = EventLog::open(&log_path).expect("open log");
        let mut live = Project::new("FsDurable", template);
        project_id = live.id();

        for cmd in [
            Command::RegisterNodeType(Box::new(leaf_kind)),
            Command::RegisterNodeType(Box::new(parent_kind)),
            Command::InsertNode(parent_node),
            Command::InsertNode(pre_leaf),
            Command::SetParent {
                child: pre_leaf_id,
                parent: parent_id,
            },
        ] {
            apply_command_logged(&mut live, cmd, &log).expect("apply pre-save");
        }

        save(&live, &store, &log).expect("save");

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
    }

    // Snapshot file is on disk.
    let snapshot_path = store_root.join(format!("{project_id}.json"));
    assert!(snapshot_path.exists(), "snapshot file present on disk");

    // "Process 2": fresh handles read from disk only.
    let store = FilesystemProjectStore::new(&store_root).expect("reopen store");
    let log = EventLog::open(&log_path).expect("reopen log");
    let restored = load(project_id, &store, &log).expect("load");

    assert_eq!(restored.id(), project_id);
    assert_eq!(restored.node_types().count(), 2);
    assert!(restored.get_node_type(leaf_kind_id).is_some());
    assert!(restored.get_node_type(parent_kind_id).is_some());
    assert_eq!(restored.graph().node_count(), 3);
    let mut kids = restored.graph().children_of(parent_id);
    kids.sort();
    let mut expected = vec![pre_leaf_id, post_leaf_id];
    expected.sort();
    assert_eq!(kids, expected);
}
