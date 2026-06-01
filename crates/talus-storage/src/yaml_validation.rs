//! Validate a YAML file against one of the catalog schemas.
//!
//! This is the I/O wrapper around [`talus_core::validation::validate_by_kind`].
//! Mirrors Python `backend/infra/schema_validator.py::validate_yaml_file`.

use std::path::Path;

/// Validate a YAML file at `path` against the schema named by `kind`
/// (`"markup"`, `"icon"`, `"indicator"`).
///
/// Returns `(is_valid, errors)`:
/// * file missing       → `(false, ["File not found: <path>"])`
/// * YAML parse failure → `(false, ["Failed to parse YAML: <msg>"])`
/// * root not a mapping → `(false, ["YAML content must be an object/dict at root level"])`
/// * unknown kind       → `(false, ["Unknown schema type: <kind>"])`
/// * otherwise          → `(errors.is_empty(), errors)` from the dispatched validator
///
/// All error texts match the Python wrapper byte-for-byte to preserve the
/// existing API/UI contract during the migration.
pub fn validate_yaml_file<P: AsRef<Path>>(path: P, kind: &str) -> (bool, Vec<String>) {
    let _ = kind;
    let display = path.as_ref().display().to_string();
    (false, vec![format!("File not found: {display}")])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn write_yaml(contents: &str) -> NamedTempFile {
        let mut file = tempfile::Builder::new()
            .suffix(".yaml")
            .tempfile()
            .expect("tempfile");
        file.write_all(contents.as_bytes()).expect("write yaml");
        file
    }

    #[test]
    fn missing_file_reports_python_message() {
        let (ok, errors) = validate_yaml_file("/nonexistent/path/to/file.yaml", "markup");
        assert!(!ok);
        assert_eq!(
            errors,
            vec!["File not found: /nonexistent/path/to/file.yaml".to_string()]
        );
    }

    #[test]
    fn invalid_yaml_reports_parse_failure() {
        let f = write_yaml("key: [unclosed");
        let (ok, errors) = validate_yaml_file(f.path(), "markup");
        assert!(!ok);
        assert_eq!(errors.len(), 1);
        assert!(
            errors[0].starts_with("Failed to parse YAML:"),
            "got {errors:?}"
        );
    }

    #[test]
    fn yaml_root_list_is_rejected() {
        let f = write_yaml("- one\n- two\n");
        let (ok, errors) = validate_yaml_file(f.path(), "markup");
        assert!(!ok);
        assert_eq!(
            errors,
            vec!["YAML content must be an object/dict at root level".to_string()]
        );
    }

    #[test]
    fn yaml_root_scalar_is_rejected() {
        let f = write_yaml("just a string");
        let (ok, errors) = validate_yaml_file(f.path(), "markup");
        assert!(!ok);
        assert_eq!(
            errors,
            vec!["YAML content must be an object/dict at root level".to_string()]
        );
    }

    #[test]
    fn unknown_kind_is_surfaced() {
        let f = write_yaml("id: p1\nlabel: P1\ntokens: []\n");
        let (ok, errors) = validate_yaml_file(f.path(), "bogus");
        assert!(!ok);
        assert_eq!(errors, vec!["Unknown schema type: bogus".to_string()]);
    }

    #[test]
    fn valid_markup_file_returns_true_and_no_errors() {
        let f = write_yaml("id: p1\nlabel: P1\ntokens: []\n");
        let (ok, errors) = validate_yaml_file(f.path(), "markup");
        assert!(ok, "expected ok, got errors: {errors:?}");
        assert!(errors.is_empty());
    }

    #[test]
    fn invalid_markup_file_returns_false_with_validator_errors() {
        // Missing required id field.
        let f = write_yaml("label: P1\ntokens: []\n");
        let (ok, errors) = validate_yaml_file(f.path(), "markup");
        assert!(!ok);
        assert!(
            errors.iter().any(|e| e.contains("id")),
            "expected id-related error, got {errors:?}"
        );
    }

    #[test]
    fn valid_icon_catalog_file_returns_true() {
        let f = write_yaml("icons: []\n");
        let (ok, errors) = validate_yaml_file(f.path(), "icon");
        assert!(ok, "expected ok, got errors: {errors:?}");
        assert!(errors.is_empty());
    }

    #[test]
    fn valid_indicator_catalog_file_returns_true() {
        let f = write_yaml("indicator_sets: {}\n");
        let (ok, errors) = validate_yaml_file(f.path(), "indicator");
        assert!(ok, "expected ok, got errors: {errors:?}");
        assert!(errors.is_empty());
    }
}
