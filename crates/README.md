# Talus Tally — Rust Workspace

This is the **Phase 1** scaffold of the Rust migration described in
[`docs/architecture/RUST_MIGRATION_PLAN.md`](../docs/architecture/RUST_MIGRATION_PLAN.md).

> **Status:** Phase 1 scaffold. Builds and tests, but ships nothing to users yet.
> The Python backend in `backend/` remains the production server.

## Layout

```
crates/
  talus-core/         Pure domain logic. No I/O, no network, no UI.
                      Mirrors backend/ business rules, ported one module at a time.

  talus-storage/      Storage trait + in-memory implementation.
                      SQLite implementation arrives in Phase 3.

  talus-bin-bench/    CLI for microbenchmarks and parity testing
                      against the Python backend.
```

## Build

From the repository root:

```bash
cargo build --workspace
cargo test  --workspace
```

## Adding a port from Python

When porting a function from `backend/` to `talus-core`:

1. Identify the Python function and its tests in `tests/`.
2. Generate a golden-file fixture: feed representative inputs through
   the Python implementation, capture outputs as JSON.
3. Implement the Rust counterpart in `crates/talus-core/src/`.
4. Add a `#[test]` in `crates/talus-core/tests/` that loads the golden
   fixture and asserts the Rust output equals the captured Python output.
5. Document the port in `docs/architecture/RUST_CORE_API.md` (TBD).

## Crate boundaries

The crate boundaries are **invariants**, enforced by review:

- `talus-core` MUST NOT depend on: `tokio`, `axum`, `tauri`, `sqlx`, `rusqlite`,
  any HTTP client, any filesystem operation beyond `std::io::Read`/`Write` on
  caller-supplied byte streams.
- `talus-storage` MUST NOT depend on: `axum`, `tauri`, anything that knows about
  users or networking.
- Crates downstream of `talus-core` MAY depend on it; `talus-core` depends on
  none of them.

## What this scaffold does NOT do (yet)

- No replacement of the Python backend (Phase 2).
- No SQLite or Automerge (Phase 3).
- No Tauri integration (Phase 2b).
- No mobile builds (Phase 4).
- No hosted server, auth, or sync (Phase 5+).

See the migration plan for the full sequencing.
