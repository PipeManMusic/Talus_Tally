# Frontend Quick Start Guide

## Current State

The Talus Tally frontend is **Phase 3.2 Complete**:
- ✅ React 18 + TypeScript + Vite
- ✅ 8 components built and tested
- ✅ Full API client ready
- ✅ Custom hooks for data management
- ✅ Dev server running at http://localhost:5173
- ✅ Hot Module Replacement enabled

## Getting Started

### Prerequisites
```bash
# Already installed:
- Node.js v20.19.4
- npm v9.2.0
- Vite v5.4.11
- React 18
- Tailwind CSS v3.4.17
```

### Start Development

```bash
cd frontend
npm run dev
```

The app will open at http://localhost:5173 with hot reload enabled.

## File Structure

```
frontend/src/
├── components/          # React components
│   ├── layout/         # Page layout (TitleBar, MenuBar, etc)
│   ├── ui/             # Reusable UI (Button, Input, Select)
│   └── index.ts        # Barrel export
├── api/
│   └── client.ts       # API client + WebSocket
├── hooks/              # Custom React hooks
│   ├── useSession.ts   # Session management
│   ├── useNodes.ts     # Node CRUD
│   ├── useWebSocket.ts # Real-time events
│   └── index.ts
├── App.tsx             # Main app component
├── main.tsx            # Entry point
├── App.css
└── index.css           # Global styles + Tailwind
```

## Common Tasks

### Add a New Component

1. Create file in `src/components/ui/` or `src/components/layout/`
2. Export from `src/components/index.ts`
3. Use in App.tsx or other components

```tsx
// src/components/ui/MyComponent.tsx
export function MyComponent() {
  return <div>...</div>;
}

// src/components/index.ts
export { MyComponent } from './ui/MyComponent';

// App.tsx
import { MyComponent } from '@/components';
```

### Use a Hook

```tsx
import { useSession, useNodes, useWebSocket } from '@/hooks';

function MyComponent() {
  const { session, createSession } = useSession();
  const { nodes, createNode } = useNodes();
  const { connected } = useWebSocket({
    onNodeCreated: (data) => console.log('New node:', data),
  });

  return (
    <div>
      Session: {session?.id}
      Connected: {connected ? '✓' : '✗'}
    </div>
  );
}
```

### Style with Tailwind

All theme colors available:

```tsx
<div className="bg-bg-dark text-fg-primary border border-border rounded-sm">
  <p className="text-accent-primary font-display">Title</p>
  <p className="text-fg-secondary font-body">Description</p>
  <button className="bg-accent-primary hover:bg-accent-hover">
    Click me
  </button>
</div>
```

### Make an API Call

```tsx
import { useNodes } from '@/hooks';

function CreateNode() {
  const { createNode, loading, error } = useNodes();

  const handleCreate = async () => {
    try {
      const node = await createNode({
        type: 'job',
        properties: { title: 'New Job' },
      });
      console.log('Created:', node);
    } catch (err) {
      console.error('Error:', error);
    }
  };

  return (
    <button onClick={handleCreate} disabled={loading}>
      {loading ? 'Creating...' : 'Create Node'}
    </button>
  );
}
```

### Handle WebSocket Events

```tsx
import { useWebSocket } from '@/hooks';

function RealTimeMonitor() {
  const { connected, emit } = useWebSocket({
    onConnect: () => console.log('Connected'),
    onNodeCreated: (data) => console.log('Node created:', data),
    onNodeUpdated: (data) => console.log('Node updated:', data),
    onNodeDeleted: (data) => console.log('Node deleted:', data),
  });

  return (
    <div>
      {connected ? 'Live 🟢' : 'Offline 🔴'}
      <button onClick={() => emit('ping')}>Send Ping</button>
    </div>
  );
}
```

## Available Scripts

```bash
# Development
npm run dev          # Start dev server

# Build
npm run build        # Build for production
npm run preview      # Preview production build

# Quality
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
npm run test -- csvPreview   # Run CSV import utility tests

# Type checking
npx tsc --noEmit     # Check TypeScript
```

## Backend Integration

The frontend is configured to connect to:
- **API**: http://localhost:5000 (configurable via VITE_API_URL)
- **WebSocket**: http://localhost:5000 (configurable via VITE_SOCKET_URL)

### Available API Endpoints

```typescript
// Sessions
POST   /api/v1/sessions              // Create session
GET    /api/v1/sessions/{id}         // Get session

// Nodes
POST   /api/v1/nodes                 // Create node
PATCH  /api/v1/nodes/{id}            // Update node
DELETE /api/v1/nodes/{id}            // Delete node
GET    /api/v1/nodes/{id}            // Get node

// Graphs
GET    /api/v1/graphs/{id}           // Get graph
PUT    /api/v1/graphs/{id}           // Save graph
```

### WebSocket Events

```typescript
// Listen for (in hooks)
'node:created'  // New node created
'node:updated'  // Node properties changed
'node:deleted'  // Node removed

// Emit to
emit('broadcast', { message: 'text' })
```

## Theme Colors

All colors from Bronco II restomod theme:

```tsx
// Backgrounds
bg-bg-dark          // #121212 (primary dark)
bg-bg-light         // #2a2a2a (secondary dark)
bg-bg-selection     // #3a3a3a (hover state)

// Text
text-fg-primary     // #f5f5f5 (main text)
text-fg-secondary   // #b0b0b0 (secondary text)
text-fg-disabled    // #696969 (disabled text)

// Accent (Ford Molten Orange)
text-accent-primary // #D94E1F
text-accent-hover   // #ff5722

// Status
text-status-success // #4caf50
text-status-warning // #ff9800
text-status-danger  // #f44336

// Borders & UI
border-border       // #3a3a3a
```

## Component API Reference

### Button
```tsx
<Button 
  variant="primary"      // 'default' | 'primary' | 'danger'
  size="md"              // 'sm' | 'md' | 'lg'
  onClick={() => {}}
  disabled={false}
>
  Click me
</Button>
```

### Import Nodes via CSV

1. Ensure a session and template are loaded (open or create a project).
2. In the app, choose **Tools → Import from CSV...** to open the wizard.
3. Pick the parent node where new children should be created; the allowed node types list filters automatically.
4. Choose the child node type to create. Use **Download template CSV** to export a file with property IDs as headers (plus sample values) tailored to that blueprint—ideal for building spreadsheets before import. On desktop (Tauri) you will be prompted for a save location; in the browser it downloads directly.
5. Upload a UTF-8 CSV (BOM supported), review the preview grid, and map headers to blueprint properties. Required fields (including `name`) must be mapped.
6. Submit the import; successful rows create nodes immediately, and any validation issues surface in the dialog for correction.

The wizard calls the `/api/v1/imports/csv` endpoint, which validates bindings and reports row-level errors. Successful imports refresh the graph, expand the parent node, and focus the first created child.

### Input
```tsx
<Input
  label="Name"
  value={value}
  onChange={(e) => setValue(e.target.value)}
  error={errorMessage}
  required
  type="text"
/>
```

### Select
```tsx
<Select
  label="Status"
  value={value}
  onChange={(e) => setValue(e.target.value)}
  options={[
    { value: 'a', label: 'Option A' },
    { value: 'b', label: 'Option B' },
  ]}
/>
```

### Sidebar
```tsx
<Sidebar
  nodes={treeNodes}
  onSelectNode={(id) => {}}
  onExpandNode={(id) => {}}
/>
```

## Debugging

### Check HMR Status
Look at terminal output when you save a file:
```
[vite] hmr update /src/components/MyComponent.tsx
```

### Check Type Errors
```bash
npx tsc --noEmit
```

### Check Build Warnings
```bash
npm run build
```

### View Component State
Use React DevTools browser extension to inspect component props and state.

## Common Errors

### "Cannot find module @/components"
- Make sure vite.config.ts has the alias configured
- Check that components/index.ts exists and exports the component

### "Session is not defined"
- Use `import type { Session }` for type-only imports
- Or use hooks which handle this automatically

### WebSocket not connecting
- Ensure backend is running on http://localhost:5000
- Check VITE_SOCKET_URL environment variable
- Look for CORS errors in browser console

### Tailwind classes not applying
- Check that tailwind.config.js includes the file path
- Make sure index.css has @tailwind directives
- Restart dev server if theme was changed

## Performance Tips

1. **Use React.memo** for expensive components
   ```tsx
   export const MyComponent = React.memo(function MyComponent(props) { ... })
   ```

2. **Use useCallback** in hooks to prevent recreations
   ```tsx
   const handleClick = useCallback(() => { ... }, [dependencies])
   ```

3. **Lazy load heavy components**
   ```tsx
   const HeavyComponent = lazy(() => import('./HeavyComponent'));
   ```

4. **Use index keys carefully** in lists
   ```tsx
   // Bad
   items.map((item, i) => <Item key={i} />)
   // Good
   items.map(item => <Item key={item.id} />)
   ```

## Resources

- [React Docs](https://react.dev)
- [TypeScript Docs](https://www.typescriptlang.org/docs)
- [Tailwind Docs](https://tailwindcss.com/docs)
- [Vite Docs](https://vitejs.dev)
- [Socket.IO Docs](https://socket.io/docs)
- [Zustand Docs](https://github.com/pmndrs/zustand)

## Next Phase (3.3)

Ready to start Phase 3.3 (UI Component Expansion)?

**To begin:**
1. Create advanced UI components (Modal, Tooltip, etc.)
2. Add form validation (Zod integration)
3. Set up global state (Zustand)
4. Integrate graph library (react-flow)

See `PHASE_3_MASTER_CHECKLIST.md` for full roadmap.

---

**Happy coding!** 🚀

For questions or issues, refer to the component library documentation in `docs/COMPONENT_LIBRARY_GUIDE.md`.
