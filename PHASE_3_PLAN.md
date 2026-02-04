# Phase 3: Frontend Development

**Status:** 🚀 Phase 3.2 Complete - Component Extraction Done  
**Start Date:** January 28, 2026  
**Goal:** Build React-based web frontend using Qt UI design as reference

---

## Overview

Phase 3 focuses on building a modern web-based frontend that:
1. Uses the **Bronco II restomod theme** from the Qt UI (Matte Black & Ford Molten Orange)
2. Integrates with the **production-ready backend API** (Phase 1-2.5 complete)
3. Provides **real-time updates** via WebSocket
4. Matches the **layout and UX** of the Qt reference UI

---

## Design Reference

The Qt UI provides our **design system baseline**:
- **Colors**: Extracted to [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)
- **Typography**: Michroma (display) + Segoe UI (body)
- **Layout**: Custom title bar, sidebar tree, property inspector
- **Components**: Buttons, inputs, menus, tree view

See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for complete specifications.

---

## Technology Stack

### Frontend Framework
**React 18+ with Vite**

**Why React:**
- Excellent ecosystem for real-time apps
- Strong TypeScript support
- Large component libraries
- Well-documented WebSocket integration
- Specified in Master Plan

**Why Vite:**
- Lightning-fast dev server
- Hot Module Replacement (HMR)
- Optimized production builds
- Native ES modules support

### Styling
**Tailwind CSS**

**Why Tailwind:**
- Rapid UI development
- Design system via config
- Minimal bundle size (purges unused styles)
- Great dark mode support
- Responsive utilities

### State Management
**Zustand**

**Why Zustand:**
- Lightweight (1kb)
- Simple API
- No boilerplate
- Perfect for session/graph state
- React hooks-based

### API Integration
**Built-in fetch + Socket.IO Client**

**Why:**
- No need for heavy libraries (Axios, React Query)
- Socket.IO client already documented in INTEGRATION_GUIDE.md
- Custom hooks abstract complexity

### UI Components
**Headless UI + Custom Components**

**Why:**
- Accessible components out of the box
- Unstyled (full control for theming)
- Works great with Tailwind
- TreeView custom-built to match Qt UI

---

## Project Structure

```
frontend/
├── public/
│   └── assets/
│       ├── fonts/
│       │   └── Michroma-Regular.ttf
│       └── icons/
│           └── (lucide icons or custom)
├── src/
│   ├── api/
│   │   ├── client.ts           # REST API client
│   │   ├── websocket.ts        # Socket.IO client
│   │   └── types.ts            # API types
│   ├── components/
│   │   ├── layout/
│   │   │   ├── TitleBar.tsx
│   │   │   ├── MenuBar.tsx
│   │   │   ├── Toolbar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── DockPanel.tsx
│   │   ├── tree/
│   │   │   ├── TreeView.tsx
│   │   │   ├── TreeItem.tsx
│   │   │   └── TreeIcon.tsx
│   │   ├── inspector/
│   │   │   ├── PropertyInspector.tsx
│   │   │   ├── PropertyField.tsx
│   │   │   └── PropertyGroup.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Select.tsx
│   │       ├── Menu.tsx
│   │       └── Modal.tsx
│   ├── hooks/
│   │   ├── useSession.ts       # Session management
│   │   ├── useWebSocket.ts     # WebSocket connection
│   │   ├── useGraph.ts         # Graph state
│   │   ├── useCommands.ts      # Command execution
│   │   └── useTemplate.ts      # Template schema
│   ├── store/
│   │   ├── sessionStore.ts     # Session state
│   │   ├── graphStore.ts       # Graph state
│   │   └── uiStore.ts          # UI state (sidebar, inspector)
│   ├── types/
│   │   ├── graph.ts            # Graph/Node types
│   │   ├── command.ts          # Command types
│   │   └── template.ts         # Template types
│   ├── utils/
│   │   ├── colors.ts           # Theme color helpers
│   │   └── validators.ts       # Input validation
│   ├── App.tsx                 # Main app component
│   ├── main.tsx                # Entry point
│   └── index.css               # Global styles + Tailwind
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Phase 3 Roadmap

### 3.1: Project Setup 🚧 (In Progress)

**Goal:** Bootstrap React + Vite project with design system

**Tasks:**
- [x] Create Vite + React + TypeScript project
- [ ] Install dependencies (Tailwind, Socket.IO client, Zustand, Headless UI)
- [ ] Configure Tailwind with design system tokens
- [ ] Add Michroma font
- [ ] Create CSS variables from DESIGN_SYSTEM.md
- [ ] Set up ESLint + Prettier
- [ ] Create basic layout shell

**Deliverables:**
- Running dev server
- Tailwind configured with Bronco theme
- Empty layout components

**Estimated Time:** 2-4 hours

---

### 3.2: Core Layout Components

**Goal:** Build main layout matching Qt UI

**Tasks:**
- [ ] TitleBar component (custom, draggable)
- [ ] MenuBar component (File, Edit, View, Tools, Help)
- [ ] Toolbar component (New, Save, Undo, Redo buttons)
- [ ] Main layout grid (sidebar + content + inspector)
- [ ] Responsive breakpoints

**Deliverables:**
- Complete layout shell
- All major UI areas defined
- Window controls functional

**Estimated Time:** 6-8 hours

---

### 3.3: Design System Components

**Goal:** Build reusable UI components

**Tasks:**
- [ ] Button component (default, primary, danger variants)
- [ ] Input component (text, number)
- [ ] Select/ComboBox component
- [ ] Menu/Dropdown component
- [ ] Modal/Dialog component
- [ ] Storybook setup (optional)

**Deliverables:**
- Complete component library
- Consistent styling
- TypeScript types for all props

**Estimated Time:** 8-10 hours

---

### 3.4: TreeView Component

**Goal:** Build hierarchical tree view for project graph

**Tasks:**
- [ ] TreeView container component
- [ ] TreeItem component (expandable, selectable)
- [ ] TreeIcon component (node type icons)
- [ ] Expand/collapse animation
- [ ] Selection state
- [ ] Keyboard navigation (arrow keys, Enter)
- [ ] Context menu (right-click)

**Deliverables:**
- Fully functional tree view
- Matches Qt UI styling
- Keyboard accessible

**Estimated Time:** 10-12 hours

---

### 3.5: API Integration (REST)

**Goal:** Connect to backend REST API

**Tasks:**
- [ ] Create API client module
- [ ] Session management (create, list, cleanup)
- [ ] Project creation (from template)
- [ ] Command execution (CreateNode, UpdateProperty, DeleteNode)
- [ ] Undo/Redo
- [ ] Template schema fetching
- [ ] Error handling
- [ ] TypeScript types for all API responses

**Deliverables:**
- Complete REST API integration
- Custom React hooks (useSession, useCommands)
- Error boundary component

**Estimated Time:** 8-10 hours

---

### 3.6: WebSocket Integration

**Goal:** Real-time updates via Socket.IO

**Tasks:**
- [ ] WebSocket client setup
- [ ] useWebSocket hook
- [ ] Event handlers (node-created, property-changed, etc.)
- [ ] Reconnection logic
- [ ] Connection status indicator
- [ ] Optimistic updates
- [ ] Event synchronization with graph state

**Deliverables:**
- Real-time graph updates
- Multi-client support
- Connection resilience

**Estimated Time:** 8-10 hours

---

### 3.7: Graph State Management

**Goal:** Manage project graph state with Zustand

**Tasks:**
- [ ] Create graphStore (Zustand)
- [ ] Load graph from API
- [ ] Update graph from WebSocket events
- [ ] Local graph mutations (optimistic updates)
- [ ] Undo/redo stack visualization
- [ ] Node selection state
- [ ] Graph serialization for save/load

**Deliverables:**
- Centralized graph state
- Reactive UI updates
- Persistence ready

**Estimated Time:** 6-8 hours

---

### 3.8: Property Inspector

**Goal:** Edit node properties in right/bottom panel

**Tasks:**
- [ ] PropertyInspector container
- [ ] PropertyField component (dynamic based on type)
- [ ] Property groups/sections
- [ ] Select fields with indicators
- [ ] Text/number inputs
- [ ] Validation
- [ ] Save on blur/change
- [ ] Real-time updates from other clients

**Deliverables:**
- Fully functional property editor
- Dynamic form generation from schema
- Indicator support

**Estimated Time:** 10-12 hours

---

### 3.9: Menu & Toolbar Actions

**Goal:** Implement all menu and toolbar actions

**Tasks:**
- [ ] File menu (New, Save, Export)
- [ ] Edit menu (Undo, Redo, Cut, Copy, Paste)
- [ ] View menu (Toggle panels, zoom)
- [ ] Tools menu (Cleanup sessions)
- [ ] Help menu (About, documentation links)
- [ ] Toolbar shortcuts
- [ ] Keyboard shortcuts (Ctrl+Z, Ctrl+Y, etc.)

**Deliverables:**
- Complete menu system
- Keyboard shortcuts
- Action integration

**Estimated Time:** 6-8 hours

---

### 3.10: Testing & Polish

**Goal:** Test, refine, and optimize

**Tasks:**
- [ ] Component unit tests (Vitest)
- [ ] Integration tests
- [ ] E2E tests (Playwright)
- [ ] Performance optimization
- [ ] Accessibility audit (WAVE, axe)
- [ ] Cross-browser testing
- [ ] Mobile responsiveness
- [ ] Loading states
- [ ] Error states
- [ ] Empty states

**Deliverables:**
- Test coverage >80%
- Accessible UI
- Polished UX

**Estimated Time:** 12-16 hours

---

## Total Estimated Time

**76-96 hours** (approximately 10-12 full workdays or 2-3 weeks part-time)

---

## Success Criteria

Phase 3 is complete when:

- [ ] Web UI matches Qt UI design (colors, layout, typography)
- [ ] All REST endpoints integrated
- [ ] WebSocket real-time updates working
- [ ] Tree view displays project graph
- [ ] Property inspector edits node properties
- [ ] Undo/redo functional
- [ ] Multi-client support (WebSocket rooms)
- [ ] Keyboard navigation works
- [ ] Accessible (WCAG AA)
- [ ] Responsive (desktop + tablet)
- [ ] Test coverage >80%
- [ ] Production build optimized

---

## Current Status

### Completed
- ✅ Backend API (87/90 tests, 96.7%)
- ✅ WebSocket protocol (14+ events)
- ✅ Complete API documentation
- ✅ Design system extracted from Qt UI

### In Progress
- 🚧 Phase 3.1: Project setup (Tailwind + layout shell underway)

### Pending
- ⏳ All other Phase 3 tasks

---

## Next Steps

### Immediate (Today)

1. **Create Vite + React project:**
```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install
```

2. **Install dependencies:**
```bash
npm install -D tailwindcss postcss autoprefixer
npm install socket.io-client zustand @headlessui/react lucide-react
npx tailwindcss init -p
```

3. **Configure Tailwind** with design system colors

4. **Add Michroma font** to public/assets/fonts

5. **Create basic layout shell**

---

## Design Resources

- **Design System:** [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)
- **Color Palette:** Matte Black (#121212, #1e1e1e) + Ford Molten Orange (#D94E1F)
- **Typography:** Michroma (display) + Segoe UI (body)
- **Qt Reference:** `backend/ui/qt/` (colors, layout, components)

---

## API Resources

- **API Contract:** [API_CONTRACT.md](API_CONTRACT.md)
- **WebSocket Protocol:** [WEBSOCKET_PROTOCOL.md](WEBSOCKET_PROTOCOL.md)
- **Integration Guide:** [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)
- **Backend URL:** `http://localhost:5000/api/v1`

---

## Questions to Resolve

- [ ] Do we need authentication? (Not in current API)
- [ ] Project persistence? (Currently in-memory only)
- [ ] File upload for custom templates?
- [ ] Export formats (JSON, PDF)?
- [ ] Offline support?

---

**Phase 3 Status:** 🚀 **In Progress**  
**Next Task:** Finish Tailwind setup and component scaffolding  
**Design System:** ✅ Complete  
**Backend API:** ✅ Production Ready  
**Documentation:** ✅ Complete

Let's build! 🏗️
