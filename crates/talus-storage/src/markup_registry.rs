//! Filesystem-backed [`MarkupRegistry`] for `talus-storage`.
//!
//! Loads markup profile YAML documents from a base directory and runs them
//! through [`talus_core::validation::validate_by_kind`]. Mirrors Python
//! `backend/infra/markup.py::MarkupRegistry`.
//!
//! Caching, `save_profile`, and `delete_profile` are tracked for later
//! sub-cycles and are not implemented here.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde_json::Value;
use talus_core::error::{Error, Result};
use talus_core::markup::MarkupRegistry;
use talus_core::validation::validate_by_kind;

/// Summary metadata for a markup profile, returned by
/// [`FilesystemMarkupRegistry::list_profiles`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarkupProfileSummary {
    pub id: String,
    pub label: String,
    pub description: String,
}

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

    /// List all markup profile summaries under `base_dir`, sorted by filename.
    ///
    /// Mirrors Python `MarkupRegistry.list_profiles`: silently skips files
    /// that fail to parse or lack an `id`, dedupes by id (first occurrence
    /// wins), and falls back to `id` when `label` is missing or empty.
    /// Returns an empty vector when `base_dir` does not exist.
    pub fn list_profiles(&self) -> Vec<MarkupProfileSummary> {
        if !self.base_dir.exists() {
            return Vec::new();
        }
        let Ok(entries) = std::fs::read_dir(&self.base_dir) else {
            return Vec::new();
        };
        let mut paths: Vec<PathBuf> = entries
            .filter_map(std::result::Result::ok)
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("yaml"))
            .collect();
        paths.sort();

        let mut seen: HashSet<String> = HashSet::new();
        let mut out = Vec::new();
        for path in &paths {
            if let Some(summary) = read_summary(path) {
                if seen.insert(summary.id.clone()) {
                    out.push(summary);
                }
            }
        }
        out
    }
}

/// Read a single profile file into a [`MarkupProfileSummary`], returning
/// `None` if the file fails to read/parse or lacks a non-empty `id`.
fn read_summary(path: &Path) -> Option<MarkupProfileSummary> {
    let bytes = std::fs::read_to_string(path).ok()?;
    let parsed: Value = serde_yaml::from_str(&bytes).ok()?;
    let obj = parsed.as_object()?;
    let id = obj.get("id").and_then(Value::as_str)?;
    if id.is_empty() {
        return None;
    }
    let label = obj
        .get("label")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or(id);
    let description = obj.get("description").and_then(Value::as_str).unwrap_or("");
    Some(MarkupProfileSummary {
        id: id.to_string(),
        label: label.to_string(),
        description: description.to_string(),
    })
}

impl MarkupRegistry for FilesystemMarkupRegistry {
    fn load_profile(&self, profile_id: &str) -> Result<Value> {
        let path = self.base_dir.join(format!("{profile_id}.yaml"));
        if !path.exists() {
            return Err(Error::NotFound(format!(
                "Markup profile not found: {profile_id}"
            )));
        }

        let bytes =
            std::fs::read_to_string(&path).map_err(|e| Error::Serialization(e.to_string()))?;
        let parsed: Value =
            serde_yaml::from_str(&bytes).map_err(|e| Error::Serialization(e.to_string()))?;

        // Python `yaml.safe_load(f) or {}`: null/non-mapping → empty mapping.
        let mut data = match parsed {
            Value::Object(_) => parsed,
            _ => Value::Object(serde_json::Map::new()),
        };
        let obj = data.as_object_mut().expect("ensured object above");

        // id check: Python `data.get('id') != profile_id`, str(None) → "None".
        let id_display = match obj.get("id") {
            None | Some(Value::Null) => "None".to_string(),
            Some(Value::String(s)) => s.clone(),
            Some(other) => other.to_string(),
        };
        if obj.get("id").and_then(Value::as_str) != Some(profile_id) {
            return Err(Error::SchemaValidation(format!(
                "Markup profile id mismatch: expected {profile_id}, got {id_display}"
            )));
        }

        // tokens: Python `data.get('tokens') or []` then isinstance(list) check.
        // null is coerced to [] by `or`, so it does NOT trip the type error.
        let tokens_invalid = matches!(obj.get("tokens"), Some(v) if !v.is_null() && !v.is_array());
        if tokens_invalid {
            return Err(Error::SchemaValidation(format!(
                "Markup profile tokens must be a list: {profile_id}"
            )));
        }
        if !obj.contains_key("tokens") {
            obj.insert("tokens".to_string(), Value::Array(Vec::new()));
        }

        let errors = validate_by_kind("markup", &data);
        if !errors.is_empty() {
            let bullets = errors
                .iter()
                .map(|e| format!("  - {e}"))
                .collect::<Vec<_>>()
                .join("\n");
            return Err(Error::SchemaValidation(format!(
                "Markup profile validation failed for '{profile_id}':\n{bullets}"
            )));
        }

        Ok(data)
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

    #[test]
    fn list_profiles_returns_empty_when_dir_missing() {
        let registry = FilesystemMarkupRegistry::new("/nonexistent/talus/markup/dir");
        assert!(registry.list_profiles().is_empty());
    }

    #[test]
    fn list_profiles_returns_empty_when_no_yaml_files() {
        let (_dir, registry) = make_registry();
        assert!(registry.list_profiles().is_empty());
    }

    #[test]
    fn list_profiles_returns_entries_sorted_by_filename() {
        let (dir, registry) = make_registry();
        write_profile(&dir, "c_profile", "id: c\nlabel: C\n");
        write_profile(&dir, "a_profile", "id: a\nlabel: A\n");
        write_profile(&dir, "b_profile", "id: b\nlabel: B\n");
        let ids: Vec<String> = registry.list_profiles().into_iter().map(|p| p.id).collect();
        assert_eq!(ids, vec!["a".to_string(), "b".to_string(), "c".to_string()]);
    }

    #[test]
    fn list_profiles_uses_label_when_present() {
        let (dir, registry) = make_registry();
        write_profile(&dir, "p", "id: p\nlabel: Pretty\n");
        let profiles = registry.list_profiles();
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].label, "Pretty");
    }

    #[test]
    fn list_profiles_falls_back_to_id_when_label_missing() {
        let (dir, registry) = make_registry();
        write_profile(&dir, "p", "id: p\n");
        let profiles = registry.list_profiles();
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].label, "p");
    }

    #[test]
    fn list_profiles_falls_back_to_id_when_label_empty_string() {
        let (dir, registry) = make_registry();
        write_profile(&dir, "p", "id: p\nlabel: ''\n");
        let profiles = registry.list_profiles();
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].label, "p");
    }

    #[test]
    fn list_profiles_defaults_description_to_empty_string() {
        let (dir, registry) = make_registry();
        write_profile(&dir, "p", "id: p\nlabel: P\n");
        let profiles = registry.list_profiles();
        assert_eq!(profiles[0].description, "");
    }

    #[test]
    fn list_profiles_skips_files_without_id() {
        let (dir, registry) = make_registry();
        write_profile(&dir, "anon", "label: Anon\n");
        write_profile(&dir, "named", "id: named\nlabel: Named\n");
        let ids: Vec<String> = registry.list_profiles().into_iter().map(|p| p.id).collect();
        assert_eq!(ids, vec!["named".to_string()]);
    }

    #[test]
    fn list_profiles_deduplicates_by_id_keeping_first() {
        let (dir, registry) = make_registry();
        // Sorted glob order: a_first.yaml then b_second.yaml; both carry id "shared".
        write_profile(&dir, "a_first", "id: shared\nlabel: First\n");
        write_profile(&dir, "b_second", "id: shared\nlabel: Second\n");
        let profiles = registry.list_profiles();
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].id, "shared");
        assert_eq!(profiles[0].label, "First");
    }

    #[test]
    fn list_profiles_skips_malformed_yaml_but_returns_others() {
        let (dir, registry) = make_registry();
        write_profile(&dir, "bad", "id: [unterminated\n");
        write_profile(&dir, "good", "id: good\nlabel: Good\n");
        let ids: Vec<String> = registry.list_profiles().into_iter().map(|p| p.id).collect();
        assert_eq!(ids, vec!["good".to_string()]);
    }
}
