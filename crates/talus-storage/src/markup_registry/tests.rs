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
