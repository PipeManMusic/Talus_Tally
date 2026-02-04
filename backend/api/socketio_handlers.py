"""
WebSocket namespace handlers for Socket.IO.

Manages client connections, room management, and event subscriptions.
Each client must join a session room to receive updates for that session.
"""

import logging
from flask_socketio import Namespace, emit, join_room, leave_room
from flask import request
from backend.api.broadcaster import emit_session_connected, emit_session_disconnected

logger = logging.getLogger(__name__)

# Track active client connections
# Format: {session_id: set(client_ids)}
_session_clients = {}


def get_session_client_count(session_id):
    """Get the number of active clients in a session."""
    return len(_session_clients.get(session_id, set()))


def update_session_metadata(session_id, active_clients):
    """Update session metadata with client count (called from routes module)."""
    # Import here to avoid circular import
    from backend.api import routes
    if hasattr(routes, '_session_metadata') and session_id in routes._session_metadata:
        routes._session_metadata[session_id]['active_clients'] = active_clients


class GraphNamespace(Namespace):
    """WebSocket namespace for graph events."""
    
    def on_connect(self):
        """Handle client connection."""
        sid = request.sid
        logger.info(f"Client connected: {sid}")
        return True

    def on_disconnect(self):
        """Handle client disconnection."""
        sid = request.sid
        logger.info(f"Client disconnected: {sid}")
        # Remove client from all session rooms
        for session_id in list(_session_clients.keys()):
            if sid in _session_clients[session_id]:
                _session_clients[session_id].remove(sid)
                # Update session metadata
                client_count = len(_session_clients[session_id])
                update_session_metadata(session_id, client_count)
                # Emit disconnection event
                emit_session_disconnected(session_id, sid)
                logger.debug(f"Client {sid} removed from session {session_id}")

    def on_join_session(self, data):
        """
        Join a session room to receive updates.
        
        Expected data:
        {
            "session_id": "<uuid>"
        }
        """
        from flask import request
        sid = request.sid
        session_id = data.get('session_id')

        if not session_id:
            logger.error(f"join_session: Missing session_id from client {sid}, data={data}")
            emit('error', {'message': 'Missing session_id'}, to=sid)
            return

        # Join Socket.IO room
        join_room(session_id, sid=sid)

        # Track client in session
        if session_id not in _session_clients:
            _session_clients[session_id] = set()
        _session_clients[session_id].add(sid)

        # Update session metadata
        client_count = len(_session_clients[session_id])
        update_session_metadata(session_id, client_count)

        # Emit connection event
        emit_session_connected(session_id, sid)

        logger.info(f"Client {sid} joined session {session_id}")
        emit('joined', {
            'session_id': session_id,
            'client_id': sid,
            'active_clients': client_count
        }, to=sid)
    
    def on_leave_session(self, data):
        """
        Leave a session room.
        
        Expected data:
        {
            "session_id": "<uuid>"
        }
        """
        from flask import request
        sid = request.sid
        session_id = data.get('session_id')

        if not session_id:
            logger.error(f"leave_session: Missing session_id from client {sid}, data={data}")
            emit('error', {'message': 'Missing session_id'}, to=sid)
            return

        # Leave Socket.IO room
        leave_room(session_id, sid=sid)

        # Remove client from session tracking
        if session_id in _session_clients and sid in _session_clients[session_id]:
            _session_clients[session_id].remove(sid)

            # Update session metadata
            client_count = len(_session_clients[session_id])
            update_session_metadata(session_id, client_count)

            # Emit disconnection event
            emit_session_disconnected(session_id, sid)
            logger.debug(f"Client {sid} removed from session {session_id}")

        emit('left', {
            'session_id': session_id,
            'client_id': sid,
        }, to=sid)
    
    def on_ping(self, data=None):
        from flask import request
        sid = request.sid
        emit('pong', to=sid)
