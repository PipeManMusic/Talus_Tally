//! Filesystem-backed `ProjectStore`.
//!
//! One JSON blob per project at `<root>/<project_id>.json`. Writes are
//! atomic on POSIX and Windows: bytes go to a sibling temp file in the
//! same directory, then `rename` swaps it into place.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use talus_core::error::{Error, Result};
use talus_core::ids::ProjectId;
use uuid::Uuid;

use crate::project_store::ProjectStore;

const FILE_EXTENSION: &str = "json";

/// `ProjectStore` that writes one JSON file per project.
#[derive(Debug)]
pub struct FilesystemProjectStore {
    root: PathBuf,
}

impl FilesystemProjectStore {
    /// Open (or create) a store rooted at `root`. The directory is
    /// created if it does not exist.
    ///
    /// # Errors
    /// Returns [`Error::Io`] if the directory cannot be created.
    pub fn new(root: impl Into<PathBuf>) -> Result<Self> {
        let root = root.into();
        fs::create_dir_all(&root).map_err(|e| io_err(&e))?;
        Ok(Self { root })
    }

    fn path_for(&self, id: ProjectId) -> PathBuf {
        self.root.join(format!("{}.{FILE_EXTENSION}", id.as_uuid()))
    }
}

fn io_err(e: &std::io::Error) -> Error {
    Error::Io(e.to_string())
}

impl ProjectStore for FilesystemProjectStore {
    fn read(&self, project_id: ProjectId) -> Result<Vec<u8>> {
        let path = self.path_for(project_id);
        match fs::read(&path) {
            Ok(bytes) => Ok(bytes),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                Err(Error::NotFound(format!("project {project_id}")))
            }
            Err(e) => Err(io_err(&e)),
        }
    }

    fn write(&self, project_id: ProjectId, bytes: &[u8]) -> Result<()> {
        let target = self.path_for(project_id);
        let mut tmp = tempfile_in(&self.root)?;
        tmp.as_file_mut().write_all(bytes).map_err(|e| io_err(&e))?;
        tmp.as_file_mut().sync_all().map_err(|e| io_err(&e))?;
        tmp.persist(&target).map_err(|e| io_err(&e.error))?;
        Ok(())
    }

    fn delete(&self, project_id: ProjectId) -> Result<()> {
        let path = self.path_for(project_id);
        match fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(io_err(&e)),
        }
    }

    fn list(&self) -> Result<Vec<ProjectId>> {
        let mut out = Vec::new();
        for entry in fs::read_dir(&self.root).map_err(|e| io_err(&e))? {
            let entry = entry.map_err(|e| io_err(&e))?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some(FILE_EXTENSION) {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            if let Ok(uuid) = Uuid::parse_str(stem) {
                out.push(ProjectId::from(uuid));
            }
        }
        Ok(out)
    }
}

fn tempfile_in(dir: &Path) -> Result<tempfile::NamedTempFile> {
    tempfile::NamedTempFile::new_in(dir).map_err(|e| io_err(&e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project_store::ProjectStore;
    use talus_core::error::Error;
    use talus_core::ids::ProjectId;

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
