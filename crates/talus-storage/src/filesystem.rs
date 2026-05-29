//! Filesystem-backed `ProjectStore`.
//!
//! One JSON blob per project at `<root>/<project_id>.json`. Writes are
//! atomic on POSIX and Windows: bytes go to a sibling temp file in the
//! same directory, then `rename` swaps it into place.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project_store::ProjectStore;
    use talus_core::prelude::*;

    fn store() -> (FilesystemProjectStore, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("create tempdir");
        let store = FilesystemProjectStore::new(dir.path()).expect("open store");
        (store, dir)
    }

    #[test]
    fn round_trip_write_read() {
        let (store, _dir) = store();
        let id = ProjectId::new();
        let payload = b"hello".to_vec();
        store.write(id, &payload).unwrap();
        assert_eq!(store.read(id).unwrap(), payload);
    }

    #[test]
    fn read_missing_project_is_not_found() {
        let (store, _dir) = store();
        let id = ProjectId::new();
        match store.read(id) {
            Err(Error::NotFound(_)) => {}
            other => panic!("expected NotFound, got {other:?}"),
        }
    }

    #[test]
    fn delete_is_idempotent() {
        let (store, _dir) = store();
        let id = ProjectId::new();
        store.delete(id).unwrap();
        store.write(id, b"x").unwrap();
        store.delete(id).unwrap();
        store.delete(id).unwrap();
        assert!(matches!(store.read(id), Err(Error::NotFound(_))));
    }

    #[test]
    fn list_returns_known_ids() {
        let (store, _dir) = store();
        let a = ProjectId::new();
        let b = ProjectId::new();
        store.write(a, b"a").unwrap();
        store.write(b, b"b").unwrap();
        let mut ids = store.list().unwrap();
        ids.sort_by_key(|id| *id.as_uuid());
        let mut expected = vec![a, b];
        expected.sort_by_key(|id| *id.as_uuid());
        assert_eq!(ids, expected);
    }

    #[test]
    fn overwrite_replaces_prior_contents() {
        let (store, _dir) = store();
        let id = ProjectId::new();
        store.write(id, b"first").unwrap();
        store.write(id, b"second").unwrap();
        assert_eq!(store.read(id).unwrap(), b"second");
    }
}
