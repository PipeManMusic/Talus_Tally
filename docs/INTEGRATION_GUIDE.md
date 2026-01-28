# Frontend Integration Guide

**Version:** 1.0  
**Last Updated:** January 28, 2026  
**Target:** React/Vue/Vanilla JS developers

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Session Management](#session-management)
4. [Graph State Management](#graph-state-management)
5. [Real-time Updates](#real-time-updates)
6. [React Integration](#react-integration)
7. [Vue Integration](#vue-integration)
8. [Error Handling](#error-handling)
9. [Performance Best Practices](#performance-best-practices)
10. [Testing](#testing)

---

## Quick Start

### Prerequisites

```bash
# Backend running on http://localhost:5000
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python run_app.py
```

### Install Client Dependencies

```bash
npm install socket.io-client
# or
yarn add socket.io-client
```

### Basic Connection

```javascript
import io from 'socket.io-client';

// Create session
const response = await fetch('http://localhost:5000/api/v1/sessions', {
  method: 'POST'
});
const { session_id } = await response.json();

// Connect WebSocket
const socket = io('http://localhost:5000');

socket.on('connect', () => {
  socket.emit('join_session', { session_id });
});

socket.on('joined', (data) => {
  console.log('Connected to session:', data.session_id);
});

// Create project
const project = await fetch('http://localhost:5000/api/v1/projects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    template_id: 'restomod',
    project_name: 'My First Project'
  })
});

const { graph } = await project.json();
console.log('Project created:', graph);
```

---

## Architecture Overview

### Communication Layers

```
┌─────────────────────────────────────────┐
│          Frontend (React/Vue)           │
│  ┌─────────────┐     ┌──────────────┐   │
│  │ REST Client │     │ WebSocket    │   │
│  │ (fetch/axios)│     │ (Socket.IO)  │   │
│  └──────┬──────┘     └──────┬───────┘   │
└─────────┼───────────────────┼───────────┘
          │                   │
          │ HTTP              │ WS
          │                   │
┌─────────┼───────────────────┼───────────┐
│         ▼                   ▼           │
│  ┌──────────────┐   ┌──────────────┐   │
│  │ Flask Routes │   │ Socket.IO    │   │
│  │              │   │ Handlers     │   │
│  └──────┬───────┘   └──────────────┘   │
│         │                               │
│         ▼                               │
│  ┌────────────────────────────────┐    │
│  │  Session Manager (in-memory)   │    │
│  │  - Graph state                 │    │
│  │  - Command history             │    │
│  │  - Undo/redo stacks            │    │
│  └────────────────────────────────┘    │
│                                         │
│          Backend (Flask)                │
└─────────────────────────────────────────┘
```

### Data Flow

1. **Commands (Frontend → Backend)**
   - Frontend sends REST POST to `/commands/execute`
   - Backend processes command, updates graph
   - Backend broadcasts WebSocket event to all session clients
   - Frontend receives event, updates local state

2. **Queries (Frontend ← Backend)**
   - Frontend sends REST GET to `/graph`, `/sessions`, etc.
   - Backend returns current state
   - No WebSocket events triggered

---

## Session Management

### Creating a Session

```javascript
class SessionManager {
  constructor(baseURL = 'http://localhost:5000/api/v1') {
    this.baseURL = baseURL;
    this.sessionId = null;
  }

  async createSession() {
    const response = await fetch(`${this.baseURL}/sessions`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      throw new Error(`Session creation failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    this.sessionId = data.session_id;
    return this.sessionId;
  }

  async listSessions() {
    const response = await fetch(`${this.baseURL}/sessions`);
    const data = await response.json();
    return data.sessions;
  }

  async getSessionInfo() {
    if (!this.sessionId) {
      throw new Error('No active session');
    }
    
    const response = await fetch(
      `${this.baseURL}/sessions/${this.sessionId}/info`
    );
    return await response.json();
  }
}
```

### Joining an Existing Session

```javascript
// Connect to WebSocket and join existing session
const sessionId = 'existing-session-uuid';

const socket = io('http://localhost:5000');

socket.on('connect', () => {
  socket.emit('join_session', { session_id: sessionId });
});

socket.on('joined', (data) => {
  console.log('Joined session:', data.session_id);
  console.log('Other clients:', data.active_clients - 1);
});

socket.on('error', (error) => {
  if (error.code === 'INVALID_SESSION') {
    // Session doesn't exist, create new one
    sessionManager.createSession().then((newSessionId) => {
      socket.emit('join_session', { session_id: newSessionId });
    });
  }
});
```

---

## Graph State Management

### Fetching Graph State

```javascript
class GraphClient {
  constructor(baseURL, sessionId) {
    this.baseURL = baseURL;
    this.sessionId = sessionId;
  }

  async getGraph() {
    const response = await fetch(
      `${this.baseURL}/graph?session_id=${this.sessionId}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch graph: ${response.statusText}`);
    }
    
    return await response.json();
  }

  async createProject(templateId, projectName) {
    const response = await fetch(`${this.baseURL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: templateId,
        project_name: projectName
      })
    });
    
    return await response.json();
  }

  async getTemplateSchema(templateId) {
    const response = await fetch(
      `${this.baseURL}/templates/${templateId}/schema`
    );
    return await response.json();
  }
}
```

### Executing Commands

```javascript
class CommandExecutor {
  constructor(baseURL, sessionId) {
    this.baseURL = baseURL;
    this.sessionId = sessionId;
  }

  async execute(commandType, data) {
    const response = await fetch(`${this.baseURL}/commands/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: this.sessionId,
        command_type: commandType,
        data
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error.message);
    }
    
    return await response.json();
  }

  async createNode(parentId, blueprintTypeId) {
    return this.execute('CreateNode', {
      parent_id: parentId,
      blueprint_type_id: blueprintTypeId
    });
  }

  async updateProperty(nodeId, propertyId, value) {
    return this.execute('UpdateProperty', {
      node_id: nodeId,
      property_id: propertyId,
      value
    });
  }

  async deleteNode(nodeId) {
    return this.execute('DeleteNode', {
      node_id: nodeId
    });
  }

  async undo() {
    const response = await fetch(
      `${this.baseURL}/sessions/${this.sessionId}/undo`,
      { method: 'POST' }
    );
    return await response.json();
  }

  async redo() {
    const response = await fetch(
      `${this.baseURL}/sessions/${this.sessionId}/redo`,
      { method: 'POST' }
    );
    return await response.json();
  }
}
```

---

## Real-time Updates

### WebSocket Event Handlers

```javascript
class GraphEventHandler {
  constructor(socket, onGraphChange) {
    this.socket = socket;
    this.onGraphChange = onGraphChange;
    this.setupListeners();
  }

  setupListeners() {
    // Node events
    this.socket.on('node-created', (event) => {
      console.log('Node created:', event.node);
      this.onGraphChange({ type: 'NODE_CREATED', node: event.node });
    });

    this.socket.on('node-deleted', (event) => {
      console.log('Node deleted:', event.node_id);
      this.onGraphChange({ type: 'NODE_DELETED', nodeId: event.node_id });
    });

    this.socket.on('property-changed', (event) => {
      console.log('Property changed:', event);
      this.onGraphChange({
        type: 'PROPERTY_CHANGED',
        nodeId: event.node_id,
        propertyId: event.property_id,
        value: event.new_value
      });
    });

    // Command events
    this.socket.on('command:undo', (event) => {
      console.log('Command undone');
      this.onGraphChange({ type: 'UNDO' });
    });

    this.socket.on('command:redo', (event) => {
      console.log('Command redone');
      this.onGraphChange({ type: 'REDO' });
    });

    // Session events
    this.socket.on('client:joined', (event) => {
      console.log('Client joined:', event.active_clients);
    });

    this.socket.on('client:left', (event) => {
      console.log('Client left:', event.active_clients);
    });

    // Connection events
    this.socket.on('disconnect', () => {
      console.warn('WebSocket disconnected');
    });

    this.socket.on('reconnect', () => {
      console.log('WebSocket reconnected');
      // Rejoin session after reconnection
      this.socket.emit('join_session', { session_id: this.sessionId });
    });
  }

  destroy() {
    this.socket.removeAllListeners();
  }
}
```

---

## React Integration

### Custom Hooks

#### useSession Hook

```javascript
import { useState, useEffect } from 'react';

export function useSession(baseURL = 'http://localhost:5000/api/v1') {
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function createSession() {
      try {
        const response = await fetch(`${baseURL}/sessions`, {
          method: 'POST'
        });
        const data = await response.json();
        setSessionId(data.session_id);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    createSession();
  }, [baseURL]);

  return { sessionId, loading, error };
}
```

#### useWebSocket Hook

```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export function useWebSocket(sessionId, serverURL = 'http://localhost:5000') {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    const newSocket = io(serverURL);

    newSocket.on('connect', () => {
      newSocket.emit('join_session', { session_id: sessionId });
    });

    newSocket.on('joined', () => {
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [sessionId, serverURL]);

  return { socket, connected };
}
```

#### useGraph Hook

```javascript
import { useState, useEffect, useCallback } from 'react';

export function useGraph(sessionId, socket, baseURL) {
  const [graph, setGraph] = useState({ roots: [] });
  const [loading, setLoading] = useState(true);

  // Fetch initial graph
  useEffect(() => {
    if (!sessionId) return;

    async function fetchGraph() {
      try {
        const response = await fetch(
          `${baseURL}/graph?session_id=${sessionId}`
        );
        const data = await response.json();
        setGraph(data);
      } catch (err) {
        console.error('Failed to fetch graph:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchGraph();
  }, [sessionId, baseURL]);

  // Listen for real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleNodeCreated = (event) => {
      // Refetch graph to get updated state
      // (In production, you might update graph locally for better performance)
      fetch(`${baseURL}/graph?session_id=${sessionId}`)
        .then((r) => r.json())
        .then(setGraph);
    };

    const handlePropertyChanged = (event) => {
      // Update graph locally for instant feedback
      setGraph((prevGraph) => {
        const newGraph = JSON.parse(JSON.stringify(prevGraph));
        // Find and update node in tree...
        updateNodeInTree(newGraph.roots, event.node_id, event.property_id, event.new_value);
        return newGraph;
      });
    };

    const handleNodeDeleted = () => {
      fetch(`${baseURL}/graph?session_id=${sessionId}`)
        .then((r) => r.json())
        .then(setGraph);
    };

    socket.on('node-created', handleNodeCreated);
    socket.on('property-changed', handlePropertyChanged);
    socket.on('node-deleted', handleNodeDeleted);
    socket.on('command:undo', handleNodeDeleted); // Refetch on undo
    socket.on('command:redo', handleNodeDeleted); // Refetch on redo

    return () => {
      socket.off('node-created', handleNodeCreated);
      socket.off('property-changed', handlePropertyChanged);
      socket.off('node-deleted', handleNodeDeleted);
      socket.off('command:undo', handleNodeDeleted);
      socket.off('command:redo', handleNodeDeleted);
    };
  }, [socket, sessionId, baseURL]);

  return { graph, loading };
}

// Helper function to update node in tree
function updateNodeInTree(nodes, nodeId, propertyId, value) {
  for (const node of nodes) {
    if (node.id === nodeId) {
      node.properties[propertyId] = value;
      return true;
    }
    if (node.children && updateNodeInTree(node.children, nodeId, propertyId, value)) {
      return true;
    }
  }
  return false;
}
```

### Complete React Component

```javascript
import React from 'react';
import { useSession } from './hooks/useSession';
import { useWebSocket } from './hooks/useWebSocket';
import { useGraph } from './hooks/useGraph';

const BASE_URL = 'http://localhost:5000/api/v1';

export function ProjectGraph() {
  const { sessionId, loading: sessionLoading } = useSession(BASE_URL);
  const { socket, connected } = useWebSocket(sessionId);
  const { graph, loading: graphLoading } = useGraph(sessionId, socket, BASE_URL);

  const createNode = async (parentId, blueprintTypeId) => {
    const response = await fetch(`${BASE_URL}/commands/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        command_type: 'CreateNode',
        data: { parent_id: parentId, blueprint_type_id: blueprintTypeId }
      })
    });
    // WebSocket event will trigger graph update
  };

  const updateProperty = async (nodeId, propertyId, value) => {
    await fetch(`${BASE_URL}/commands/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        command_type: 'UpdateProperty',
        data: { node_id: nodeId, property_id: propertyId, value }
      })
    });
  };

  if (sessionLoading || graphLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <div>Session: {sessionId}</div>
      <div>WebSocket: {connected ? '🟢 Connected' : '🔴 Disconnected'}</div>
      
      <GraphTree 
        nodes={graph.roots} 
        onCreateNode={createNode}
        onUpdateProperty={updateProperty}
      />
    </div>
  );
}

function GraphTree({ nodes, onCreateNode, onUpdateProperty }) {
  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.id}>
          {node.name}
          <button onClick={() => onCreateNode(node.id, 'phase')}>
            Add Child
          </button>
          {node.children && (
            <GraphTree 
              nodes={node.children}
              onCreateNode={onCreateNode}
              onUpdateProperty={onUpdateProperty}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
```

---

## Vue Integration

### Composables

```javascript
// composables/useSession.js
import { ref, onMounted } from 'vue';

export function useSession(baseURL = 'http://localhost:5000/api/v1') {
  const sessionId = ref(null);
  const loading = ref(true);
  const error = ref(null);

  onMounted(async () => {
    try {
      const response = await fetch(`${baseURL}/sessions`, {
        method: 'POST'
      });
      const data = await response.json();
      sessionId.value = data.session_id;
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  });

  return { sessionId, loading, error };
}
```

```javascript
// composables/useWebSocket.js
import { ref, onMounted, onUnmounted, watch } from 'vue';
import io from 'socket.io-client';

export function useWebSocket(sessionId, serverURL = 'http://localhost:5000') {
  const socket = ref(null);
  const connected = ref(false);

  watch(sessionId, (newSessionId) => {
    if (!newSessionId) return;

    socket.value = io(serverURL);

    socket.value.on('connect', () => {
      socket.value.emit('join_session', { session_id: newSessionId });
    });

    socket.value.on('joined', () => {
      connected.value = true;
    });

    socket.value.on('disconnect', () => {
      connected.value = false;
    });
  }, { immediate: true });

  onUnmounted(() => {
    if (socket.value) {
      socket.value.close();
    }
  });

  return { socket, connected };
}
```

### Vue Component

```vue
<template>
  <div>
    <div>Session: {{ sessionId }}</div>
    <div>WebSocket: {{ connected ? '🟢 Connected' : '🔴 Disconnected' }}</div>
    
    <GraphTree
      :nodes="graph.roots"
      @create-node="createNode"
      @update-property="updateProperty"
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useSession } from './composables/useSession';
import { useWebSocket } from './composables/useWebSocket';
import GraphTree from './components/GraphTree.vue';

const BASE_URL = 'http://localhost:5000/api/v1';

const { sessionId, loading: sessionLoading } = useSession(BASE_URL);
const { socket, connected } = useWebSocket(sessionId);
const graph = ref({ roots: [] });

// Fetch initial graph
watch(sessionId, async (newSessionId) => {
  if (!newSessionId) return;
  
  const response = await fetch(`${BASE_URL}/graph?session_id=${newSessionId}`);
  graph.value = await response.json();
}, { immediate: true });

// Listen for real-time updates
watch(socket, (newSocket) => {
  if (!newSocket) return;

  newSocket.on('node-created', async () => {
    const response = await fetch(`${BASE_URL}/graph?session_id=${sessionId.value}`);
    graph.value = await response.json();
  });

  newSocket.on('property-changed', (event) => {
    // Update graph locally
    updateNodeInGraph(graph.value.roots, event.node_id, event.property_id, event.new_value);
  });
});

async function createNode(parentId, blueprintTypeId) {
  await fetch(`${BASE_URL}/commands/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId.value,
      command_type: 'CreateNode',
      data: { parent_id: parentId, blueprint_type_id: blueprintTypeId }
    })
  });
}

async function updateProperty(nodeId, propertyId, value) {
  await fetch(`${BASE_URL}/commands/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId.value,
      command_type: 'UpdateProperty',
      data: { node_id: nodeId, property_id: propertyId, value }
    })
  });
}

function updateNodeInGraph(nodes, nodeId, propertyId, value) {
  for (const node of nodes) {
    if (node.id === nodeId) {
      node.properties[propertyId] = value;
      return;
    }
    if (node.children) {
      updateNodeInGraph(node.children, nodeId, propertyId, value);
    }
  }
}
</script>
```

---

## Error Handling

### Centralized Error Handler

```javascript
class APIError extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function apiRequest(url, options = {}) {
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new APIError(
        errorData.error.code,
        errorData.error.message,
        response.status
      );
    }
    
    return await response.json();
  } catch (err) {
    if (err instanceof APIError) {
      throw err;
    }
    // Network error
    throw new APIError('NETWORK_ERROR', err.message, 0);
  }
}

// Usage
try {
  const result = await apiRequest('http://localhost:5000/api/v1/sessions', {
    method: 'POST'
  });
} catch (err) {
  if (err.code === 'INVALID_SESSION') {
    // Handle invalid session
    console.error('Session expired, creating new session');
  } else if (err.code === 'NETWORK_ERROR') {
    // Handle network error
    console.error('Network error, retrying...');
  } else {
    // Generic error
    console.error('API error:', err.message);
  }
}
```

### Retry Logic

```javascript
async function apiRequestWithRetry(url, options = {}, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiRequest(url, options);
    } catch (err) {
      if (err.code === 'NETWORK_ERROR' && attempt < maxRetries) {
        // Exponential backoff
        await new Promise((resolve) => 
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
        continue;
      }
      throw err;
    }
  }
}
```

---

## Performance Best Practices

### 1. Batch Updates

Instead of executing commands one by one:

```javascript
// ❌ Bad: Multiple sequential requests
for (const node of nodes) {
  await createNode(node.parentId, node.type);
}

// ✅ Good: Consider macro commands (if supported)
// Or batch on backend and execute in single transaction
```

### 2. Optimistic Updates

Update UI immediately, revert on error:

```javascript
function updatePropertyOptimistic(nodeId, propertyId, value) {
  // Update UI immediately
  setGraph((prev) => {
    const newGraph = cloneGraph(prev);
    updateNodeInTree(newGraph.roots, nodeId, propertyId, value);
    return newGraph;
  });

  // Send to server
  apiRequest(`${BASE_URL}/commands/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      command_type: 'UpdateProperty',
      data: { node_id: nodeId, property_id: propertyId, value }
    })
  }).catch((err) => {
    // Revert on error
    console.error('Update failed, reverting:', err);
    fetchGraph(); // Refetch from server
  });
}
```

### 3. Debounce Frequent Updates

```javascript
import { debounce } from 'lodash';

const debouncedUpdate = debounce((nodeId, propertyId, value) => {
  updateProperty(nodeId, propertyId, value);
}, 500);

// Use in input handler
<input onChange={(e) => debouncedUpdate(nodeId, 'name', e.target.value)} />
```

### 4. Connection Pooling

Reuse socket instance across components:

```javascript
// socketService.js
class SocketService {
  constructor() {
    this.socket = null;
    this.sessionId = null;
  }

  connect(sessionId, serverURL = 'http://localhost:5000') {
    if (this.socket && this.sessionId === sessionId) {
      return this.socket;
    }

    if (this.socket) {
      this.socket.close();
    }

    this.socket = io(serverURL);
    this.sessionId = sessionId;

    this.socket.on('connect', () => {
      this.socket.emit('join_session', { session_id: sessionId });
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.sessionId = null;
    }
  }
}

export const socketService = new SocketService();
```

---

## Testing

### Unit Tests (Jest)

```javascript
import { renderHook, waitFor } from '@testing-library/react';
import { useSession } from './hooks/useSession';

global.fetch = jest.fn();

describe('useSession', () => {
  it('creates a session on mount', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ session_id: 'test-session-id' })
    });

    const { result } = renderHook(() => useSession());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.sessionId).toBe('test-session-id');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:5000/api/v1/sessions',
      { method: 'POST' }
    );
  });
});
```

### Integration Tests

```javascript
import { render, screen, waitFor } from '@testing-library/react';
import { ProjectGraph } from './ProjectGraph';

describe('ProjectGraph Integration', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('loads and displays graph', async () => {
    // Mock session creation
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ session_id: 'test-id' })
    });

    // Mock graph fetch
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        roots: [{ id: '1', name: 'Root Node', children: [] }]
      })
    });

    render(<ProjectGraph />);

    await waitFor(() => {
      expect(screen.getByText('Root Node')).toBeInTheDocument();
    });
  });
});
```

---

## Troubleshooting

### CORS Issues

If you encounter CORS errors, ensure backend has correct configuration:

```python
# backend/app.py
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=['http://localhost:3000'])
```

### WebSocket Connection Fails

Check Socket.IO configuration:

```javascript
const socket = io('http://localhost:5000', {
  transports: ['websocket', 'polling'], // Try both transports
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});

socket.on('connect_error', (err) => {
  console.error('Connection error:', err.message);
});
```

### Session Expires

Implement session renewal:

```javascript
socket.on('error', (error) => {
  if (error.code === 'INVALID_SESSION') {
    // Create new session and rejoin
    createSession().then((newSessionId) => {
      socket.emit('join_session', { session_id: newSessionId });
    });
  }
});
```

---

## Next Steps

- Review [API Contract](API_CONTRACT.md) for complete endpoint reference
- Read [WebSocket Protocol](WEBSOCKET_PROTOCOL.md) for event specifications
- See [Deployment Guide](DEPLOYMENT_GUIDE.md) for production setup
- Check [Master Plan](MASTER_PLAN.md) for system architecture

---

**Last Updated:** January 28, 2026  
**API Version:** 1.0  
**Status:** ✅ Production Ready
