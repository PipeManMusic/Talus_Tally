//! Manual smoke-test for `Property` constructors.
//!
//! Run with:
//!
//! ```text
//! cargo run -p talus-core --example try_property
//! ```
//!
//! This is intentionally NOT a test — it's a sandbox for kicking the tires.
//! Edit values, recompile, observe. The real correctness gates are the
//! unit + property tests in `crates/talus-core/src/property.rs`.

use talus_core::property::Property;

fn main() {
    println!("== Property::number ==");
    show("number(42.0)", Property::number(42.0));
    show("number(-3.5)", Property::number(-3.5));
    show("number(NaN)", Property::number(f64::NAN));
    show("number(+inf)", Property::number(f64::INFINITY));

    println!("\n== Property::date_iso ==");
    show("date_iso(\"2025-01-20\")", Property::date_iso("2025-01-20"));
    show("date_iso(\"2024-02-29\")", Property::date_iso("2024-02-29")); // leap
    show("date_iso(\"2025-02-29\")", Property::date_iso("2025-02-29")); // non-leap
    show("date_iso(\"2025-13-01\")", Property::date_iso("2025-13-01"));
    show("date_iso(\"2025/01/20\")", Property::date_iso("2025/01/20"));
    show("date_iso(\"2025-1-20\")", Property::date_iso("2025-1-20"));

    println!("\n== Property::Text (no validation today) ==");
    let t = Property::Text("Alice Chen".into());
    println!("  {t:?}");
}

fn show(label: &str, result: talus_core::error::Result<Property>) {
    match result {
        Ok(p) => println!("  {label:30} -> Ok({p:?})"),
        Err(e) => println!("  {label:30} -> Err({e})"),
    }
}
