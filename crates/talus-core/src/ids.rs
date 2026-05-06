//! Strongly-typed identifiers for domain entities.
//!
//! All IDs are UUID v4 internally but wrapped in newtypes so the type system
//! prevents accidentally passing a `NodeId` where a `TemplateId` is expected.

use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::Uuid;

macro_rules! id_newtype {
    ($name:ident, $doc:literal) => {
        #[doc = $doc]
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub Uuid);

        impl $name {
            /// Create a new random identifier.
            #[must_use]
            pub fn new() -> Self {
                Self(Uuid::new_v4())
            }

            /// Borrow the underlying UUID.
            #[must_use]
            pub fn as_uuid(&self) -> &Uuid {
                &self.0
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.fmt(f)
            }
        }

        impl From<Uuid> for $name {
            fn from(uuid: Uuid) -> Self {
                Self(uuid)
            }
        }
    };
}

id_newtype!(ProjectId, "Identifier for a project (root document).");
id_newtype!(TemplateId, "Identifier for a template definition.");
id_newtype!(NodeId, "Identifier for a node within a project tree.");
id_newtype!(NodeTypeId, "Identifier for a node type within a template.");
id_newtype!(PropertyId, "Identifier for a property within a node type.");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_unique() {
        let a = NodeId::new();
        let b = NodeId::new();
        assert_ne!(a, b);
    }

    #[test]
    fn ids_round_trip_json() {
        let id = ProjectId::new();
        let json = serde_json::to_string(&id).unwrap();
        let parsed: ProjectId = serde_json::from_str(&json).unwrap();
        assert_eq!(id, parsed);
    }

    #[test]
    fn ids_of_different_kinds_are_not_interchangeable() {
        // This is a compile-time guarantee, but we exercise the Display
        // path here so coverage tools see the conversion code.
        let n = NodeId::new();
        let t = TemplateId::new();
        assert_ne!(n.to_string(), t.to_string());
    }
}
