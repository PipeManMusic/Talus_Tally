# Talus Tally: Implementation Roadmap (Cleaned Up)

**Current Status:** Phase 7 (Desktop App Setup) - Ready to start

---

## Completed Phases ✅

### Phase 1-5: Backend Foundation (COMPLETE)
- ✅ Data definitions (YAML templates)
- ✅ Core Python (Node, Graph, Commands)
- ✅ Infrastructure (Schema loader, Persistence, Velocity, Reporting)
- ✅ Business Logic (Command system, Undo/Redo)
- ✅ REST API (Flask endpoints, SocketIO events)

### Phase 6: React Frontend Core Components (IN PROGRESS)
- ✅ API Client (connects to backend, endpoint routing fixed)
- ✅ State Management (Zustand store)
- Basic Tree View component (needs refinement)
- Basic Inspector component (needs backend connection)
- Menu/Toolbar (needs implementation)

**Note:** Components work, but UI is untested in actual desktop environment.

---

## Current Work Stream

### Phase 7: Quick Desktop App (NEXT - ~2 hours)
**Goal:** Get a working desktop app so you can test/refine UI in real environment.

**Flow:**
1. Install Rust toolchain
2. Add Tauri to frontend project
3. Create Python subprocess launcher (Rust)
4. Configure desktop window
5. Test: `npm run desktop:dev` launches app with hot-reload

**Result:** Native window that auto-starts backend, hot-reload when you save code

**Time estimate:** ~2 hours (first time includes Rust compilation)

---

### Phase 8: UI Refinement (PARALLEL with Phase 7)
**Goal:** Iterate on UI using actual desktop app until workflow feels right

**Activities:**
- Tree node selection/navigation (arrow keys, click)
- Property editing (click field, Tab to next, Escape to cancel)
- Keyboard shortcuts (Ctrl+N new, Ctrl+Z undo, etc.)
- Menu items (New, Open, Save)
- Visual polish (colors, spacing, feedback)

**Workflow:**
- Keep `npm run desktop:dev` running
- Edit code → See changes immediately (hot-reload)
- Test in desktop window (not browser)
- Iterate until satisfied

**Time estimate:** Variable (your feedback loop)

**No formal tests during this phase** - Just you using it and saying "that's not right, make it do X instead"

---

### Phase 9: Production Desktop Build (AFTER Phase 8)
**Goal:** Package as distributable app (Windows/Mac/Linux installers)

**Activities:**
- Freeze Python backend with PyInstaller
- Create production Tauri build config
- Set up GitHub Actions CI/CD (auto-build all platforms)
- Create installers (.deb, .dmg, .exe)
- Test installation on fresh OS (no dev dependencies)

**Time estimate:** ~3-4 hours (most spent on CI/CD)

---

## The Simple Version

```
TODAY:
  [ ] Phase 7: Setup Rust, add Tauri, test desktop app works
  [ ] Phase 7: Documentation (quick start)

THEN (iteratively):
  [ ] Phase 8: Use `npm run desktop:dev`, refine UI until happy
      - You drive all decisions: "make this button bigger", "change this color", etc.

WHEN SATISFIED:
  [ ] Phase 9: Build production packages (Windows/Mac/Linux)
      - Automated once configured
```

---

## What We WON'T Do (For Now)

- Mobile app (Phase 9.5, much later, needs different approach)
- Web version (no browser, desktop only)
- Collaborative editing (future)
- Complex animations (focus on functional)

---

## Success Criteria

**Phase 7 Done:** 
- Type `npm run desktop:dev` and get native app window
- Window shows tree view and inspector
- Backend API calls work
- Ctrl+Shift+I opens dev tools
- Close app → backend shuts down

**Phase 8 Done:**
- Tree navigation works with keyboard
- Can create/edit/delete nodes
- Inspector edits save properties
- All menu items wired up
- You say "this feels right"

**Phase 9 Done:**
- Single installer per platform
- Double-click to install
- Single-click to launch
- App has no external dependencies

---

## Starting Now: Phase 7 Step-by-Step

### 7.1: Verify Rust Installed
```bash
rustc --version
cargo --version
```
If not installed: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

### 7.2: Install Tauri
```bash
cd frontend
npm install @tauri-apps/cli @tauri-apps/api
```

### 7.3: Initialize Tauri
```bash
npm run tauri init
# Answer prompts (defaults fine):
# - Project name: talus-tally
# - Package name: com.ttalus.talus-tally
```

### 7.4: Create Backend Launcher (Rust)
Will provide sample `frontend/src-tauri/src/main.rs` that spawns Python backend

### 7.5: Update Frontend Config
Will provide updated `tauri.conf.json` and `package.json` scripts

### 7.6: Test It
```bash
npm run desktop:dev
```

Expected: Native window opens with app, backend running, hot-reload works

---

## Next Actions (In Order)

1. **Run Phase 7 step 7.1-7.3** (verify Rust, install Tauri, init)
2. **I'll provide sample Rust code** (backend launcher)
3. **You run 7.6** (test desktop:dev)
4. **Immediately move to Phase 8** (user testing & refinement with actual app)

Ready to start?
