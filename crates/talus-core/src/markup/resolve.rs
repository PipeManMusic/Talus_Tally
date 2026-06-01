//! Resolve a markup definition for a node property: either inline on the
//! property (`markup`) or by reference to a profile in the registry
//! (`markup_profile`).
//!
//! Mirrors Python `backend/infra/markup.py::resolve_markup_definition`.

use crate::error::Result;
use serde_json::Value;

/// Source of registered markup profiles. Kept as a trait so that
/// `talus-core` stays free of file/network I/O; the production
/// implementation lives in `talus-storage`.
pub trait MarkupRegistry {
    /// Load a markup profile by id. Returns the full profile object.
    fn load_profile(&self, profile_id: &str) -> Result<Value>;
}

/// Resolve a markup definition from `prop_data`.
///
/// Returns:
/// * `Ok(None)` if `prop_data` is not an object, carries no `markup`
///   inline definition, and no `markup_profile` reference.
/// * `Ok(Some({id, tokens}))` if `prop_data.markup` is an object. The
///   id defaults to `"inline"`; tokens default to `[]`.
/// * `Ok(Some(profile))` if `prop_data.markup_profile` is a non-empty
///   string id; the full profile returned by the registry.
///
/// Inline `markup` takes precedence over `markup_profile` when both
/// are present (matches Python ordering).
pub fn resolve_markup_definition(
    prop_data: &Value,
    registry: &dyn MarkupRegistry,
) -> Result<Option<Value>> {
    let _ = (prop_data, registry);
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::Error;
    use serde_json::json;
    use std::cell::RefCell;

    /// Test registry that records calls and returns a configured response.
    struct MockRegistry {
        response: RefCell<Option<Result<Value>>>,
        calls: RefCell<Vec<String>>,
    }

    impl MockRegistry {
        fn ok(profile: Value) -> Self {
            Self {
                response: RefCell::new(Some(Ok(profile))),
                calls: RefCell::new(Vec::new()),
            }
        }

        fn err(message: &str) -> Self {
            Self {
                response: RefCell::new(Some(Err(Error::NotFound(message.to_string())))),
                calls: RefCell::new(Vec::new()),
            }
        }

        fn unreachable() -> Self {
            Self {
                response: RefCell::new(None),
                calls: RefCell::new(Vec::new()),
            }
        }
    }

    impl MarkupRegistry for MockRegistry {
        fn load_profile(&self, profile_id: &str) -> Result<Value> {
            self.calls.borrow_mut().push(profile_id.to_string());
            self.response
                .borrow_mut()
                .take()
                .expect("MockRegistry called without configured response")
        }
    }

    #[test]
    fn non_object_prop_data_returns_none() {
        let registry = MockRegistry::unreachable();
        let out = resolve_markup_definition(&json!("not an object"), &registry).unwrap();
        assert_eq!(out, None);
        assert!(registry.calls.borrow().is_empty());
    }

    #[test]
    fn empty_prop_data_returns_none() {
        let registry = MockRegistry::unreachable();
        let out = resolve_markup_definition(&json!({}), &registry).unwrap();
        assert_eq!(out, None);
        assert!(registry.calls.borrow().is_empty());
    }

    #[test]
    fn inline_markup_returns_id_and_tokens() {
        let registry = MockRegistry::unreachable();
        let prop = json!({
            "markup": { "id": "custom", "tokens": [{ "id": "t1", "prefix": "> " }] }
        });
        let out = resolve_markup_definition(&prop, &registry).unwrap();
        assert_eq!(
            out,
            Some(json!({
                "id": "custom",
                "tokens": [{ "id": "t1", "prefix": "> " }],
            }))
        );
    }

    #[test]
    fn inline_markup_without_id_defaults_to_inline() {
        let registry = MockRegistry::unreachable();
        let prop = json!({ "markup": { "tokens": [] } });
        let out = resolve_markup_definition(&prop, &registry).unwrap();
        assert_eq!(out, Some(json!({ "id": "inline", "tokens": [] })));
    }

    #[test]
    fn inline_markup_without_tokens_defaults_to_empty_list() {
        let registry = MockRegistry::unreachable();
        let prop = json!({ "markup": { "id": "x" } });
        let out = resolve_markup_definition(&prop, &registry).unwrap();
        assert_eq!(out, Some(json!({ "id": "x", "tokens": [] })));
    }

    #[test]
    fn inline_markup_takes_precedence_over_profile_reference() {
        let registry = MockRegistry::unreachable();
        let prop = json!({
            "markup": { "id": "inline-1", "tokens": [] },
            "markup_profile": "would-be-loaded",
        });
        let out = resolve_markup_definition(&prop, &registry).unwrap();
        assert_eq!(out, Some(json!({ "id": "inline-1", "tokens": [] })));
        assert!(registry.calls.borrow().is_empty());
    }

    #[test]
    fn profile_reference_triggers_registry_lookup() {
        let profile = json!({ "id": "p1", "label": "P1", "tokens": [] });
        let registry = MockRegistry::ok(profile.clone());
        let prop = json!({ "markup_profile": "p1" });
        let out = resolve_markup_definition(&prop, &registry).unwrap();
        assert_eq!(out, Some(profile));
        assert_eq!(*registry.calls.borrow(), vec!["p1".to_string()]);
    }

    #[test]
    fn registry_error_propagates() {
        let registry = MockRegistry::err("profile missing");
        let prop = json!({ "markup_profile": "missing" });
        let err = resolve_markup_definition(&prop, &registry).unwrap_err();
        assert!(err.to_string().contains("profile missing"), "got {err}");
    }
}
