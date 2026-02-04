# Component Library Quick Reference

## Layout Components

### TitleBar
Window title bar with minimize/maximize/close buttons.

```tsx
import { TitleBar } from '@/components';

<TitleBar 
  title="TALUS TALLY"
  onMinimize={() => console.log('minimize')}
  onMaximize={() => console.log('maximize')}
  onClose={() => console.log('close')}
/>
```

### MenuBar
Dropdown menu bar with configurable menus.

```tsx
import { MenuBar } from '@/components';

const menus = {
  File: [
    { label: 'New', onClick: () => {} },
    { label: 'Open', onClick: () => {} },
  ],
};

<MenuBar menus={menus} />
```

### Toolbar
Action buttons with separators.

```tsx
import { Toolbar } from '@/components';

<Toolbar />  // Uses default buttons (New, Save, Undo, Redo)

// Or custom buttons
<Toolbar buttons={[
  {
    id: 'custom',
    label: 'Custom',
    icon: <CustomIcon />,
    onClick: () => {},
  }
]} />
```

### Sidebar
Hierarchical tree view with expand/collapse.

```tsx
import { Sidebar, type TreeNode } from '@/components';

const nodes: TreeNode[] = [
  {
    id: '1',
    name: 'Project',
    type: 'project',
    children: [
      { id: '2', name: 'Phase', type: 'phase' },
    ],
  },
];

<Sidebar 
  nodes={nodes}
  onSelectNode={(id) => console.log('selected', id)}
  onExpandNode={(id) => console.log('expanded', id)}
/>
```

### Inspector
Property editor with dynamic form fields.

```tsx
import { Inspector, type NodeProperty } from '@/components';

const properties: NodeProperty[] = [
  { id: 'title', name: 'Title', type: 'text', value: 'Item', required: true },
  { 
    id: 'status', 
    name: 'Status', 
    type: 'select',
    value: 'active',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
    ],
  },
];

<Inspector
  nodeId="node-1"
  nodeName="My Node"
  properties={properties}
  onPropertyChange={(propId, value) => console.log(propId, value)}
/>
```

## UI Components

### Button
Reusable button with variants and sizes.

```tsx
import { Button } from '@/components';

<Button>Default</Button>
<Button variant="primary">Primary</Button>
<Button variant="danger">Delete</Button>

<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>
```

### Input
Text input with optional label and error display.

```tsx
import { Input } from '@/components';

<Input 
  label="Name"
  placeholder="Enter name"
  value={name}
  onChange={(e) => setName(e.target.value)}
  error={nameError}
  required
/>
```

### Select
Dropdown with label and options.

```tsx
import { Select } from '@/components';

<Select
  label="Status"
  value={status}
  onChange={(e) => setStatus(e.target.value)}
  options={[
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ]}
/>
```

## Custom Hooks

### useSession
Session management with localStorage sync.

```tsx
import { useSession } from '@/hooks';

const { session, loading, error, createSession, loadSession } = useSession();

// Create new session
const newSession = await createSession();

// Load existing session
await loadSession(sessionId);

// Session object has: id, createdAt, lastActivity
```

### useNodes
Node CRUD operations.

```tsx
import { useNodes } from '@/hooks';

const { nodes, loading, error, createNode, updateNode, deleteNode, getNode } = useNodes();

// Create
const node = await createNode({ type: 'job', properties: {} });

// Update
await updateNode(node.id, { properties: { title: 'Updated' } });

// Delete
await deleteNode(node.id);

// Get
const fetched = await getNode(nodeId);
```

### useWebSocket
Real-time WebSocket events.

```tsx
import { useWebSocket } from '@/hooks';

const { connected, socket, emit } = useWebSocket({
  onConnect: () => console.log('Connected'),
  onNodeCreated: (data) => console.log('Node created:', data),
  onNodeUpdated: (data) => console.log('Node updated:', data),
  onNodeDeleted: (data) => console.log('Node deleted:', data),
  onDisconnect: () => console.log('Disconnected'),
});

// Emit custom events
emit('broadcast', { message: 'Hello' });
```

## Theme Colors

All theme colors available as Tailwind classes:

```tsx
// Background colors
className="bg-bg-dark"      // #121212
className="bg-bg-light"     // #2a2a2a
className="bg-bg-selection" // #3a3a3a

// Text colors
className="text-fg-primary"    // #f5f5f5
className="text-fg-secondary"  // #b0b0b0
className="text-fg-disabled"   // #696969

// Accent color
className="text-accent-primary" // #D94E1F (Ford Molten Orange)
className="text-accent-hover"   // #ff5722

// Status colors
className="text-status-success" // #4caf50
className="text-status-warning" // #ff9800
className="text-status-danger"  // #f44336
```

## Fonts

```tsx
// Display font (Michroma)
className="font-display"

// Body font (Segoe UI)
className="font-body"
```

## Layout Classes

```tsx
// Sizing tokens
className="h-titlebar"  // 40px
className="h-menubar"   // 28px
className="h-toolbar"   // 36px

// Grid layout
className="grid grid-cols-layout"  // [280px_1fr_320px] (sidebar, main, inspector)
```

## File Structure

All components exported from `src/components/index.ts` for convenient importing:

```tsx
import { 
  Button, Input, Select,
  TitleBar, MenuBar, Toolbar, Sidebar, Inspector,
  useSession, useNodes, useWebSocket
} from '@/components';
```

Note: Hooks are also re-exported from `src/hooks/index.ts`.
