//! In-memory `ProjectStore` for tests and parity benchmarks.
//!
//! NOT for production use. No persistence, no concurrency primitives beyond
//! the basic `Mutex`. Phase 3's `SQLite` store replaces this for the desktop
//! and mobile targets.

use std::collections::HashMap;
use std::sync::Mutex;

use talus_core::prelude::*;

use crate::project_store::ProjectStore;

/// Process-local in-memory project store.
#[derive(Debug, Default)]
pub struct MemoryProjectStore {
    inner: Mutex<HashMap<ProjectId, Vec<u8>>>,
}

impl MemoryProjectStore {
    /// Create an empty store.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
}

impl ProjectStore for MemoryProjectStore {
    fn read(&self, project_id: ProjectId) -> Result<Vec<u8>> {
        let guard = self.inner.lock().expect("memory store mutex poisoned");
        guard
            .get(&project_id)
            .cloned()
            .ok_or_else(|| Error::NotFound(format!("project {project_id}")))
    }

    fn write(&self, project_id: ProjectId, bytes: &[u8]) -> Result<()> {
        let mut guard = self.inner.lock().expect("memory store mutex poisoned");
        guard.insert(project_id, bytes.to_vec());
        Ok(())
    }

    fn delete(&self, project_id: ProjectId) -> Result<()> {
        let mut guard = self.inner.lock().expect("memory store mutex poisoned");
        guard.remove(&project_id);
        Ok(())
    }

    fn list(&self) -> Result<Vec<ProjectId>> {
        let guard = self.inner.lock().expect("memory store mutex poisoned");
        Ok(guard.keys().copied().collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_write_read() {
        let store = MemoryProjectStore::new();
        let id = ProjectId::new();
        let payload = b"hello".to_vec();
        store.write(id, &payload).unwrap();
        assert_eq!(store.read(id).unwrap(), payload);
    }

    #[test]
    fn read_missing_project_is_not_found() {
        let store = MemoryProjectStore::new();
        let id = ProjectId::new();
        match store.read(id) {
            Err(Error::NotFound(_)) => {}
            other => panic!("expected NotFound, got {other:?}"),
        }
    }

    #[test]
    fn delete_is_idempotent() {
        let store = MemoryProjectStore::new();
        let id = ProjectId::new();
        store.delete(id).unwrap();
        store.write(id, b"x").unwrap();
        store.delete(id).unwrap();
        store.delete(id).unwrap();
        assert!(matches!(store.read(id), Err(Error::NotFound(_))));
    }

    #[test]
    fn list_returns_known_ids() {
        let store = MemoryProjectStore::new();
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
}
