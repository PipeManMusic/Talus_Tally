# Talus Tally WebSocket Protocol

**Version:** 1.0  
**Protocol:** Socket.IO  
**Namespace:** `/` (default)  
**Status:** ✅ Production Ready  
**Last Updated:** January 28, 2026

---

## Overview

The Talus Tally WebSocket protocol provides real-time event broadcasting for multi-client collaboration. Clients subscribe to session-based rooms and receive instant notifications of all graph changes.

### Key Features

- **Room-based Broadcasting:** Events are isolated to session rooms
- **Multi-client Support:** Unlimited concurrent clients per session
- **Automatic Fallback:** Socket.IO provides polling fallback if WebSocket unavailable
- **Event-driven Architecture:** All state changes broadcast as events
- **Session Lifecycle:** Track client connections and disconnections

---

## Connection

### Establish Connection

**Client:**
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5000', {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

socket.on('connect', () => {
  console.log('Connected to server:', socket.id);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
```

**Events:**
- `connect` - Connection established (includes `socket.id`)
- `disconnect` - Connection lost
- `connect_error` - Connection failed
- `reconnect` - Reconnection successful

---

## Session Management

### Join Session

Subscribe to a session room to receive updates.

**Client Emits:**
```javascript
socket.emit('join_session', {
  session_id: '550e8400-e29b-41d4-a716-446655440000'
});
```

**Server Response:**
```javascript
socket.on('joined', (data) => {
  console.log('Joined session:', data);
  // data = {
  //   session_id: '550e8400-...',
  //   client_id: 'socket-client-id',
  //   active_clients: 2
  // }
});
```

**Broadcast to Room:**
```javascript
socket.on('session:connected', (data) => {
  console.log('Client joined:', data);
  // data = {
  //   event: 'session:connected',
  //   session_id: '550e8400-...',
  //   client_id: 'socket-client-id',
  //   timestamp: '2026-01-28T15:30:00Z'
  // }
});
```

---

### Leave Session

Unsubscribe from a session room.

**Client Emits:**
```javascript
socket.emit('leave_session', {
  session_id: '550e8400-e29b-41d4-a716-446655440000'
});
```

**Server Response:**
```javascript
socket.on('left', (data) => {
  console.log('Left session:', data);
  // data = {
  //   session_id: '550e8400-...',
  //   client_id: 'socket-client-id'
  // }
});
```

**Broadcast to Room:**
```javascript
socket.on('session:disconnected', (data) => {
  console.log('Client left:', data);
  // data = {
  //   event: 'session:disconnected',
  //   session_id: '550e8400-...',
  //   client_id: 'socket-client-id',
  //   timestamp: '2026-01-28T15:45:00Z'
  // }
});
```

---

## Graph Events

All graph modifications are broadcast to session room subscribers.

### Node Created

Emitted when a new node is added to the graph.

**Event:**
```javascript
socket.on('node-created', (data) => {
  console.log('Node created:', data);
  // data = {
  //   event: 'node-created',
  //   session_id: '550e8400-...',
  //   node: {
  //     id: 'new-node-uuid',
  //     blueprint_type_id: 'phase',
  //     parent_id: 'root-uuid',
  //     properties: {},
  //     children: []
  //   },
  //   timestamp: '2026-01-28T15:30:00Z'
  // }
  
  // Update your local state/tree view
  addNodeToTree(data.node);
});
```

---

### Node Deleted

Emitted when a node is removed from the graph.

**Event:**
```javascript
socket.on('node-deleted', (data) => {
  console.log('Node deleted:', data);
  // data = {
  //   event: 'node-deleted',
  //   session_id: '550e8400-...',
  //   node_id: 'deleted-node-uuid',
  //   timestamp: '2026-01-28T15:31:00Z'
  // }
  
  // Update your local state/tree view
  removeNodeFromTree(data.node_id);
});
```

---

### Property Changed

Emitted when a node property is updated.

**Event:**
```javascript
socket.on('property-changed', (data) => {
  console.log('Property changed:', data);
  // data = {
  //   event: 'property-changed',
  //   session_id: '550e8400-...',
  //   node_id: 'node-uuid',
  //   property_id: 'status',
  //   old_value: 'not-started-uuid',
  //   new_value: 'in-progress-uuid',
  //   timestamp: '2026-01-28T15:32:00Z'
  // }
  
  // Update property in your local state
  updateNodeProperty(data.node_id, data.property_id, data.new_value);
});
```

---

### Node Linked

Emitted when a parent-child relationship is created.

**Event:**
```javascript
socket.on('node-linked', (data) => {
  console.log('Node linked:', data);
  // data = {
  //   event: 'node-linked',
  //   session_id: '550e8400-...',
  //   parent_id: 'parent-uuid',
  //   child_id: 'child-uuid',
  //   timestamp: '2026-01-28T15:33:00Z'
  // }
  
  // Update tree structure
  linkNodes(data.parent_id, data.child_id);
});
```

---

### Node Unlinked

Emitted when a parent-child relationship is removed.

**Event:**
```javascript
socket.on('node-unlinked', (data) => {
  console.log('Node unlinked:', data);
  // data = {
  //   event: 'node-unlinked',
  //   session_id: '550e8400-...',
  //   parent_id: 'parent-uuid',
  //   child_id: 'child-uuid',
  //   timestamp: '2026-01-28T15:34:00Z'
  // }
  
  // Update tree structure
  unlinkNodes(data.parent_id, data.child_id);
});
```

---

## Command Events

Command execution lifecycle events.

### Command Executing

Emitted when a command starts executing.

**Event:**
```javascript
socket.on('command:executing', (data) => {
  console.log('Command executing:', data);
  // data = {
  //   event: 'command:executing',
  //   session_id: '550e8400-...',
  //   command_id: 'cmd-uuid',
  //   command_type: 'CreateNode',
  //   timestamp: '2026-01-28T15:35:00Z'
  // }
  
  // Show loading indicator
  showCommandProgress(data.command_type);
});
```

---

### Command Executed

Emitted when a command completes successfully.

**Event:**
```javascript
socket.on('command:executed', (data) => {
  console.log('Command executed:', data);
  // data = {
  //   event: 'command:executed',
  //   session_id: '550e8400-...',
  //   command_id: 'cmd-uuid',
  //   command_type: 'CreateNode',
  //   result: { ... },
  //   timestamp: '2026-01-28T15:35:01Z'
  // }
  
  // Hide loading indicator
  hideCommandProgress();
});
```

---

### Command Failed

Emitted when a command execution fails.

**Event:**
```javascript
socket.on('command:failed', (data) => {
  console.log('Command failed:', data);
  // data = {
  //   event: 'command:failed',
  //   session_id: '550e8400-...',
  //   command_id: 'cmd-uuid',
  //   command_type: 'CreateNode',
  //   error: {
  //     code: 'INVALID_PARENT',
  //     message: 'Parent node not found'
  //   },
  //   timestamp: '2026-01-28T15:35:02Z'
  // }
  
  // Show error to user
  showError(data.error.message);
});
```

---

### Undo

Emitted when a command is undone.

**Event:**
```javascript
socket.on('command:undo', (data) => {
  console.log('Command undone:', data);
  // data = {
  //   event: 'command:undo',
  //   session_id: '550e8400-...',
  //   command_id: 'cmd-uuid',
  //   command_type: 'CreateNode',
  //   timestamp: '2026-01-28T15:36:00Z'
  // }
  
  // Refresh graph state from server
  fetchGraphState();
});
```

---

### Redo

Emitted when a command is redone.

**Event:**
```javascript
socket.on('command:redo', (data) => {
  console.log('Command redone:', data);
  // data = {
  //   event: 'command:redo',
  //   session_id: '550e8400-...',
  //   command_id: 'cmd-uuid',
  //   command_type: 'CreateNode',
  //   timestamp: '2026-01-28T15:37:00Z'
  // }
  
  // Refresh graph state from server
  fetchGraphState();
});
```

---

## Utility Events

### Ping/Pong

Keep-alive mechanism for connection health.

**Client:**
```javascript
socket.emit('ping');
```

**Server Response:**
```javascript
socket.on('pong', () => {
  console.log('Server is alive');
});
```

---

### Error

Generic error event from server.

**Event:**
```javascript
socket.on('error', (data) => {
  console.error('Server error:', data);
  // data = {
  //   message: 'Missing session_id'
  // }
});
```

---

## Client Implementation Example

### Complete React Hook

```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export function useWebSocket(sessionId) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [activeClients, setActiveClients] = useState(0);

  useEffect(() => {
    // Connect to server
    const newSocket = io('http://localhost:5000');
    
    newSocket.on('connect', () => {
      console.log('Connected');
      setConnected(true);
      
      // Join session
      if (sessionId) {
        newSocket.emit('join_session', { session_id: sessionId });
      }
    });
    
    newSocket.on('disconnect', () => {
      console.log('Disconnected');
      setConnected(false);
    });
    
    newSocket.on('joined', (data) => {
      console.log('Joined session:', data);
      setActiveClients(data.active_clients);
    });
    
    // Graph events
    newSocket.on('node-created', (data) => {
      console.log('Node created:', data);
      // Update your state management (Redux, Zustand, etc.)
    });
    
    newSocket.on('property-changed', (data) => {
      console.log('Property changed:', data);
      // Update your state management
    });
    
    setSocket(newSocket);
    
    // Cleanup
    return () => {
      if (sessionId) {
        newSocket.emit('leave_session', { session_id: sessionId });
      }
      newSocket.close();
    };
  }, [sessionId]);
  
  return { socket, connected, activeClients };
}
```

---

## Event Summary

| Event | Direction | Purpose |
|-------|-----------|---------|
| `join_session` | Client → Server | Subscribe to session |
| `leave_session` | Client → Server | Unsubscribe from session |
| `ping` | Client → Server | Keep-alive |
| `joined` | Server → Client | Join confirmation |
| `left` | Server → Client | Leave confirmation |
| `pong` | Server → Client | Keep-alive response |
| `error` | Server → Client | Error notification |
| `session:connected` | Server → Room | Client joined |
| `session:disconnected` | Server → Room | Client left |
| `node-created` | Server → Room | Node added |
| `node-deleted` | Server → Room | Node removed |
| `property-changed` | Server → Room | Property updated |
| `node-linked` | Server → Room | Relationship created |
| `node-unlinked` | Server → Room | Relationship removed |
| `command:executing` | Server → Room | Command started |
| `command:executed` | Server → Room | Command completed |
| `command:failed` | Server → Room | Command failed |
| `command:undo` | Server → Room | Command undone |
| `command:redo` | Server → Room | Command redone |

---

## Best Practices

### 1. Connection Management

```javascript
// Always handle reconnection
socket.on('reconnect', (attemptNumber) => {
  console.log('Reconnected after', attemptNumber, 'attempts');
  // Re-join session
  socket.emit('join_session', { session_id: sessionId });
});
```

### 2. State Synchronization

```javascript
// On reconnect, fetch fresh state
socket.on('reconnect', async () => {
  const response = await fetch(`/api/v1/graph?session_id=${sessionId}`);
  const graph = await response.json();
  updateLocalState(graph);
});
```

### 3. Error Handling

```javascript
// Always handle errors
socket.on('error', (error) => {
  console.error('Socket error:', error);
  showNotification('Connection error', 'error');
});

socket.on('connect_error', (error) => {
  console.error('Connection failed:', error);
  showNotification('Cannot connect to server', 'error');
});
```

### 4. Event Batching

```javascript
// For high-frequency events, debounce updates
import { debounce } from 'lodash';

const updateTree = debounce((node) => {
  // Update tree view
}, 100);

socket.on('property-changed', (data) => {
  updateTree(data);
});
```

---

## Troubleshooting

### Connection Fails

**Problem:** `connect_error` event fired

**Solutions:**
1. Check server is running: `curl http://localhost:5000/api/v1/health`
2. Verify CORS settings in `backend/app.py`
3. Check firewall rules
4. Try polling transport: `transports: ['polling']`

### Events Not Received

**Problem:** Not receiving `node-created` or other events

**Solutions:**
1. Verify joined session: Check for `joined` event
2. Check session ID is correct
3. Verify server is broadcasting (check server logs)
4. Try direct emit to test: `socket.emit('ping')` → expect `pong`

### Multiple Connections

**Problem:** Creating multiple socket connections

**Solutions:**
1. Store socket in global state (React Context, Redux)
2. Use singleton pattern for socket instance
3. Clean up on component unmount
4. Don't create new socket on every render

---

## Performance

### Recommended Limits

- **Events per second:** ~50-100 per session
- **Concurrent clients:** 1000+ per server
- **Message size:** < 1MB per event
- **Reconnection delay:** 1-5 seconds
- **Ping interval:** 25 seconds (Socket.IO default)

### Scaling

For multi-server deployments, use Socket.IO Redis adapter:

```javascript
// Server-side
const redis = require('socket.io-redis');
io.adapter(redis({ host: 'localhost', port: 6379 }));
```

---

## Security

**Current:** No authentication (development mode)

**Production:**
- Add JWT token validation on connection
- Verify session ownership before joining rooms
- Rate limit event emissions
- Validate all event payloads
- Enable HTTPS/WSS

---

**Status:** ✅ Production Ready  
**Protocol Version:** 1.0  
**Socket.IO Version:** 5.6.0+  
**Last Updated:** January 28, 2026
