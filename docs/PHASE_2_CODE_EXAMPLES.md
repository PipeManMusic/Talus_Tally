# Phase 2 WebSocket - Code Examples & Integration Points

Quick reference with actual code patterns for implementation.

---

## 1. Socket.IO Initialization Pattern

### In `backend/app.py`

```python
"""
Talus Core REST API Server with WebSocket Support

Exposes Python backend as JSON/REST endpoints + real-time WebSocket events.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global Socket.IO instance
socketio = None

def create_app(config=None, enable_websocket=True):
    """
    Create and configure Flask application.
    
    Args:
        config: Optional dict with configuration overrides
        enable_websocket: Whether to initialize WebSocket support (default True)
        
    Returns:
        Flask application instance
    """
    global socketio
    
    app = Flask(__name__)
    
    # Enable CORS for development
    CORS(app)
    
    # Configuration
    app.config.update({
        'JSON_SORT_KEYS': False,
        'JSONIFY_PRETTYPRINT_REGULAR': False,
    })
    
    if config:
        app.config.update(config)
    
    # Initialize Socket.IO if enabled
    if enable_websocket:
        socketio = SocketIO(
            app,
            cors_allowed_origins="*",
            async_mode='threading',  # Safe for Flask
            logger=False,  # Set True for debugging
            engineio_logger=False
        )
        
        # Register WebSocket handlers
        from backend.websocket.handlers import setup_websocket_handlers
        setup_websocket_handlers(socketio)
        
        # Initialize broadcaster
        from backend.websocket import set_broadcaster
        set_broadcaster(socketio)
        
        logger.info("WebSocket support initialized")
    
    # Register Flask blueprints (unchanged)
    from backend.api.routes import api_bp
    app.register_blueprint(api_bp)
    
    # Global error handlers
    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({
            'error': {
                'code': 'BAD_REQUEST',
                'message': str(error.description)
            }
        }), 400
    
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({
            'error': {
                'code': 'NOT_FOUND',
                'message': 'Endpoint not found'
            }
        }), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        logger.error(f"Internal server error: {error}")
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Internal server error'
            }
        }), 500
    
    return app

if __name__ == '__main__':
    app = create_app()
    
    # Run with Socket.IO if available
    if socketio:
        socketio.run(app, host='127.0.0.1', port=5000, debug=True)
    else:
        app.run(host='127.0.0.1', port=5000, debug=True)
```

---

## 2. Broadcaster Implementation

### In `backend/websocket/broadcaster.py`

```python
"""
WebSocket event broadcaster for graph changes.

Provides methods to emit typed events to connected clients.
All events are broadcast to a session-based room.
"""

import logging
from datetime import datetime
from uuid import UUID
from typing import Optional, Any, Dict

logger = logging.getLogger(__name__)

class WebSocketBroadcaster:
    """Broadcasts graph change events to WebSocket clients."""
    
    def __init__(self, socketio):
        """
        Initialize broadcaster.
        
        Args:
            socketio: Flask-SocketIO instance
        """
        self.socketio = socketio
    
    def _emit(self, event: str, payload: Dict[str, Any], 
              room: str, namespace: str = '/graph') -> None:
        """
        Internal emit method with error handling.
        
        Args:
            event: Event name (e.g., 'graph:node-created')
            payload: Event data
            room: Socket.IO room name
            namespace: Socket.IO namespace (default '/graph')
        """
        if not self.socketio:
            logger.debug(f"WebSocket not initialized, skipping {event}")
            return
        
        try:
            # Add timestamp if not present
            if 'timestamp' not in payload:
                payload['timestamp'] = datetime.utcnow().isoformat()
            
            logger.debug(f"Emitting {event} to {room}: {payload}")
            self.socketio.emit(event, payload, room=room, namespace=namespace)
        except Exception as e:
            logger.error(f"Failed to emit {event} to {room}: {e}")
    
    # ========================================================================
    # Graph Structure Events
    # ========================================================================
    
    def emit_node_created(self, session_id: str, node_id: UUID, 
                         name: str, blueprint_type_id: str, 
                         parent_id: Optional[UUID] = None) -> None:
        """
        Broadcast node creation event.
        
        Args:
            session_id: Session ID to broadcast to
            node_id: UUID of created node
            name: Node name
            blueprint_type_id: Type of blueprint used
            parent_id: Optional parent node ID
        """
        payload = {
            'node_id': str(node_id),
            'name': name,
            'blueprint_type_id': blueprint_type_id,
            'parent_id': str(parent_id) if parent_id else None,
        }
        self._emit('graph:node-created', payload, f'session_{session_id}')
    
    def emit_node_deleted(self, session_id: str, node_id: UUID) -> None:
        """
        Broadcast node deletion event.
        
        Args:
            session_id: Session ID
            node_id: UUID of deleted node
        """
        payload = {'node_id': str(node_id)}
        self._emit('graph:node-deleted', payload, f'session_{session_id}')
    
    def emit_node_linked(self, session_id: str, parent_id: UUID, 
                        child_id: UUID) -> None:
        """
        Broadcast node link event.
        
        Args:
            session_id: Session ID
            parent_id: Parent node UUID
            child_id: Child node UUID
        """
        payload = {
            'parent_id': str(parent_id),
            'child_id': str(child_id),
        }
        self._emit('graph:node-linked', payload, f'session_{session_id}')
    
    def emit_node_unlinked(self, session_id: str, parent_id: UUID, 
                          child_id: UUID) -> None:
        """
        Broadcast node unlink event.
        
        Args:
            session_id: Session ID
            parent_id: Parent node UUID
            child_id: Child node UUID
        """
        payload = {
            'parent_id': str(parent_id),
            'child_id': str(child_id),
        }
        self._emit('graph:node-unlinked', payload, f'session_{session_id}')
    
    # ========================================================================
    # Property Events
    # ========================================================================
    
    def emit_property_changed(self, session_id: str, node_id: UUID, 
                             property_id: str, old_value: Any, 
                             new_value: Any) -> None:
        """
        Broadcast property change event.
        
        Args:
            session_id: Session ID
            node_id: Node UUID
            property_id: Property name
            old_value: Previous value
            new_value: New value
        """
        payload = {
            'node_id': str(node_id),
            'property_id': property_id,
            'old_value': old_value,
            'new_value': new_value,
        }
        self._emit('graph:property-changed', payload, f'session_{session_id}')
    
    def emit_property_deleted(self, session_id: str, node_id: UUID, 
                             property_id: str) -> None:
        """
        Broadcast property deletion event.
        
        Args:
            session_id: Session ID
            node_id: Node UUID
            property_id: Deleted property name
        """
        payload = {
            'node_id': str(node_id),
            'property_id': property_id,
        }
        self._emit('graph:property-deleted', payload, f'session_{session_id}')
    
    # ========================================================================
    # Command Events
    # ========================================================================
    
    def emit_command_executing(self, session_id: str, command_id: str, 
                              command_type: str) -> None:
        """
        Broadcast command execution start.
        
        Args:
            session_id: Session ID
            command_id: Unique command ID
            command_type: Type of command (e.g., 'CreateNodeCommand')
        """
        payload = {
            'command_id': command_id,
            'command_type': command_type,
        }
        self._emit('command:executing', payload, f'session_{session_id}')
    
    def emit_command_executed(self, session_id: str, command_id: str, 
                             command_type: str, result: Any = None) -> None:
        """
        Broadcast command execution completion.
        
        Args:
            session_id: Session ID
            command_id: Unique command ID
            command_type: Type of command
            result: Optional result value
        """
        payload = {
            'command_id': command_id,
            'command_type': command_type,
            'result': str(result) if result is not None else None,
        }
        self._emit('command:executed', payload, f'session_{session_id}')
    
    def emit_command_failed(self, session_id: str, command_id: str, 
                           command_type: str, error: str) -> None:
        """
        Broadcast command execution failure.
        
        Args:
            session_id: Session ID
            command_id: Unique command ID
            command_type: Type of command
            error: Error message
        """
        payload = {
            'command_id': command_id,
            'command_type': command_type,
            'error': error,
        }
        self._emit('command:failed', payload, f'session_{session_id}')
    
    def emit_command_undo(self, session_id: str, command_id: str) -> None:
        """
        Broadcast undo operation.
        
        Args:
            session_id: Session ID
            command_id: ID of command being undone
        """
        payload = {'command_id': command_id}
        self._emit('command:undo', payload, f'session_{session_id}')
    
    def emit_command_redo(self, session_id: str, command_id: str) -> None:
        """
        Broadcast redo operation.
        
        Args:
            session_id: Session ID
            command_id: ID of command being redone
        """
        payload = {'command_id': command_id}
        self._emit('command:redo', payload, f'session_{session_id}')
    
    # ========================================================================
    # Session Events
    # ========================================================================
    
    def emit_session_connected(self, session_id: str, client_count: int) -> None:
        """
        Broadcast client connection.
        
        Args:
            session_id: Session ID
            client_count: Number of clients in session
        """
        payload = {
            'session_id': session_id,
            'client_count': client_count,
        }
        self._emit('session:connected', payload, f'session_{session_id}')
    
    def emit_session_disconnected(self, session_id: str, client_count: int) -> None:
        """
        Broadcast client disconnection.
        
        Args:
            session_id: Session ID
            client_count: Number of remaining clients
        """
        payload = {
            'session_id': session_id,
            'client_count': client_count,
        }
        self._emit('session:disconnected', payload, f'session_{session_id}')
    
    # ========================================================================
    # Project Events
    # ========================================================================
    
    def emit_project_saved(self, session_id: str, project_id: str) -> None:
        """
        Broadcast project save completion.
        
        Args:
            session_id: Session ID
            project_id: Project UUID
        """
        payload = {'project_id': project_id}
        self._emit('project:saved', payload, f'session_{session_id}')
    
    def emit_project_loaded(self, session_id: str, project_id: str, 
                           graph_data: Dict[str, Any]) -> None:
        """
        Broadcast project load completion.
        
        Args:
            session_id: Session ID
            project_id: Project UUID
            graph_data: Serialized graph structure
        """
        payload = {
            'project_id': project_id,
            'graph': graph_data,
        }
        self._emit('project:loaded', payload, f'session_{session_id}')
```

### In `backend/websocket/__init__.py`

```python
"""
WebSocket module for real-time graph event broadcasting.
"""

from backend.websocket.broadcaster import WebSocketBroadcaster

_broadcaster = None

def set_broadcaster(socketio):
    """
    Initialize the broadcaster with a Socket.IO instance.
    Called once during app initialization.
    
    Args:
        socketio: Flask-SocketIO instance
    """
    global _broadcaster
    _broadcaster = WebSocketBroadcaster(socketio)

def get_broadcaster() -> WebSocketBroadcaster:
    """
    Get the global broadcaster instance.
    
    Returns:
        WebSocketBroadcaster instance or None if not initialized
    """
    return _broadcaster
```

---

## 3. Socket.IO Handlers

### In `backend/websocket/handlers.py`

```python
"""
WebSocket event handlers for Socket.IO connections.

Manages client connections, room membership, and session routing.
"""

import logging
from flask_socketio import emit, join_room, leave_room, disconnect
from flask import request

logger = logging.getLogger(__name__)

# Track active sessions and their clients
# session_id -> set of client socket ids
_session_clients = {}

def setup_websocket_handlers(socketio):
    """
    Register all WebSocket event handlers.
    
    Args:
        socketio: Flask-SocketIO instance
    """
    
    @socketio.on('connect', namespace='/graph')
    def handle_connect(auth):
        """
        Handle client connection to /graph namespace.
        Client must provide session_id in auth data.
        """
        client_id = request.sid
        session_id = auth.get('session_id') if auth else None
        
        logger.info(f"Client {client_id} connecting to /graph with session {session_id}")
        
        if not session_id:
            logger.warning(f"Client {client_id} rejected: no session_id provided")
            return False  # Reject connection
        
        try:
            # Add to session tracking
            if session_id not in _session_clients:
                _session_clients[session_id] = set()
            
            _session_clients[session_id].add(client_id)
            client_count = len(_session_clients[session_id])
            
            logger.info(f"Client {client_id} added to session {session_id} " +
                       f"(now {client_count} clients)")
            
            # Join room named after session
            room_name = f'session_{session_id}'
            join_room(room_name)
            
            # Notify other clients in session
            from backend.websocket import get_broadcaster
            broadcaster = get_broadcaster()
            if broadcaster:
                broadcaster.emit_session_connected(session_id, client_count)
            
            # Send welcome message to this client
            emit('session:connected', {
                'session_id': session_id,
                'client_count': client_count,
            })
            
            return True  # Accept connection
        
        except Exception as e:
            logger.error(f"Error in connect handler: {e}", exc_info=True)
            return False
    
    @socketio.on('disconnect', namespace='/graph')
    def handle_disconnect():
        """
        Handle client disconnection from /graph namespace.
        """
        client_id = request.sid
        
        logger.info(f"Client {client_id} disconnecting from /graph")
        
        try:
            # Find and remove from all sessions
            for session_id in list(_session_clients.keys()):
                if client_id in _session_clients[session_id]:
                    _session_clients[session_id].discard(client_id)
                    client_count = len(_session_clients[session_id])
                    
                    logger.info(f"Client {client_id} removed from session {session_id} " +
                               f"(now {client_count} clients)")
                    
                    # Notify remaining clients
                    from backend.websocket import get_broadcaster
                    broadcaster = get_broadcaster()
                    if broadcaster and client_count > 0:
                        broadcaster.emit_session_disconnected(session_id, client_count)
                    
                    # Clean up empty sessions
                    if client_count == 0:
                        del _session_clients[session_id]
                        logger.info(f"Session {session_id} is now empty")
            
        except Exception as e:
            logger.error(f"Error in disconnect handler: {e}", exc_info=True)
    
    @socketio.on_error_default
    def default_error_handler(e):
        """Handle WebSocket errors."""
        logger.error(f"WebSocket error: {e}", exc_info=True)

def get_session_client_count(session_id: str) -> int:
    """
    Get number of connected clients in a session.
    
    Args:
        session_id: Session ID
        
    Returns:
        Number of clients, 0 if session doesn't exist
    """
    return len(_session_clients.get(session_id, set()))

def get_session_clients(session_id: str) -> set:
    """
    Get set of client IDs in a session.
    
    Args:
        session_id: Session ID
        
    Returns:
        Set of client socket IDs
    """
    return _session_clients.get(session_id, set()).copy()
```

---

## 4. Session Context Management

### In `backend/websocket/context.py`

```python
"""
Thread-local session context for event emission.

Commands executed in request context need to know which session
they're operating in, so events are broadcast to the right clients.
"""

import threading
from typing import Optional

# Thread-local storage for current session
_session_context = threading.local()

def set_current_session(session_id: str) -> None:
    """
    Set the current session ID for this thread.
    
    Call this in request handlers before executing commands.
    
    Args:
        session_id: The session ID to set as current
    """
    _session_context.session_id = session_id

def get_current_session() -> Optional[str]:
    """
    Get the current session ID for this thread.
    
    Returns:
        The session ID, or None if not set
    """
    return getattr(_session_context, 'session_id', None)

def clear_current_session() -> None:
    """Clear the current session context."""
    if hasattr(_session_context, 'session_id'):
        delattr(_session_context, 'session_id')
```

---

## 5. Command Dispatcher Integration

### In `backend/handlers/dispatcher.py` - Modified

```python
"""
Command dispatcher with WebSocket event support.
"""

from typing import Any, List
from backend.handlers.command import Command
from backend.core.graph import ProjectGraph
from backend.infra.logging import LogManager
import uuid

class CommandDispatcher:
    """Manages command execution, undo, and redo with event broadcasting."""
    
    def __init__(self, graph: ProjectGraph, event_emitter=None):
        """
        Initialize the dispatcher with a project graph.
        
        Args:
            graph: The ProjectGraph to operate on
            event_emitter: Optional WebSocket broadcaster for events
        """
        self.graph = graph
        self.undo_stack: List[Command] = []
        self.redo_stack: List[Command] = []
        self.logger = LogManager()
        self.event_emitter = event_emitter  # NEW
    
    def execute(self, command: Command) -> Any:
        """
        Execute a command with event emission.
        
        Args:
            command: The Command to execute
            
        Returns:
            The result of the command's execute method
        """
        # Generate unique command ID for tracking
        command_id = str(uuid.uuid4())
        command_type = type(command).__name__
        
        # Emit executing event
        if self.event_emitter:
            from backend.websocket.context import get_current_session
            session_id = get_current_session()
            if session_id:
                self.event_emitter.emit_command_executing(
                    session_id, command_id, command_type
                )
        
        # Inject graph and event_emitter into command
        if hasattr(command, 'graph') and command.graph is None:
            command.graph = self.graph
        if hasattr(command, 'event_emitter') and not hasattr(command, '_has_event_emitter'):
            command.event_emitter = self.event_emitter
            command._has_event_emitter = True
        
        # Execute
        try:
            self.logger.emit("Dispatcher", "EXECUTE_START", {
                "command": command_type,
                "command_id": command_id
            })
            
            result = command.execute()
            
            self.undo_stack.append(command)
            self.redo_stack.clear()
            
            # Emit executed event
            if self.event_emitter:
                from backend.websocket.context import get_current_session
                session_id = get_current_session()
                if session_id:
                    self.event_emitter.emit_command_executed(
                        session_id, command_id, command_type, result
                    )
            
            self.logger.emit("Dispatcher", "EXECUTE_COMPLETE", {
                "command": command_type,
                "result": str(result) if result is not None else None
            })
            
            return result
        
        except Exception as e:
            # Emit failed event
            if self.event_emitter:
                from backend.websocket.context import get_current_session
                session_id = get_current_session()
                if session_id:
                    self.event_emitter.emit_command_failed(
                        session_id, command_id, command_type, str(e)
                    )
            
            self.logger.emit("Dispatcher", "EXECUTE_FAILED", {
                "command": command_type,
                "error": str(e)
            })
            
            raise
    
    def undo(self) -> None:
        """Undo the last command."""
        if self.undo_stack:
            command = self.undo_stack.pop()
            command.undo()
            self.redo_stack.append(command)
            
            # Emit undo event
            if self.event_emitter:
                from backend.websocket.context import get_current_session
                session_id = get_current_session()
                if session_id:
                    self.event_emitter.emit_command_undo(session_id, id(command))
    
    def redo(self) -> None:
        """Redo the last undone command."""
        if self.redo_stack:
            command = self.redo_stack.pop()
            command.execute()
            self.undo_stack.append(command)
            
            # Emit redo event
            if self.event_emitter:
                from backend.websocket.context import get_current_session
                session_id = get_current_session()
                if session_id:
                    self.event_emitter.emit_command_redo(session_id, id(command))
```

---

## 6. Node Command Integration

### In `backend/handlers/commands/node_commands.py` - Modified

```python
from uuid import UUID
from typing import Optional
from backend.handlers.command import Command
from backend.core.node import Node

class CreateNodeCommand(Command):
    """Command to create a new node in the graph."""
    
    def __init__(self, blueprint_type_id: str, name: str, 
                 graph=None, blueprint=None, event_emitter=None):
        self.blueprint_type_id = blueprint_type_id
        self.name = name
        self.graph = graph
        self.blueprint = blueprint
        self.event_emitter = event_emitter  # NEW
        self.node: Node = None
    
    def execute(self) -> UUID:
        """Execute the command by creating and adding a node."""
        if self.node is None:
            self.node = Node(blueprint_type_id=self.blueprint_type_id, name=self.name)
            self._initialize_default_status()
        
        if self.graph:
            self.graph.add_node(self.node)
        
        # NEW: Emit event
        if self.event_emitter:
            from backend.websocket.context import get_current_session
            session_id = get_current_session()
            if session_id:
                self.event_emitter.emit_node_created(
                    session_id,
                    self.node.id,
                    self.node.name,
                    self.blueprint_type_id
                )
        
        return self.node.id
    
    def _initialize_default_status(self) -> None:
        """Initialize default status from blueprint if available."""
        if not self.blueprint:
            return
        
        node_def = getattr(self.blueprint, "_node_type_map", {}).get(self.blueprint_type_id)
        if not node_def:
            return
        
        # Existing code...


class DeleteNodeCommand(Command):
    """Command to delete a node from the graph."""
    
    def __init__(self, node_id: UUID, graph=None, event_emitter=None):
        self.node_id = node_id
        self.graph = graph
        self.event_emitter = event_emitter  # NEW
        self.deleted_node: Optional[Node] = None
    
    def execute(self) -> None:
        """Execute the command by removing the node."""
        if self.graph:
            self.deleted_node = self.graph.get_node(self.node_id)
            self.graph.remove_node(self.node_id)
        
        # NEW: Emit event
        if self.event_emitter:
            from backend.websocket.context import get_current_session
            session_id = get_current_session()
            if session_id:
                self.event_emitter.emit_node_deleted(session_id, self.node_id)
    
    def undo(self) -> None:
        """Undo the command by restoring the node."""
        if self.deleted_node and self.graph:
            self.graph.add_node(self.deleted_node)
```

---

## 7. Routes Integration

### In `backend/api/routes.py` - Modified excerpt

```python
from flask import Blueprint, request, jsonify
from backend.websocket.context import set_current_session  # NEW
from backend.websocket import get_broadcaster  # NEW

api_bp = Blueprint('api', __name__, url_prefix='/api/v1')

@api_bp.before_request
def set_session_context():
    """Set session context for all API requests."""
    session_id = request.headers.get('X-Session-ID')
    if session_id:
        set_current_session(session_id)

@api_bp.route('/commands/execute', methods=['POST'])
def execute_command():
    """Execute a command."""
    try:
        session_id = request.headers.get('X-Session-ID')
        # ... existing code to get session data, create command ...
        
        # Get broadcaster for event emission
        broadcaster = get_broadcaster()  # NEW
        
        # Create dispatcher with broadcaster
        dispatcher = CommandDispatcher(
            graph=session_data['graph'],
            event_emitter=broadcaster  # NEW
        )
        
        # Execute command
        result = dispatcher.execute(command)
        
        return jsonify({
            'success': True,
            'result': result
        }), 200
    
    except Exception as e:
        # ... error handling ...
        pass
```

---

## 8. Client-Side Example (JavaScript)

### HTML/JavaScript client code

```javascript
// Connect to WebSocket
const socket = io('http://localhost:5000/graph', {
    auth: {
        session_id: 'your-session-id-here'
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
});

// Connection events
socket.on('connect', () => {
    console.log('Connected to graph WebSocket');
});

socket.on('disconnect', () => {
    console.log('Disconnected from WebSocket');
});

socket.on('session:connected', (data) => {
    console.log(`Session connected, ${data.client_count} clients online`);
});

// Graph events
socket.on('graph:node-created', (data) => {
    console.log('Node created:', data);
    // Update UI: Add node to tree
    addNodeToTree(data.node_id, data.name, data.parent_id);
});

socket.on('graph:node-deleted', (data) => {
    console.log('Node deleted:', data);
    // Update UI: Remove node from tree
    removeNodeFromTree(data.node_id);
});

socket.on('graph:property-changed', (data) => {
    console.log('Property changed:', data);
    // Update UI: Update property in inspector
    updatePropertyDisplay(data.node_id, data.property_id, data.new_value);
});

// Command events
socket.on('command:executing', (data) => {
    console.log('Command executing:', data.command_type);
    // Show spinner/loading indicator
});

socket.on('command:executed', (data) => {
    console.log('Command executed:', data.command_type);
    // Hide spinner
});

socket.on('command:failed', (data) => {
    console.error('Command failed:', data.error);
    // Show error message to user
});

// Error handling
socket.on('error', (error) => {
    console.error('WebSocket error:', error);
});
```

---

## Key Integration Principles

1. **Optional Dependency**: Commands work fine if broadcaster is None
2. **Thread-Safe**: Session context uses thread-local storage
3. **Non-Blocking**: Events emitted after command completes
4. **Backward Compatible**: Existing REST API unchanged
5. **Fail-Safe**: Errors in WebSocket don't crash commands
6. **Type-Safe**: Use UUIDs and proper types throughout

