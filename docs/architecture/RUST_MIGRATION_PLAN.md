# Talus Tally — Rust / CRDT / Multi-Tenant Architecture Migration Plan

**Status:** Draft v1
**Author:** Architecture working notes
**Last updated:** 2026-05-06
**Target:** v0.2 → v1.0
**Audience:** Implementation engineers, future maintainers

---

## 1. Executive summary

This document is the canonical migration plan for moving Talus Tally from its current
architecture (Python/Flask backend, YAML storage, single-user desktop) to the target
architecture (Rust core library, Automerge CRDT, SQLite local storage, optional hosted
multi-user collaboration with role-based permissions, desktop + mobile).

The migration is sequenced as **eight phases over an estimated 12–18 calendar months**,
each producing a shippable release. Each phase strictly preserves existing user-visible
behavior unless explicitly noted. Every phase has explicit rollback criteria, parity
tests, and exit conditions.

**Non-goals:**
- This is not a rewrite for the sake of it. Each phase must justify itself in user
  value or unblocked future capability.
- Existing project files (YAML/JSON) must remain importable forever.
- The web/JS/React frontend stays. Only the backend and storage layers change.

---

## 2. Current state (v0.1.11-alpha.2)

| Layer | Today |
|---|---|
| Frontend | React + TypeScript + Vite + Tauri 2 |
| Desktop shell | Tauri (Rust) — already in place, minimal logic |
| Backend | Python 3.11 + Flask + Flask-SocketIO + Werkzeug |
| Storage | YAML files (templates), JSON files (projects) |
| Bundling | PyInstaller `--onedir`, staged into Tauri resources |
| Distribution | `.deb` (Linux), `.dmg` (macOS), `.nsis` (Windows) |
| Tests | pytest (539 backend), Vitest (278 frontend), Playwright (E2E) |
| CI | GitHub Actions, three-platform build on tag push |

### Pain points motivating this migration

1. **Windows packaging is fragile.** PyInstaller + Defender = 30–90s cold start; multiple
   hotfixes already shipped (UTF-8 BOM, IPv4 loopback, 120s timeout).
2. **No mobile path.** Python cannot be bundled into a Tauri 2 mobile app on iOS or
   Android.
3. **No multi-user story.** Single user, file-on-disk model.
4. **Schema drift is manual.** Template editor round-trips, orphan reconciliation, and
   legacy-key handling all exist because YAML has no enforced schema.
5. **Operational complexity at runtime.** Subprocess lifecycle management
   (`taskkill`/`pkill`), TCP loopback connection, daemon mode signal handling, async
   mode probing. All of this disappears with an in-process Rust core.

---

## 3. Target architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         talus-core (Rust crate)                      │
│                                                                      │
│  Domain logic, mutation engine, schema validation, Automerge doc     │
│  operations, indicator catalog, markup rendering, CSV import/export. │
│                                                                      │
│  No knowledge of: users, networking, UI, persistence backend.        │
│  Storage exposed via trait. CRDT exposed via trait.                  │
└──────────────────────────────────────────────────────────────────────┘
            ▲                    ▲                    ▲
            │                    │                    │
   ┌────────┴────────┐  ┌────────┴────────┐  ┌────────┴────────┐
   │ talus-desktop   │  │ talus-mobile    │  │ talus-server    │
   │ (Tauri 2)       │  │ (Tauri 2 mobile)│  │ (axum + WS)     │
   │ embeds core     │  │ embeds core     │  │ multi-tenant    │
   │ + SQLite local  │  │ + SQLite local  │  │ + Postgres      │
   └─────────────────┘  └─────────────────┘  └────────┬────────┘
                                                      │
                                            ┌─────────┴─────────┐
                                            │  Postgres         │
                                            │  - identity       │
                                            │  - access_grants  │
                                            │  - audit_events   │
                                            │  - project_changes│
                                            │    (CRDT deltas)  │
                                            └───────────────────┘
                                            ┌───────────────────┐
                                            │  Auth provider    │
                                            │  (Clerk / WorkOS) │
                                            └───────────────────┘
                                            ┌───────────────────┐
                                            │  Object storage   │
                                            │  (S3 / R2)        │
                                            │  icons, exports,  │
                                            │  CRDT snapshots   │
                                            └───────────────────┘
```

### Key technology choices (with rationale)

| Choice | Rejected alternatives | Why |
|---|---|---|
| **Rust** for core | Go, Zig, keep Python | Cross-compiles to mobile, no runtime dependency, mature crate ecosystem (`serde`, `axum`, `automerge`), already used by Tauri |
| **Automerge** for CRDT | Y.js/yrs, custom OT, no CRDT | Rust-native, tree-shaped data fits domain, mature, designed for this exact use case |
| **SQLite** local | Sled, RocksDB, file-based | Universal, mobile-friendly, embedded, transactional, "the project file is a SQLite database" |
| **Postgres** server | SQLite-per-tenant, Mongo, FoundationDB | Operational maturity, RLS for multi-tenancy, LISTEN/NOTIFY, every cloud supports it |
| **Axum** server framework | Actix, Rocket, Warp | Tokio-native, type-safe, dominant choice for new Rust web services |
| **Clerk or WorkOS** for auth | Self-hosted Keycloak/Ory, roll own | Authentication is a 6-month rabbit hole; outsource it |
| **CRDT for content, RDBMS for permissions** | All-CRDT, all-RDBMS | Permissions need authoritative single source of truth; content needs offline-first multi-writer |

---

## 4. Migration principles (non-negotiable)

These are **rules** that constrain every phase. Violating them derails the migration.

1. **Frontend contract stability.** The HTTP/WebSocket API surface stays compatible
   between Python and Rust backends. Any change is versioned, dual-shipped, and
   validated by the existing Playwright E2E suite.
2. **YAML import compatibility forever.** Every existing template and project file must
   remain importable. We add migration logic, never break readers.
3. **Tests gate every phase.** A phase is not "done" until: existing tests pass,
   new behavior has tests, manual smoke test on all three desktop OSes succeeds.
4. **Each phase ships a release.** No long-lived feature branches. Every phase ends
   in a tagged release, even if it's alpha.
5. **Reversibility.** Each phase has a documented rollback. We do not paint ourselves
   into corners.
6. **One phase at a time.** Phases do not overlap. Concurrent reorganizations create
   defects faster than they fix them.
7. **No new business features during migration phases.** Bug fixes and security only.
   Feature freeze on migration phases is the only way they finish.
8. **Talus-core has no knowledge of users, networking, or UI.** Enforced by code
   review and crate boundaries (`talus-core` has zero `axum`, `tokio`, `tauri` deps).
9. **Port intent, not code.** The Rust backend is a *clean rewrite informed by the
   Python implementation*, not a line-by-line translation. Carrying over the Python
   structure carries over its tech debt. See §4a.

---

## 4a. Clean-slate principles (no carried-over tech debt)

The Python backend grew organically. We now know things we did not know at the
start: that mutations need a single pipeline, that the desktop runtime is
PyInstaller-hostile, that the document model wants to be a CRDT, that
formatting belongs in the document, not in the renderer. **The Rust port is
our chance to bake those lessons in from line one.** It is a refactor disguised
as a rewrite. The following are non-negotiable design rules for every Rust
module:

### Type system rules
- **No `serde_json::Value` or `HashMap<String, Value>` in domain code.**
  Every shape is a named struct or enum. JSON is parsed at the boundary into
  typed values; if it fails, it fails loudly. The Python code's
  `Dict[str, Any]` for node properties (see [backend/core/node.py](backend/core/node.py))
  is the single biggest source of correctness bugs and must not survive.
- **Newtype every id.** `ProjectId`, `NodeId`, `TemplateId`, `PropertyId` are
  distinct types — never `String`, never `Uuid` directly. The compiler catches
  the entire class of "passed a node id where a property id was expected" bugs.
  (Already done in [crates/talus-core/src/ids.rs](crates/talus-core/src/ids.rs).)
- **Make illegal states unrepresentable.** Use enums with payloads, not flag
  fields. A node either has a parent or it is a root — represent that as a
  variant, not as `parent_id: Option<NodeId>` plus three runtime checks.
- **Every persisted struct carries a `schema_version`.** Migrations are typed
  conversions between numbered versions, not stringly-typed key remapping like
  [backend/infra/migrations.py](backend/infra/migrations.py).

### Mutation rules
- **One pipeline. No exceptions.** Every state change goes through `apply_command`.
  No code anywhere in the workspace mutates a `Project` directly. The Python
  bypass at [backend/api/routes.py:2119](backend/api/routes.py) (reference
  remapping during template load that mutates `node.properties` outside the
  command pipeline) is exactly the kind of thing that becomes impossible to do
  in Rust because the mutation API takes `&self` and returns a new state +
  command record.
- **Commands are data, not behavior.** A `Command` is a serializable enum.
  Executing it is a free function `apply(state, cmd) -> (state, event)`. This
  is what makes undo, replay, and CRDT merge fall out for free.
- **No global mutable state.** No equivalent of `_sessions` /
  `_session_metadata` ([backend/api/routes.py:241-242](backend/api/routes.py)).
  State is owned by an explicit `App` struct passed by `&self`. If a value
  needs to be shared across tasks, it is `Arc<RwLock<T>>` and the locking is
  visible at the call site.

### Error rules
- **No `unwrap()` outside tests and `main`.** Enforced by clippy lint.
- **No string errors.** Every fallible operation returns `Result<T, E>` where
  `E` is a typed error enum scoped to the module. The Python pattern of
  `except Exception as e: return jsonify({"error": str(e)}), 500`
  ([backend/api/routes.py:238](backend/api/routes.py)) becomes impossible
  because there is no `Exception` to catch.
- **HTTP status codes are derived from the error type, not chosen at the
  catch site.** Validation errors are `400` by construction; only true
  programming errors map to `500`.
- **No silent skips.** The Python pattern of `except Exception: continue` over
  malformed templates ([backend/infra/template_persistence.py:259](backend/infra/template_persistence.py))
  is forbidden. Either we surface the error, or we do not consume the input.

### Boundary rules
- **HTTP/WebSocket types live in `talus-server`. Domain types live in
  `talus-core`.** A handler converts between them. Domain types never grow a
  `to_response()` method.
- **No business logic in handlers.** A handler does: deserialize → validate
  ids exist → build command → call `apply_command` → serialize result. If a
  handler is more than ~30 lines, it is doing something wrong.
- **Persistence is behind a trait.** Already done in
  [crates/talus-storage/src/project_store.rs](crates/talus-storage/src/project_store.rs).
  Tests use the in-memory impl. Production swaps in SQLite. Code under test
  never knows the difference.
- **No `eval`-equivalents.** The Python backend's `eval()` for velocity formulas
  ([backend/infra/velocity.py:36](backend/infra/velocity.py)) is replaced by an
  explicit expression AST evaluator, even though it costs more code.

### Observability rules
- **No `print()` in production code.** Use the `tracing` crate. The Python
  code is littered with `print()` calls in command undo paths
  ([backend/handlers/commands/node_commands.py:404-417](backend/handlers/commands/node_commands.py))
  and in graph mutation ([backend/core/graph.py:51-58](backend/core/graph.py)).
  These do not survive the port.
- **Structured logs only.** Every log event is a `tracing::event!` with named
  fields, not a formatted string. This is what makes log aggregation work in
  the hosted backend (Phase 5).

### Module rules
- **Modules are named after what they do, not when they were written.** No
  `infra/` catch-all. The Python `backend/infra/` directory holds settings,
  migrations, persistence, velocity, markup, orphan management, and template
  persistence — six unrelated concerns. In Rust each gets its own crate or
  module with a single responsibility.
- **No file over 400 lines.** No function over 50 lines. The Python
  `load_graph_into_session()` ([backend/api/routes.py:2144](backend/api/routes.py))
  is 150+ lines of nested helpers. That shape is not portable; it must be
  decomposed during the port.
- **No `core` / `util` / `helpers` modules.** Every module justifies its name.

### Testing rules
- **Property tests for every invariant.** `proptest` is already a workspace
  dep. Anywhere we say "this should always be true" we write a property test,
  not a single-example unit test.
- **Snapshot tests for serialization.** `insta` is already a workspace dep.
  Every persisted shape gets a snapshot so schema drift is caught at PR time,
  not by a user opening an old file.
- **No fixture mutation.** Test fixtures are `&'static` or freshly cloned per
  test. The frontend testing workflow already records pain from shared
  fixture state ([frontend/FRONTEND_TESTING_WORKFLOW.md](frontend/FRONTEND_TESTING_WORKFLOW.md));
  we do not repeat it on the backend side.

### Process rules
- **Each ported module is reviewed against this section before merge.** The
  PR template (added in Phase 1) includes a checklist mapping to these rules.
- **A "matches the Python" review comment is grounds for changes.** If the
  Rust shape mirrors the Python shape, that is a smell, not a feature. The
  Python backend is reference behavior, not reference design.

---

## 4b. Tech debt inventory (Python backend, audited 2026-05-06)

This is the list of concrete smells the rewrite must NOT carry forward. It
was assembled by reading `backend/` and the architecture docs end-to-end. Each
item names a file:line, the smell, and the Rust remediation. The phase that
removes the item is in brackets.

### Architecture / boundary leaks
- [backend/app.py:61](backend/app.py) — Global `socketio` singleton without sync → owned by an `App` struct, locking visible at call sites. **[Phase 2]**
- [backend/api/routes.py:241-242](backend/api/routes.py) — Two parallel global session dicts (`_sessions`, `_session_metadata`) accessed unlocked from Flask + SocketIO threads → single `SessionRegistry` owned by `App`, behind `RwLock`. **[Phase 2]**
- [backend/infra/settings.py:79](backend/infra/settings.py) — Mutable `_cache` global for settings, can go stale → `OnceCell` for immutable lazy init; explicit reload API. **[Phase 2]**
- [backend/infra/migrations.py:277](backend/infra/migrations.py) — Mutable global `_migrations_registry` → static slice of typed migrations registered at compile time. **[Phase 3]**
- `backend/infra/` — One directory holds six unrelated concerns → split into `talus-storage`, `talus-templates`, `talus-formulas`, `talus-markup`, `talus-migrations`. **[Phases 1–3]**

### Data model / schema
- [backend/core/node.py](backend/core/node.py) — `properties: Dict[str, Any]`, no `schema_version`, untyped values everywhere → `Property` enum with typed variants; `Node { schema_version: SchemaVersion, properties: IndexMap<PropertyId, Property> }`. **[Phase 1]**
- [backend/infra/orphan_manager.py:21-41](backend/infra/orphan_manager.py) — `_iter_graph_nodes()` duck-types dict-graphs vs list-graphs vs `ProjectGraph` → single typed `Graph` representation; conversion happens once at the boundary. **[Phase 1]**
- [backend/infra/persistence.py:5](backend/infra/persistence.py) — `string_to_uuid()` invents `uuid5(NAMESPACE_DNS, s)` for unmapped strings → unmapped reference is a hard error; no silent UUID fabrication. **[Phase 3]**
- [backend/infra/schema_loader.py:11](backend/infra/schema_loader.py) — `_generate_stable_uuid()` SHA1s without a version → derived UUIDs include `(schema_version, namespace, key)`. **[Phase 3]**
- [backend/api/project_manager.py:35](backend/api/project_manager.py) — `hasattr(nt, 'id') and hasattr(nt, 'name')` runtime structural typing → trait bound `NodeTypeDef`. **[Phase 1]**

### Mutation / state management
- [backend/api/routes.py:2119-2122](backend/api/routes.py) — Reference remapping during template load mutates `node.properties` directly, bypassing the command pipeline → mutations only via `apply_command(state, Command::Reconcile { .. })`. **[Phase 2]**
- [backend/api/routes.py:2141-2169](backend/api/routes.py) — Bulk default-property writes during project load skip dispatcher → `Command::HydrateDefaults` issued after load completes. **[Phase 2]**
- [backend/handlers/commands/node_commands.py:404-417](backend/handlers/commands/node_commands.py) — `print()` debug in `undo()` path → `tracing::trace!` with structured fields. **[Phase 2]**

### Validation
- [backend/infra/velocity.py:36](backend/infra/velocity.py) — `eval(formula, {"__builtins__": {}})` for velocity formulas → typed expression AST + interpreter; no host-language eval. **[Phase 3]**
- [backend/api/text_editor_routes.py:328](backend/api/text_editor_routes.py) — `TODO`: incomplete spell-check word validation → no `TODO` comments allowed in ported code; either implement or `unimplemented!()` with tracking issue. **[Phase 2]**
- [backend/infra/migrations.py:101](backend/infra/migrations.py) — `apply()` returns `(False, [error_str])` instead of typed errors → `Result<MigrationOutcome, MigrationError>`. **[Phase 3]**

### Error handling
- [backend/__main__.py:12](backend/__main__.py), [backend/app.py:228](backend/app.py), [backend/handlers/commands/node_commands.py:756](backend/handlers/commands/node_commands.py), [backend/infra/template_persistence.py:259](backend/infra/template_persistence.py), [backend/infra/velocity.py:41](backend/infra/velocity.py), [backend/infra/markup.py:90](backend/infra/markup.py) — Six bare `except Exception:` sites that swallow or stringify errors → typed module-level error enums; clippy lint forbids `unwrap()` outside tests/main. **[All phases]**
- [backend/infra/persistence.py:267](backend/infra/persistence.py) — Template load errors `print()`ed instead of logged → `tracing::error!` + propagated `LoadError`. **[Phase 3]**
- [backend/api/routes.py:238](backend/api/routes.py) — HTTP 500 used as catch-all (including for validation) → `IntoResponse` impl on typed errors picks 4xx vs 5xx by variant. **[Phase 2]**

### Concurrency / IO
- [backend/api/routes.py:241](backend/api/routes.py) — Shared dicts touched from Flask thread pool + SocketIO threads without locks → tokio `RwLock` with documented invariants. **[Phase 2]**
- [backend/infra/persistence.py:67](backend/infra/persistence.py) — Atomic tempfile-rename used here but not elsewhere → all writes go through a single `atomic_write()` helper in `talus-storage`. **[Phase 1]**

### Persistence
- [backend/infra/persistence.py:49](backend/infra/persistence.py) — Full-document JSON rewrite on every mutation → Automerge document with binary delta append; full snapshot only on compaction. **[Phase 3]**
- [backend/core/node.py](backend/core/node.py) — No `schema_version` field; in-memory and on-disk shapes drift silently → `schema_version` required on every persisted struct; unknown future versions fail-closed with a typed error. **[Phase 1]**
- [backend/infra/migrations.py:60](backend/infra/migrations.py) — Property-id remapping by string match without verifying the source key exists → migrations are total typed functions `vN -> vN+1`; missing fields are explicit. **[Phase 3]**

### Templates / formatting
- [backend/api/text_editor_routes.py:324](backend/api/text_editor_routes.py) — Token formatting conditionally applied based on `token_config` presence → `FormattingConfig` is required, with an explicit `Default` variant. **[Phase 2]**
- See [docs/BACKEND_FORMATTING_ARCHITECTURE.md](docs/BACKEND_FORMATTING_ARCHITECTURE.md) — formatting currently spread across renderer + persistence layer → consolidated into a single `talus-formatting` module that owns the conversion model. **[Phase 2]**

### Build / packaging
- [talus-tally.spec:5](talus-tally.spec) — Hardcoded PyInstaller hidden-imports (watchdog, engineio drivers) → no PyInstaller; native binary, no hidden-import lists. **[Phase 2]**
- [backend/app.py:33](backend/app.py) — `sys.frozen + hasattr(sys, '_MEIPASS')` runtime detection of packaging mode → compile-time `cfg(feature = "...")` flags. **[Phase 2]**
- [backend/app.py:52](backend/app.py) — Multi-candidate asset path resolution → `include_bytes!` / `RUST_EMBED` at build time. **[Phase 2]**
- *Windows cold-start* (root cause of v0.1.11-alpha.2 hotfix) — PyInstaller + Defender 30–90s start → native Rust binary launches in <100ms; hotfix's 120s timeout becomes irrelevant. **[Phase 2]**

### Naming / readability
- [backend/api/routes.py:2144-2290](backend/api/routes.py) — `load_graph_into_session()` is 150+ lines with nested helpers → decomposed into `parse → validate → hydrate → register` free functions, each <50 lines. **[Phase 2]**
- [backend/infra/persistence.py:173,193,287](backend/infra/persistence.py) — `_normalize_property_uuid()` interleaves business logic with `print()` debug → `tracing::trace_span!` instrumentation; logic is straight-line. **[Phase 3]**
- [backend/core/graph.py:51-58](backend/core/graph.py) — `remove_node()` mixes `print()` debug with mutation → tracing span around the operation; the function body is just the mutation. **[Phase 1]**

### Outstanding TODO / HACK / FIXME comments
- [backend/api/text_editor_routes.py:328](backend/api/text_editor_routes.py) — `TODO` on spell-check word validation → tracked, resolved during port (no `TODO` survives the rewrite without an issue link).

---

### How this section is used

- **At the start of each phase**, re-read the items tagged `[Phase N]`.
- **In every PR** that ports a Python module, the description must list which
  inventory items the PR resolves and link to the diff that proves it.
- **At the end of each phase**, items marked done are struck through (not
  deleted — the audit trail matters).
- **New debt found mid-port** is added here with a `[Phase N]` tag, never
  silently absorbed.

---

## 5. Phase plan

The phases are numbered. They must be done in order. Each phase produces a release.

### Phase 0 — Stabilize and prepare (you are here)

**Goal:** Hold v0.1.x stable while preparing for the migration.

**Scope:**
- Ship hotfixes against `0.1.11-alpha.x` as needed.
- Feature-freeze new functionality. New work goes to a `next` branch on the new
  architecture.
- Inventory the public API surface: every HTTP route, every Socket.IO event, every
  payload shape. This becomes the contract Phase 2 must preserve.
- Inventory all runtime invariants: orphan reconciliation rules, mutation policies,
  template version compatibility rules, indicator-set fallbacks, markup rendering
  semantics.
- Inventory all data files in user data directories and document their purpose.
- Document which `parts` of `backend/` are pure logic (portable) vs. infrastructure
  (deletable).

**Deliverables:**
- `docs/architecture/API_SURFACE_INVENTORY.md` — exhaustive contract
- `docs/architecture/DOMAIN_INVARIANTS.md` — every business rule, with the file/line
  enforcing it today
- `docs/architecture/RUST_MIGRATION_PLAN.md` — this document, kept current

**Exit criteria:**
- v0.1.11-alpha.x is stable on all three desktop OSes.
- API surface and domain invariants documents are reviewed and merged.
- No P0/P1 bugs open.

**Rollback:** N/A — this is preparation only.

**Estimated duration:** 2–4 weeks.

---

### Phase 1 — Carve out `talus-core` (Rust, no behavior change)

**Goal:** Create the Rust workspace structure and port pure domain logic, with the
Python backend still serving all requests.

**Scope:**
- Create top-level Cargo workspace:
  ```
  /Cargo.toml
  /crates/
    talus-core/         (lib, no I/O)
    talus-storage/      (trait + in-memory impl, no SQLite yet)
    talus-bin-bench/    (microbenchmark CLI)
  ```
- Port these pure-logic modules from Python to Rust, with byte-for-byte equivalent
  output validated by golden-file tests:
  - Schema validation (`backend/core/schema.py`)
  - Mutation engine — read-only validators only this phase
  - Markup rendering (`backend/core/markup.py`)
  - Indicator catalog
  - Velocity calculations
  - Budget/Gantt computations
  - CSV preview/parse
- Define traits:
  - `ProjectStore` (open, apply mutation, snapshot)
  - `TemplateStore` (load, list, validate)
- The Python backend remains the production server. Rust is built and tested in CI but
  ships nothing to users.
- Cross-language test harness: Python tests dump fixtures (templates, projects,
  expected outputs); Rust runs the same logic over them; outputs are diffed.

**Deliverables:**
- `talus-core` with ≥80% line coverage from ported pytest fixtures
- Golden tests passing on Linux/macOS/Windows in CI
- `docs/architecture/RUST_CORE_API.md` — public Rust API of `talus-core`

**Exit criteria:**
- Every "pure" Python function listed in `DOMAIN_INVARIANTS.md` has a Rust counterpart
  passing identical golden tests.
- CI builds `talus-core` for `x86_64-pc-windows-msvc`, `x86_64-apple-darwin`,
  `aarch64-apple-darwin`, `x86_64-unknown-linux-gnu`, `aarch64-linux-android`,
  `aarch64-apple-ios`. (Mobile targets compile-only this phase; not used yet.)

**Rollback:** Delete `crates/`. No user-visible change.

**Estimated duration:** 6–10 weeks.

---

### Phase 2 — Replace the backend process with Rust

**Goal:** Tauri spawns/embeds the Rust backend instead of Python. User-visible behavior
unchanged.

**Two sub-phases, in order:**

**Phase 2a — Rust as a sidecar binary (low risk)**
- Build `talus-server-bin` (axum + talus-core) that exposes the same HTTP and
  Socket.IO surface as Python. (Use `socketioxide` for Socket.IO compatibility.)
- Tauri's launcher (currently spawns Python) is changed to spawn `talus-server-bin`.
- Frontend is unchanged. Same `127.0.0.1:5000` connection.
- Run the existing Playwright E2E suite against the Rust backend; this is the parity
  gate.
- Storage is **still YAML/JSON** at this point; only the server changes. The Rust
  backend reads/writes the same on-disk format the Python backend did.

**Phase 2b — In-process embedding (eliminates the subprocess)**
- Replace HTTP/Socket.IO with Tauri commands (`#[tauri::command]`) and Tauri events
  for push.
- Frontend gains a thin abstraction layer (`apiClient` already exists) that routes
  calls to either HTTP (legacy) or Tauri IPC (new). Toggle via build flag.
- Once stable on all three OSes, delete the HTTP server from desktop builds. (It
  stays in `talus-server-bin` for the future hosted path.)

**Deliverables:**
- `talus-server-bin` Rust binary, drop-in replacement for `python -m backend`
- `talus-tauri-bridge` crate: Tauri commands wrapping `talus-core`
- Frontend `apiClient` supports both transports

**Exit criteria:**
- Playwright E2E suite passes against Rust backend on all three OSes
- Cold start on Windows: < 2 seconds (vs. 30–90 today)
- Backend memory usage at idle: < 30 MB (vs. 80–150 today)
- All existing `0.1.x` projects open and save without modification
- No Python in the shipped installer

**Rollback:** Keep Python build pipeline alive on a `legacy/python-backend` branch
through this entire phase. If a critical regression appears, ship `0.2.x` from the
legacy branch.

**Estimated duration:** 10–14 weeks.

---

### Phase 3 — SQLite + Automerge for local storage

**Goal:** Replace YAML/JSON file storage with per-project SQLite files containing an
Automerge document.

**Scope:**
- Design the Automerge document shape for a project tree. Critical decisions:
  - How nodes/children are represented (Automerge `Map` vs. `List` for ordered
    children)
  - How property values are typed
  - How template references are baked
- Schema:
  ```
  -- Inside each project's .talus file (a SQLite database)
  CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
  );
  CREATE TABLE automerge_changes (
      change_id BLOB PRIMARY KEY,        -- automerge change hash
      change BLOB NOT NULL,              -- automerge binary delta
      received_at INTEGER NOT NULL
  );
  CREATE TABLE snapshot (
      doc BLOB NOT NULL,                 -- compacted automerge document
      up_to_change_count INTEGER NOT NULL
  );
  ```
- Templates remain YAML on disk for human editing/sharing, but the *active* template
  for a project is **baked into** the project's Automerge document at creation /
  upgrade time. Templates become an interchange format, not a runtime dependency.
- Migration tool: opens any existing v0.1.x JSON project and writes a v0.3 SQLite
  file. Bidirectional for one release; forward-only after.
- Implement compaction: after every N changes, write a snapshot, garbage-collect old
  changes.

**Deliverables:**
- `talus-storage-sqlite` crate implementing `ProjectStore`
- `talus-migrate` CLI for one-shot conversion
- Auto-migration on first open of a legacy project (with backup written next to the
  original file)
- File extension `.talus` registered in OS file associations

**Exit criteria:**
- All v0.1.x project fixtures convert losslessly (round-trip test: convert → open →
  convert back → diff should be semantic no-op)
- Open / save performance benchmarks: open 10,000-node project in < 500ms
- Crash-during-save no longer corrupts projects (test: SIGKILL during save 100×, all
  recoverable)

**Rollback:** Migration writes `.bak` files. Old code path stays available behind a
build flag for one release. If we need to abandon SQLite, the JSON path still works.

**Estimated duration:** 8–12 weeks.

---

### Phase 4 — Tauri mobile (iOS + Android)

**Goal:** Ship the same desktop app on iPhone, iPad, and Android. Local-only, no
network features yet.

**Scope:**
- Build pipeline for `iOS` (`tauri ios build`) and `Android` (`tauri android build`).
- Frontend: responsive design pass on tree view, property panels, dialogs. Touch
  affordances (long-press menus, swipe actions).
- File handling: integrate Tauri mobile file picker. iOS: support iCloud Drive and
  the Files app. Android: scoped storage.
- Built-in templates ship as embedded assets (compiled in via `include_bytes!`),
  copied to writable storage on first launch.
- Apple Developer Program enrollment, App Store Connect setup, Google Play Console
  setup. (Operational, not engineering, but on the critical path.)
- TestFlight / Play Internal Testing distribution before public release.

**Deliverables:**
- iOS app on TestFlight
- Android app on Play Internal Testing
- Updated `docs/MOBILE_BUILD.md` with full provisioning instructions

**Exit criteria:**
- All v0.1.x projects open on mobile
- TestFlight build passes Apple review preflight checks
- One full week of internal dogfooding on mobile without P0 bugs

**Rollback:** Mobile is additive. If it doesn't work, don't release. Desktop unaffected.

**Estimated duration:** 8–12 weeks (engineering) + 4–8 weeks (store onboarding,
parallelizable).

---

### Phase 5 — Hosted backend with single-user accounts

**Goal:** Sign-up, login, project sync between a user's own devices. Still single
writer per project (no real-time multi-user yet).

**Scope:**
- Choose auth provider (recommend WorkOS for B2B path or Clerk for fastest DX).
  Decision must be made and documented before implementation.
- Stand up production infrastructure:
  - Postgres (managed: Neon, Supabase, RDS, or Fly.io)
  - Object storage (R2, S3, or B2)
  - Application hosting (Fly.io, Railway, Render, or self-managed Kubernetes)
- Postgres schema (initial):
  ```
  users, organizations, org_members,
  projects (metadata only),
  project_changes (Automerge deltas),
  project_snapshots,
  audit_events
  ```
- `talus-server-bin` grows:
  - JWT validation against auth provider's JWKS
  - WebSocket endpoint for sync (Automerge change exchange)
  - REST endpoints for project list, create, delete
- Desktop/mobile clients gain "Sign in" UI and "Sync to cloud" project setting.
- Local-first behavior preserved: works fully offline, syncs when reconnected.
- Conflict-free single-user multi-device: edit on phone offline, on laptop online,
  reconnect phone, both converge.

**Deliverables:**
- Production hosted instance at `app.talustally.com` (or chosen domain)
- Account sign-up, email verification, password reset (handled by auth provider)
- Sync engine in `talus-server-bin` and `talus-core`
- Backups: nightly Postgres dump, continuous WAL archive to S3
- Status page, basic uptime monitoring

**Exit criteria:**
- A user can sign up, create a project on their laptop, edit it on their phone
  offline, reconnect, see all edits converge
- Load test: 1000 concurrent connected clients, sustained 100 ops/sec, p99 latency
  < 200ms
- Disaster recovery drill: restore a project from backup successfully
- Security review (external if budget allows): no unaddressed P1 findings

**Rollback:** Hosted is opt-in. Local-only mode remains the default and works
without the server. If the server is broken, only sync features are degraded;
editing continues.

**Estimated duration:** 12–18 weeks. **This is the biggest single phase.**

---

### Phase 6 — Project-level sharing (multi-user, real-time)

**Goal:** A project owner can invite collaborators with viewer/commenter/editor/admin
roles. Real-time editing across collaborators.

**Scope:**
- Permissions model — *project-scope only*, no subtree permissions:
  - Roles: `owner`, `admin`, `editor`, `commenter`, `viewer`
  - `access_grants` table with `(user_id, project_id, role)`; `node_id` column
    exists but is always NULL in this phase
- Sync server enforces permissions per delta:
  - Editors+ can write; commenters can only emit comment changes; viewers receive
    deltas but cannot send any
  - All inbound deltas validated against current ACLs at receipt time
- Presence channel (separate from CRDT): show avatars of who's currently viewing,
  cursor positions if applicable
- Comments as a first-class concept (probably their own Automerge sub-document or
  separate table — decide during design)
- Sharing UI: invite by email, manage roles, revoke access
- Email infrastructure: invitations, notifications (use Postmark, Resend, or SES)

**Deliverables:**
- Sharing UI in desktop, mobile, and web (if web is in scope by then)
- Comments feature
- Email transactional pipeline

**Exit criteria:**
- Two users can edit the same project simultaneously without lost edits
- Permission denial is correctly enforced server-side (verified with adversarial
  client)
- Audit events recorded for all permission changes

**Rollback:** Sharing is per-project opt-in. Default new projects to private.

**Estimated duration:** 10–14 weeks.

---

### Phase 7 — Versioned templates and template governance

**Goal:** Templates are versioned. Each template has a single admin. Projects pin a
template version and explicitly upgrade.

**Scope:**
- New tables: `templates` (with `admin_user_id`), `template_versions`
- Template editor moved to admin-only; non-admins see read-only
- Project setting: "Template version" with explicit upgrade flow
- Migration logic per template version (handle property renames, type changes, etc.)
  — replaces the current ad-hoc reconciliation engine
- Template marketplace / sharing UI (browsing org-shared templates, optional public
  templates)

**Deliverables:**
- Template versioning in DB and in `talus-core` (templates baked into projects
  reference a specific version)
- Migration framework: each version transition is a typed, tested function
- Template admin UI

**Exit criteria:**
- A template admin can publish v2 of a template; existing projects on v1 keep
  working; project owners explicitly upgrade
- Upgrade applies migrations correctly (round-trip tests for each migration)
- Single-admin invariant enforced (no two users can edit the same template
  simultaneously)

**Rollback:** Template versioning is purely additive on the server. Older clients
continue to work against the latest version they know about.

**Estimated duration:** 6–10 weeks.

---

### Phase 8 — Subtree permissions, SSO, audit, hardening (optional / on-demand)

**Goal:** Enterprise-readiness features. **Build only what customers actually ask for.**

**Possible scope (pick based on demand):**
- Subtree permissions (`access_grants.node_id` populated)
  - Document partitioning so users only receive deltas for branches they can read
  - **Warning: this is the most complex feature in the plan.** Defer indefinitely if
    project-level sharing satisfies users.
- SAML / SSO (likely WorkOS handles this)
- SCIM provisioning
- Audit log UI and export
- Data residency options (EU instance)
- Penetration test
- SOC 2 Type II prep

**Exit criteria:** Driven by specific customer commitments, not internal roadmap.

**Estimated duration:** Indefinite. Each sub-feature is its own mini-project.

---

## 6. Cross-cutting concerns

### 6.1 Testing strategy

| Layer | Tool | Owner phase |
|---|---|---|
| Rust unit tests | `cargo test` | All |
| Rust integration tests | `cargo test` + testcontainers (Postgres) | 5+ |
| Rust property tests | `proptest` | 1+ (especially CRDT logic) |
| Cross-language parity tests | Custom harness, golden files | 1, 2 |
| Frontend unit tests | Vitest | All |
| End-to-end tests | Playwright | All (gate for every phase) |
| Mobile tests | Detox or Maestro | 4+ |
| Load tests | `k6` or `wrk` | 5+ |
| Chaos / fuzz | `cargo-fuzz`, network partition tests | 5+ |

**Rule:** No phase ships unless its full test pyramid is green.

### 6.2 Observability

Build in from Phase 2:
- `tracing` crate everywhere; structured logs with span context
- OpenTelemetry export (OTLP), wired to whichever backend (Honeycomb, Datadog,
  Tempo, Grafana Cloud)
- Metrics: Prometheus exposition from `talus-server-bin`
- Sentry (or equivalent) for client and server error reporting

### 6.3 Performance budgets

Each phase commits to specific budgets. If a phase regresses these, it does not ship.

| Metric | Today | Phase 2 target | Phase 3 target | Phase 5 target |
|---|---|---|---|---|
| Cold start (Win) | 30–90s | < 2s | < 2s | < 3s (incl. sync handshake) |
| Cold start (Linux) | 1–2s | < 200ms | < 200ms | < 500ms |
| Memory at idle | 80–150MB | < 30MB | < 50MB | < 100MB |
| Open 10k-node project | ~2s | ~1s | < 500ms | < 500ms |
| Save mutation latency | 50–200ms | < 20ms | < 5ms (local) | < 100ms (synced) |

### 6.4 Security

- TLS everywhere (Let's Encrypt or provider-managed)
- All secrets in environment variables, never in config files
- Auth provider handles password storage, MFA, session management
- Server enforces all permissions; never trust client claims
- Dependency audits: `cargo audit` and `npm audit` in CI on every PR
- Threat model document drafted before Phase 5 ships

### 6.5 Documentation

Each phase produces or updates:
- Architecture doc (this file's section for that phase)
- API contract doc (current state)
- Migration runbook (how a user upgrades)
- Operations runbook (Phase 5+)

---

## 7. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Rust port introduces subtle behavior differences** | High | High | Cross-language golden tests; maintain Python backend as oracle through Phase 2 |
| **Automerge document shape locks us in** | Medium | High | Spend Phase 3 design heavily on this; build round-trip tests; version the doc shape |
| **Mobile UX requires major frontend rewrite** | Medium | Medium | Allocate explicit mobile UX phase; consider mobile-specific React routes |
| **Apple/Google review delays mobile launch** | Medium | Medium | Start store onboarding in parallel with Phase 4 engineering |
| **Subtree permissions become a quagmire** | High | High | Defer indefinitely; ship project-level only; force customers to make a real case for subtree before building |
| **Auth provider lock-in** | Low | Medium | Wrap auth provider behind an internal trait; can swap if needed |
| **CRDT change log grows unbounded** | High | Medium | Mandatory snapshot/compaction in Phase 3; tested with synthetic 10k-change projects |
| **Hosted infra ops burden** | High | High | Choose managed everything (Fly.io, Neon, Clerk); resist self-hosting until scale justifies it |
| **Migration takes longer than 18 months** | Medium | Medium | Per-phase exit criteria; willingness to ship "good enough" at any phase boundary |
| **Existing users abandon during long migration** | Medium | High | Keep v0.1.x stable and supported throughout; ship value incrementally |

---

## 8. Decision log (to be maintained)

This section records architectural decisions made during the migration. Each entry
is dated, attributed, and tagged with the phase that produced it.

> **Format:** `YYYY-MM-DD | Phase N | Decision | Rationale`

- *2026-05-06 | Phase 0 | Adopt this migration plan as the canonical roadmap | Aligns
  desktop, mobile, and hosted around a single Rust core; resolves recurring
  Windows/Python packaging issues; unblocks mobile and real-time collaboration*

---

## 9. Out of scope

The following are **explicitly out of scope** for this migration. They may become
projects of their own later, but they will not be wedged into a phase.

- Replacing React with another frontend framework
- Replacing Tauri with Electron, Wails, or native shells
- Building a public API for third-party integrations (consider after 1.0)
- Plugin / extension system
- AI features
- Self-hosted enterprise distribution
- Replacing Postgres with a different RDBMS
- Building our own auth system
- Real-time voice/video collaboration

---

## 10. How to use this document

- **Engineers:** Read the relevant phase section before starting work. Update the
  decision log when you make a significant architectural choice.
- **Reviewers:** Use the exit criteria as a checklist when approving phase-completion
  PRs.
- **Stakeholders:** Read sections 1, 3, 5 (phase summaries), and 7 (risks).
- **Future you:** When the plan diverges from reality, update this document. A wrong
  plan is worse than no plan; an unmaintained plan becomes wrong quickly.

This document is **not** a contract or a commitment to specific dates. It is a
shared model of how we intend to evolve the system. Reality will modify it. Modify it
back.
