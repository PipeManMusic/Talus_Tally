//! Filesystem-backed [`MarkupRegistry`] for `talus-storage`.
//!
//! Loads markup profile YAML documents from a base directory and runs them
//! through [`talus_core::validation::validate_by_kind`]. Mirrors Python
//! `backend/infra/markup.py::MarkupRegistry::load_profile`.
//!
//! Caching, `list_profiles`, `save_profile`, and `delete_profile` are tracked
//! for later sub-cycles and are not implemented here.

use std::path::PathBuf;

use serde_json::Value;
use talus_core::error::{Error, Result};
use talus_core::markup::MarkupRegistry;

/// `MarkupRegistry` that reads `<base_dir>/<profile_id>.yaml`.
pub struct FilesystemMarkupRegistry {
    base_dir: PathBuf,
}

impl FilesystemMarkupRegistry {
    /// Construct a registry rooted at `base_dir`.
    pub fn new(base_dir: impl Into<PathBuf>) -> Self {
        Self {
            base_dir: base_dir.into(),
        }
    }
}

impl MarkupRegistry for FilesystemMarkupRegistry {
    fn load_profile(&self, profile_id: &str) -> Result<Value> {
        let _ = &self.base_dir;
        let _ = profile_id;
        Err(Error::NotFound("not implemented".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use tempfile::TempDir;

    fn make_registry() -> (TempDir, FilesystemMarkupRegistry) {
        let dir = TempDir::new().expect("tempdir");
        let registry = FilesystemMarkupRegistry::new(dir.path());
        (dir, registry)
    }

    fn write_profile(dir: &TempDir, profile_id: &str, contents: &str) {
        let path = dir.path().join(format!("{profile_id}.yaml"));
        fs::write(&path, contents).expect("write profile");
    }

    #[test]
    fn load_profile_errors_when_file_missing() {
        let (_dir, registry) = make_registry();
        let err = registry.load_profile("nope").unwrap_err();
        assert!(
            matches!(err, Error::NotFound(ref m) if m == "Markup profile not found: nope"),
            "got {err:?}"
        );
    }

    #[test]
    fn load_profile_returns_data_for_valid_profile() {
        let (dir, registry) = make_registry();
        write_profile(
            &dir,
            "myprofile",
            "id: myprofile\nlabel: My Profile\ntokens: []\n",
        );
        let data = registry.load_profile("myprofile").expect("load");
        assert_eq!(data["id"], json!("myprofile"));
        assert_eq!(data["label"], json!("My Profile"));
        assert_eq!(data["tokens"], json!([]));
    }

    #[test]
    fn load_profile_errors_on_id_mismatch() {
        let (dir, registry) = make_registry();
        write_profile(&dir, "myprofile", "id: other\nlabel: X\ntokens: []\n");
        let err = registry.load_profile("myprofile").unwrap_err();
        assert!(
            matches!(
                err,
                Error::SchemaValidation(ref m)
                    if m == "Markup profile id mismatch: expected myprofile, got other"
            ),
            "got {err:?}"
        );
    }

    #[test]
    fn load_profile_id_mismatch_when_id_absent_formats_none() {
        let (dir, registry) = make_registry();
        write_profile(&dir, "myprofile", "label: X\ntokens: []\n");
        let err = registry.load_profile("myprofile").unwrap_err();
        assert!(
            matches!(
                err,
                Error::SchemaValidation(ref m)
                    if m == "Markup profile id mismatch: expected myprofile, got None"
            ),
            "got {err:?}"
        );
    }

    #[test]
    fn load_profile_errors_when_tokens_not_list() {
        let (dir, registry) = make_registry();
        write_profile(
            &dir,
            "myprofile",
            "id: myprofile\nlabel: X\ntokens: not_a_list\n",
        );
        let err = registry.load_profile("myprofile").unwrap_err();
        assert!(
            matches!(
                err,
                Error::SchemaValidation(ref m)
                    if m == "Markup profile tokens must be a list: myprofile"
            ),
            "got {err:?}"
        );
    }

    #[test]
    fn load_profile_injects_empty_tokens_when_absent() {
        let (dir, registry) = make_registry();
        write_profile(&dir, "myprofile", "id: myprofile\nlabel: My Profile\n");
        let data = registry.load_profile("myprofile").expect("load");
        assert_eq!(data["tokens"], json!([]));
    }

    #[test]
    fn load_profile_errors_when_validation_fails() {
        let (dir, registry) = make_registry();
        // missing label triggers validation error
        write_profile(&dir, "myprofile", "id: myprofile\ntokens: []\n");
        let err = registry.load_profile("myprofile").unwrap_err();
        let msg = match err {
            Error::SchemaValidation(m) => m,
            other => panic!("expected SchemaValidation, got {other:?}"),
        };
        assert!(
            msg.starts_with("Markup profile validation failed for 'myprofile':\n"),
            "got {msg}"
        );
        assert!(
            msg.contains("  - markup_profile: missing required field 'label'"),
            "got {msg}"
        );
    }

    #[test]
    fn load_profile_errors_on_yaml_parse_failure() {
        let (dir, registry) = make_registry();
        write_profile(&dir, "myprofile", "id: [unterminated\n");
        let err = registry.load_profile("myprofile").unwrap_err();
        assert!(matches!(err, Error::Serialization(_)), "got {err:?}");
    }
}
