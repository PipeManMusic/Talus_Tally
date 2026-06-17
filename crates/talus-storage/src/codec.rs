//! JSON codec for [`Project`].
//!
//! Bridges the typed `Project` aggregate from `talus-core` and the raw
//! byte blob shape that [`crate::ProjectStore`] traffics in. Layered
//! this way so a future Phase 3 binary codec (Automerge / bincode)
//! can sit alongside without touching the store API.

use talus_core::command::{Command, Event};
use talus_core::error::{Error, Result};
use talus_core::project::Project;

/// Serialize `project` to its canonical JSON byte representation.
///
/// The shape matches the snapshot pinned by
/// `talus_core::project::tests::project_json_shape_is_locked`.
///
/// # Errors
/// Returns [`Error::Serialization`] if `serde_json` fails (in practice
/// only when the JSON value tree is unrepresentable; `Project`'s
/// fields are not).
pub fn encode(project: &Project) -> Result<Vec<u8>> {
    serde_json::to_vec(project).map_err(|e| Error::Serialization(e.to_string()))
}

/// Parse a `Project` from its canonical JSON byte representation.
///
/// # Errors
/// Returns [`Error::Serialization`] if `bytes` is not valid JSON or
/// does not match the `Project` shape.
pub fn decode(bytes: &[u8]) -> Result<Project> {
    serde_json::from_slice(bytes).map_err(|e| Error::Serialization(e.to_string()))
}

/// Serialize a [`Command`] to its canonical JSON byte representation.
///
/// # Errors
/// Returns [`Error::Serialization`] if `serde_json` fails.
pub fn encode_command(cmd: &Command) -> Result<Vec<u8>> {
    serde_json::to_vec(cmd).map_err(|e| Error::Serialization(e.to_string()))
}

/// Parse a [`Command`] from its canonical JSON byte representation.
///
/// # Errors
/// Returns [`Error::Serialization`] if `bytes` is not valid JSON or
/// does not match the `Command` shape.
pub fn decode_command(bytes: &[u8]) -> Result<Command> {
    serde_json::from_slice(bytes).map_err(|e| Error::Serialization(e.to_string()))
}

/// Serialize an [`Event`] to its canonical JSON byte representation.
///
/// # Errors
/// Returns [`Error::Serialization`] if `serde_json` fails.
pub fn encode_event(event: &Event) -> Result<Vec<u8>> {
    serde_json::to_vec(event).map_err(|e| Error::Serialization(e.to_string()))
}

/// Parse an [`Event`] from its canonical JSON byte representation.
///
/// # Errors
/// Returns [`Error::Serialization`] if `bytes` is not valid JSON or
/// does not match the `Event` shape.
pub fn decode_event(bytes: &[u8]) -> Result<Event> {
    serde_json::from_slice(bytes).map_err(|e| Error::Serialization(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use talus_core::command::{Command, Event};
    use talus_core::ids::TemplateId;
    use talus_core::node_type::NodeType;
    use talus_core::project::Project;

    #[test]
    fn encode_then_decode_round_trips_an_empty_project() {
        let p = Project::new("Sample", TemplateId::new());
        let bytes = encode(&p).unwrap();
        let parsed = decode(&bytes).unwrap();
        assert_eq!(parsed, p);
    }

    #[test]
    fn encode_then_decode_round_trips_a_project_with_a_node_type() {
        let mut p = Project::new("P", TemplateId::new());
        p.register_node_type(NodeType::new("Task")).unwrap();
        let bytes = encode(&p).unwrap();
        let parsed = decode(&bytes).unwrap();
        assert_eq!(parsed, p);
    }

    #[test]
    fn decode_invalid_json_returns_serialization_error() {
        let err = decode(b"not json at all").expect_err("invalid json");
        assert!(
            matches!(err, talus_core::error::Error::Serialization(_)),
            "got {err:?}"
        );
    }

    #[test]
    fn encode_then_decode_command_round_trips() {
        let cmd = Command::RegisterNodeType(Box::new(NodeType::new("Equipment")));
        let bytes = encode_command(&cmd).unwrap();
        let parsed = decode_command(&bytes).unwrap();
        assert_eq!(parsed, cmd);
    }

    #[test]
    fn decode_command_invalid_json_returns_serialization_error() {
        let err = decode_command(b"not json").expect_err("invalid json");
        assert!(matches!(err, Error::Serialization(_)), "got {err:?}");
    }

    #[test]
    fn encode_then_decode_event_round_trips() {
        let ev = Event::NodeInserted(talus_core::node::Node::new(
            talus_core::ids::NodeTypeId::new(),
            "n",
        ));
        let bytes = encode_event(&ev).unwrap();
        let parsed = decode_event(&bytes).unwrap();
        assert_eq!(parsed, ev);
    }

    #[test]
    fn decode_event_invalid_json_returns_serialization_error() {
        let err = decode_event(b"not json").expect_err("invalid json");
        assert!(matches!(err, Error::Serialization(_)), "got {err:?}");
    }
}
