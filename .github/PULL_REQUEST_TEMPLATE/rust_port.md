# Pull Request — Rust Port Checklist

> Use this template for any PR that ports a Python module to Rust under
> `crates/`. See [docs/architecture/RUST_MIGRATION_PLAN.md](../docs/architecture/RUST_MIGRATION_PLAN.md)
> §4a (Clean-slate principles) and §4b (Tech debt inventory).

## Summary
<!-- One paragraph: what was ported, from which Python module(s). -->

## Tech debt inventory items resolved
<!-- List the bullets from RUST_MIGRATION_PLAN.md §4b that this PR closes.
     Format: `- [x] backend/foo.py:123 — <smell> — fixed by <file>:<line>` -->

## Clean-slate rule audit
Tick every box. If a box cannot be ticked, explain in the PR description and
get explicit reviewer sign-off — do not silently skip.

### Type system
- [ ] No `serde_json::Value` or `HashMap<String, Value>` in domain code added by this PR.
- [ ] All ids are newtypes (`ProjectId`, `NodeId`, etc.) — no raw `String` or `Uuid`.
- [ ] Illegal states are unrepresentable (enums with payloads, not flag fields).
- [ ] Every persisted struct introduced or touched carries a `schema_version`.

### Mutation
- [ ] All state changes go through `apply_command`. No direct mutation of `Project` / `Node` / `Template` state.
- [ ] No new global mutable state. Shared state is owned by `App` / explicit registry.

### Errors
- [ ] No `.unwrap()` outside tests and `main`.
- [ ] No string errors. New fallible code returns a typed `Result<T, E>`.
- [ ] HTTP status codes are derived from the error type, not chosen at the catch site.
- [ ] No silent `continue` over malformed input.

### Boundaries
- [ ] Domain types in `talus-core` have no `axum` / `tokio` / `tauri` / `sqlx` deps.
- [ ] Handlers are thin (~30 lines): deserialize → validate ids → command → serialize.
- [ ] Persistence sits behind a `talus-storage` trait.

### Observability
- [ ] No `print!` / `println!` / `eprintln!` in non-test code. `tracing` only.
- [ ] All log events use structured fields, not formatted strings.

### Modules
- [ ] No file added by this PR exceeds 400 lines.
- [ ] No function added by this PR exceeds 50 lines.
- [ ] No new module is named `core` / `util` / `helpers` / `infra`.

### Testing
- [ ] Property tests added for any newly-stated invariant.
- [ ] Snapshot tests added for any new persisted shape.
- [ ] No fixture is mutated across tests.

### Process
- [ ] No `TODO` / `HACK` / `FIXME` comments without a tracked issue link.
- [ ] `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, and `cargo test --workspace` all pass locally.

## Behavioral parity evidence
<!-- For Phase 2+ ports: how do we know the Rust output matches the Python output?
     Link the parity test, the snapshot diff, or the dual-run benchmark. -->
