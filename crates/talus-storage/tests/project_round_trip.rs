//! Cross-module integration: `Project` survives a full
//! `codec::encode` → `FilesystemProjectStore::write` →
//! `FilesystemProjectStore::read` → `codec::decode` round trip.

use talus_core::ids::TemplateId;
use talus_core::node_type::NodeType;
use talus_core::project::Project;
use talus_storage::codec;
use talus_storage::filesystem::FilesystemProjectStore;
use talus_storage::project_store::ProjectStore;

#[test]
fn project_round_trips_through_filesystem_store() {
    let dir = tempfile::tempdir().expect("tempdir");
    let store = FilesystemProjectStore::new(dir.path()).expect("open store");

    let mut original = Project::new("Round Trip", TemplateId::new());
    original
        .register_node_type(NodeType::new("Equipment"))
        .expect("register node type");

    let bytes = codec::encode(&original).expect("encode");
    store.write(original.id(), &bytes).expect("write");

    let read_bytes = store.read(original.id()).expect("read");
    let decoded = codec::decode(&read_bytes).expect("decode");

    assert_eq!(decoded, original);
}

#[test]
fn list_after_write_returns_project_id() {
    let dir = tempfile::tempdir().expect("tempdir");
    let store = FilesystemProjectStore::new(dir.path()).expect("open store");

    let project = Project::new("Listed", TemplateId::new());
    let bytes = codec::encode(&project).expect("encode");
    store.write(project.id(), &bytes).expect("write");

    let ids = store.list().expect("list");
    assert_eq!(ids, vec![project.id()]);
}
