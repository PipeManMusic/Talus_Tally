//! Typed template (schema) definitions and their loader.
//!
//! Ports the data model of `backend/infra/schema_loader.py` —
//! `NodeTypeDef`, property definitions, and the node-type registry — into
//! typed Rust, redesigned rather than copied (see
//! `docs/architecture/RUST_MIGRATION_PLAN.md` §4b "Data model / schema").
//! Types arrive one TDD cycle at a time:
//!
//! * [`PropertyKind`](crate::template::PropertyKind) — the typed `type:`
//!   field of a property definition.
//! * [`PropertyDefinition`](crate::template::PropertyDefinition) — a single
//!   template property entry, with its
//!   [`SelectOptionDef`](crate::template::SelectOptionDef) options.
//! * [`NodeTypeDef`](crate::template::NodeTypeDef) — a single template
//!   node-type entry, holding its
//!   [`PropertyDefinition`](crate::template::PropertyDefinition)s.
//! * [`TemplateDef`](crate::template::TemplateDef) — a whole template
//!   document, holding its [`NodeTypeDef`](crate::template::NodeTypeDef)s.

mod convert;
mod node_type_def;
mod property_definition;
mod property_kind;
mod template_def;

pub use node_type_def::NodeTypeDef;
pub use property_definition::{PropertyDefinition, SelectOptionDef};
pub use property_kind::PropertyKind;
pub use template_def::TemplateDef;
