//! Property: for any valid command sequence applied via the logged
//! pipeline, a `save` + `load` round-trip reconstructs an equal
//! project. Pins the snapshot+log session invariant under arbitrary
//! input.

use proptest::prelude::*;
use talus_core::command::Command;
use talus_core::ids::{NodeId, NodeTypeId, TemplateId};
use talus_core::node::Node;
use talus_core::node_type::NodeType;
use talus_core::project::Project;
use talus_storage::command_log::apply_command_logged;
use talus_storage::event_log::EventLog;
use talus_storage::memory::MemoryProjectStore;
use talus_storage::session::{load, save};

/// Intent-only step; the runner resolves it against current state and
/// silently skips it when the resulting command would be invalid.
#[derive(Debug, Clone)]
enum Step {
    RegisterKind(String),
    InsertNode {
        kind_index: usize,
        label: String,
    },
    SetParent {
        child_index: usize,
        parent_index: usize,
    },
    /// Mid-stream snapshot: forces `save` to run at this point.
    Checkpoint,
}

fn step_strategy() -> impl Strategy<Value = Step> {
    prop_oneof![
        4 => "[a-z]{1,6}".prop_map(Step::RegisterKind),
        6 => (any::<usize>(), "[a-z]{1,6}")
            .prop_map(|(kind_index, label)| Step::InsertNode { kind_index, label }),
        3 => (any::<usize>(), any::<usize>()).prop_map(|(child_index, parent_index)| {
            Step::SetParent { child_index, parent_index }
        }),
        1 => Just(Step::Checkpoint),
    ]
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]

    #[test]
    fn save_load_round_trip_preserves_state(
        steps in proptest::collection::vec(step_strategy(), 0..32)
    ) {
        let dir = tempfile::tempdir().expect("tempdir");
        let log_path = dir.path().join("events.ndjson");
        let store = MemoryProjectStore::new();
        let template = TemplateId::new();

        let log = EventLog::open(&log_path).expect("open log");
        let mut project = Project::new("Prop", template);
        let project_id = project.id();
        let mut kinds: Vec<NodeTypeId> = Vec::new();
        let mut nodes: Vec<NodeId> = Vec::new();
        // Initial snapshot so `load` is always meaningful, even when no
        // commands are emitted.
        save(&project, &store, &log).expect("initial save");

        for step in &steps {
            match step {
                Step::RegisterKind(name) => {
                    let nt = NodeType::new(name);
                    let id = nt.id();
                    if apply_command_logged(
                        &mut project,
                        Command::RegisterNodeType(Box::new(nt)),
                        &log,
                    ).is_ok() {
                        kinds.push(id);
                    }
                }
                Step::InsertNode { kind_index, label } => {
                    if kinds.is_empty() {
                        continue;
                    }
                    let kind = kinds[kind_index % kinds.len()];
                    let node = Node::new(kind, label);
                    let id = node.id();
                    if apply_command_logged(
                        &mut project,
                        Command::InsertNode(node),
                        &log,
                    ).is_ok() {
                        nodes.push(id);
                    }
                }
                Step::SetParent { child_index, parent_index } => {
                    if nodes.len() < 2 {
                        continue;
                    }
                    let child = nodes[child_index % nodes.len()];
                    let parent = nodes[parent_index % nodes.len()];
                    if child == parent {
                        continue;
                    }
                    let _ = apply_command_logged(
                        &mut project,
                        Command::SetParent { child, parent },
                        &log,
                    );
                }
                Step::Checkpoint => {
                    save(&project, &store, &log).expect("mid-stream save");
                }
            }
        }

        let restored = load(project_id, &store, &log).expect("load");
        prop_assert_eq!(project, restored);
    }
}
