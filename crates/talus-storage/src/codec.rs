//! JSON codec for [`Project`].
//!
//! Bridges the typed `Project` aggregate from `talus-core` and the raw
//! byte blob shape that [`crate::ProjectStore`] traffics in. Layered
//! this way so a future Phase 3 binary codec (Automerge / bincode)
//! can sit alongside without touching the store API.

#[cfg(test)]
mod tests {
    use super::*;
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
}
