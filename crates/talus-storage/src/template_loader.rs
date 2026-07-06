//! Load a template document from a YAML file into a typed [`TemplateDef`].
//!
//! This is the I/O wrapper around `serde_yaml` + [`TemplateDef`]; the parsing
//! and typed model live in `talus-core` (pure), while reading the file lives
//! here (I/O). Mirrors the file-loading half of Python
//! `backend/infra/schema_loader.py`.

use std::path::Path;

use talus_core::error::{Error, Result};
use talus_core::project::Project;
use talus_core::template::TemplateDef;

/// Read and parse the template file at `path` into a [`TemplateDef`].
///
/// # Errors
/// * [`Error::NotFound`] if no file exists at `path`.
/// * [`Error::Io`] if the file exists but cannot be read.
/// * [`Error::Serialization`] if the contents are not a valid template
///   (invalid YAML, or missing required keys such as `name` / `uuid`).
pub fn load_template<P: AsRef<Path>>(path: P) -> Result<TemplateDef> {
    let path = path.as_ref();
    if !path.exists() {
        return Err(Error::NotFound(path.display().to_string()));
    }
    let contents = std::fs::read_to_string(path).map_err(|e| Error::Io(e.to_string()))?;
    serde_yaml::from_str(&contents).map_err(|e| Error::Serialization(e.to_string()))
}

/// Load the template at `path` and build a fresh [`Project`] named `name`
/// with every declared node type registered.
///
/// This is the full load path: file → [`TemplateDef`] → [`Project`], the
/// Rust replacement for Python's schema-load-then-instantiate flow.
///
/// # Errors
/// * [`Error::NotFound`] if no file exists at `path`.
/// * [`Error::Io`] if the file exists but cannot be read.
/// * [`Error::Serialization`] if the contents are not a valid template.
/// * [`Error::InvariantViolation`] if the template declares two node types
///   with the same `uuid`.
pub fn load_project<P: AsRef<Path>>(path: P, name: impl Into<String>) -> Result<Project> {
    load_template(path)?.to_project(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    const TEMPLATE: &str = r"
name: Book
description: A template to help you write a book
version: 0.1.0
uuid: 69ff5bb9-c64b-4f66-a241-9573e2d5b173
blocking_view:
  node_size:
    base_height: 100
node_types:
  - id: root
    uuid: dda577b6-9f7c-8feb-e893-5e6f32522a56
    label: Book
    features:
      - is_root
    allowed_children:
      - chapter
    properties: []
  - id: chapter
    uuid: a5a68b68-95f5-f84a-2626-d46603662310
    label: Chapter
    properties: []
";

    fn write_yaml(contents: &str) -> NamedTempFile {
        let mut file = tempfile::Builder::new()
            .suffix(".yaml")
            .tempfile()
            .expect("tempfile");
        file.write_all(contents.as_bytes()).expect("write yaml");
        file
    }

    #[test]
    fn loads_valid_template() {
        let file = write_yaml(TEMPLATE);
        let tpl = load_template(file.path()).expect("load template");
        assert_eq!(tpl.name, "Book");
        assert_eq!(tpl.node_types.len(), 2);
        assert_eq!(tpl.node_type("chapter").unwrap().label, "Chapter");
    }

    #[test]
    fn missing_file_is_not_found() {
        let err = load_template("/nonexistent/template.yaml").unwrap_err();
        assert!(matches!(err, Error::NotFound(_)), "got {err:?}");
    }

    #[test]
    fn invalid_yaml_is_serialization_error() {
        let file = write_yaml("name: Book\nnode_types: [unclosed");
        let err = load_template(file.path()).unwrap_err();
        assert!(matches!(err, Error::Serialization(_)), "got {err:?}");
    }

    #[test]
    fn missing_required_key_is_serialization_error() {
        // No `uuid` / `name`: serde rejects the missing required fields.
        let file = write_yaml("description: incomplete\nnode_types: []");
        let err = load_template(file.path()).unwrap_err();
        assert!(matches!(err, Error::Serialization(_)), "got {err:?}");
    }

    #[test]
    fn load_project_builds_registry_from_file() {
        let file = write_yaml(TEMPLATE);
        let project = load_project(file.path(), "My Book").expect("load project");
        assert_eq!(project.name(), "My Book");
        assert_eq!(project.node_types().count(), 2);
    }

    #[test]
    fn load_project_missing_file_is_not_found() {
        let err = load_project("/nonexistent/template.yaml", "X").unwrap_err();
        assert!(matches!(err, Error::NotFound(_)), "got {err:?}");
    }

    /// Parity guard: the real production template must load end-to-end and
    /// register every declared node type. `project_talus.yaml` exercises the
    /// full property-type surface (`object`, `node_reference`, both node- and
    /// property-level `velocityConfig`, etc.).
    #[test]
    fn loads_real_project_talus_template() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../data/templates/project_talus.yaml"
        );
        let project = load_project(path, "Project Talus").expect("load real template");
        assert_eq!(project.node_types().count(), 23);
        let root_id =
            talus_core::ids::NodeTypeId::from(uuid::uuid!("292b9e11-45c7-94f4-20db-7f6085266a4f"));
        let root = project
            .get_node_type(root_id)
            .expect("project_root node type");
        assert_eq!(root.name(), "Project");
    }
}
