"""
Event broadcaster for WebSocket real-time updates.

Manages Socket.IO event emissions for graph changes, command execution,
and property updates. Decoupled from Socket.IO implementation to allow
easy testing and potential future transport changes.

This module uses a simple pub/sub pattern: other modules emit events
via global broadcast functions, and Socket.IO handlers subscribe to them.
"""

import logging
from typing import Callable, Dict, List, Any
from threading import Lock

logger = logging.getLogger(__name__)

# Global registry of event subscribers
# Format: {event_type: [callback_functions]}
_subscribers: Dict[str, List[Callable]] = {}
_subscribers_lock = Lock()

# Global Socket.IO instance (set by app initialization)
_socketio = None


def initialize_socketio(socketio):
    """
    Initialize the broadcaster with a Socket.IO instance.
    
    Args:
        socketio: python-socketio SocketIO instance
    """
    global _socketio
    _socketio = socketio
    logger.info("Broadcaster initialized with Socket.IO")


def subscribe(event_type: str, callback: Callable):
    """
    Subscribe to an event type.
    
    Args:
        event_type: Name of event (e.g., 'node-created', 'property-changed')
        callback: Function to call when event fires. Signature: callback(data)
    """
    with _subscribers_lock:
        if event_type not in _subscribers:
            _subscribers[event_type] = []
        _subscribers[event_type].append(callback)
    logger.debug(f"Subscriber registered for {event_type}")


def unsubscribe(event_type: str, callback: Callable):
    """
    Unsubscribe from an event type.
    
    Args:
        event_type: Name of event
        callback: The callback function to remove
    """
    with _subscribers_lock:
        if event_type in _subscribers and callback in _subscribers[event_type]:
            _subscribers[event_type].remove(callback)


def emit_event(event_type: str, data: Dict[str, Any], room: str = None, skip_sid: bool = None):
    """
    Emit an event to all subscribers and Socket.IO clients.
    
    Args:
        event_type: Type of event (e.g., 'node-created')
        data: Event data payload
        room: Optional Socket.IO room to emit to (defaults to broadcast to all)
        skip_sid: If set, don't emit to that sender session ID
    """
    # Notify local subscribers
    with _subscribers_lock:
        callbacks = _subscribers.get(event_type, []).copy()
    
    for callback in callbacks:
        try:
            callback(data)
        except Exception as e:
            logger.error(f"Error in subscriber for {event_type}: {e}")
    
    # Emit via Socket.IO if available
    if _socketio:
        try:
            namespace = '/graph'
            if room:
                # Emit to specific room in /graph namespace
                _socketio.emit(event_type, data, room=room, skip_sid=skip_sid, namespace=namespace)
            else:
                # Broadcast to all connected clients in /graph namespace
                _socketio.emit(event_type, data, skip_sid=skip_sid, namespace=namespace)
            logger.debug(f"Event emitted: {event_type} to room: {room or 'broadcast'} in namespace: {namespace}")
        except Exception as e:
            logger.error(f"Error emitting Socket.IO event {event_type}: {e}")


# ============================================================================
# High-level event emission functions for common event types
# ============================================================================

def emit_node_created(session_id: str, node_id: str, parent_id: str, 
                     blueprint_type_id: str, name: str):
    """Emit when a node is created."""
    emit_event('node-created', {
        'session_id': session_id,
        'node_id': node_id,
        'parent_id': parent_id,
        'blueprint_type_id': blueprint_type_id,
        'name': name,
    }, room=session_id)


def emit_node_deleted(session_id: str, node_id: str):
    """Emit when a node is deleted."""
    emit_event('node-deleted', {
        'session_id': session_id,
        'node_id': node_id,
    }, room=session_id)


def emit_node_updated(session_id: str, node_id: str):
    """Emit when a node is updated (properties, blocking relationships, etc)."""
    emit_event('node-updated', {
        'session_id': session_id,
        'node_id': node_id,
    }, room=session_id)


def emit_node_linked(session_id: str, parent_id: str, child_id: str):
    """Emit when a node is linked to another."""
    emit_event('node-linked', {
        'session_id': session_id,
        'parent_id': parent_id,
        'child_id': child_id,
    }, room=session_id)


def emit_node_unlinked(session_id: str, parent_id: str, child_id: str):
    """Emit when a node is unlinked from its parent."""
    emit_event('node-unlinked', {
        'session_id': session_id,
        'parent_id': parent_id,
        'child_id': child_id,
    }, room=session_id)


def emit_property_changed(session_id: str, node_id: str, property_name: str, 
                         old_value: Any, new_value: Any):
    """Emit when a node property changes."""
    emit_event('property-changed', {
        'session_id': session_id,
        'node_id': node_id,
        'property_name': property_name,
        'old_value': old_value,
        'new_value': new_value,
    }, room=session_id)


def emit_property_deleted(session_id: str, node_id: str, property_name: str):
    """Emit when a node property is deleted."""
    emit_event('property-deleted', {
        'session_id': session_id,
        'node_id': node_id,
        'property_name': property_name,
    }, room=session_id)


def emit_command_executing(session_id: str, command_id: str, command_type: str):
    """Emit when a command starts executing."""
    emit_event('command-executing', {
        'session_id': session_id,
        'command_id': command_id,
        'command_type': command_type,
    }, room=session_id)


def emit_command_executed(session_id: str, command_id: str, success: bool, 
                         error: str = None):
    """Emit when a command finishes executing."""
    emit_event('command-executed', {
        'session_id': session_id,
        'command_id': command_id,
        'success': success,
        'error': error,
    }, room=session_id)


def emit_undo(session_id: str, command_id: str):
    """Emit when undo is performed."""
    emit_event('undo', {
        'session_id': session_id,
        'command_id': command_id,
    }, room=session_id)


def emit_redo(session_id: str, command_id: str):
    """Emit when redo is performed."""
    emit_event('redo', {
        'session_id': session_id,
        'command_id': command_id,
    }, room=session_id)


def emit_session_connected(session_id: str, client_id: str):
    """Emit when a client connects to a session."""
    emit_event('session-connected', {
        'session_id': session_id,
        'client_id': client_id,
    }, room=session_id)


def emit_session_disconnected(session_id: str, client_id: str):
    """Emit when a client disconnects from a session."""
    emit_event('session-disconnected', {
        'session_id': session_id,
        'client_id': client_id,
    }, room=session_id)
