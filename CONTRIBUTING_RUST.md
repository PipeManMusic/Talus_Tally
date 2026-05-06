# Contributing to the Rust workspace

This document is the operating manual for `crates/` (the Rust port). It is
short on purpose. The long-form rules live in
[docs/architecture/RUST_MIGRATION_PLAN.md](../docs/architecture/RUST_MIGRATION_PLAN.md)
§4a (clean-slate principles) and §4b (tech debt inventory).

## TL;DR

```bash
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets
cargo test --workspace --doc
```

All four must be green locally before opening a PR. CI runs the same on Linux,
macOS, and Windows.

## Strict TDD workflow

Every change to `crates/` is developed Red → Green → Refactor. The discipline
must be visible in the git log so reviewers can see it without running the
code.

### The cycle

1. **RED.** Write a failing test that names the behavior you want. Run it.
   Confirm it fails for the right reason. Commit:
   ```
   test(<scope>): <name> [RED]
   ```
2. **GREEN.** Write the minimum production code that makes the test pass.
   Resist the urge to add anything else. Commit:
   ```
   feat(<scope>): <name> [GREEN]
   ```
3. **REFACTOR.** With every test green, improve the design. No new behavior.
   Commit:
   ```
   refactor(<scope>): <what was cleaned up>
   ```

`<scope>` is the crate or module path: `talus-core`, `talus-core/property`,
`talus-storage/memory`, etc.

### Allowed deviations

- **Trivial test additions** (a second example for an already-implemented
  variant) may go in a single `test(...)` commit without a paired feature
  commit, since the production code does not change.
- **Pure documentation** changes use `docs(...)` and skip the cycle.
- **Build / CI / tooling** changes use `chore(...)` or `ci(...)`.

### What is NOT allowed

- Implementation commits with no preceding RED commit. If you find you wrote
  production code first, write the test, run it, confirm it would have caught
  the absence of the code, then submit both as separate commits anyway.
- Squashing RED + GREEN into one commit. The whole point is that history
  documents the intent.
- Skipping REFACTOR by leaving smelly code "for later". Later does not exist.

## Test conventions

- **Unit tests** live in a `#[cfg(test)] mod tests { }` block at the bottom
  of each module. Reach for them first.
- **Property tests** use `proptest` and live in the same `mod tests` block.
  Anywhere we say "for all X, P(X) holds" we write a property test, not a
  single-example unit test.
- **Snapshot tests** use `insta`. Every persisted shape gets one. Run
  `cargo insta review` to accept changes — never edit `.snap` files by hand.
- **Integration tests** live under `crates/<crate>/tests/`. Reserve them for
  cross-module behavior; do not duplicate unit-test coverage.
- **Doctests** are tests too. Public API examples must compile and pass.

## Lint policy

- `unsafe_code = "forbid"` workspace-wide.
- `clippy::all` and `clippy::pedantic` warn-by-default; CI promotes warnings
  to errors via `RUSTFLAGS=-D warnings`.
- Allow-lists per crate are minimal and justified in the `Cargo.toml`.
- A clippy `#[allow]` on an item requires a one-line comment explaining why.

## Pre-PR checklist

Before opening a PR that touches `crates/`:

- [ ] `cargo fmt --all` ran clean (no diff).
- [ ] `cargo clippy --workspace --all-targets -- -D warnings` is green.
- [ ] `cargo test --workspace --all-targets` and `--doc` are green.
- [ ] Every behavior change has a test that was committed RED first.
- [ ] If the change ports a Python module, the
      [Rust port PR template](.github/PULL_REQUEST_TEMPLATE/rust_port.md)
      checklist is filled in and the §4b inventory items it resolves are
      listed in the PR description.
