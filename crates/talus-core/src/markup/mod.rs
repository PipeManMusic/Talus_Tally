//! Markup parsing and definition resolution.
//!
//! Mirrors Python `backend/infra/markup.py`. Currently exposes the pure
//! parser; registry-aware resolution lands in a sibling submodule.

mod parser;
mod resolve;

pub use parser::parse;
pub use resolve::{resolve_markup_definition, MarkupRegistry};
