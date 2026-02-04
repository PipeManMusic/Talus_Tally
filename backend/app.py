"""
Talus Core REST API Server

Exposes the Python backend (Layers 1-4) as JSON/REST endpoints.
No business logic here - just serialization and API wrapping.

Layer 5: REST API Bridge
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO
import logging
import os
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global Socket.IO instance
socketio = None


def create_app(config=None):
    """
    Create and configure Flask application with Socket.IO.
    
    Args:
        config: Optional dict with configuration overrides
        
    Returns:
        Flask application instance
    """
    global socketio
    
    app = Flask(__name__)
    
    # Initialize Socket.IO
    socketio = SocketIO(app, cors_allowed_origins="*")
    
    # Enable CORS for development with explicit configuration
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)
    
    # Configuration
    app.config.update({
        'JSON_SORT_KEYS': False,
        'JSONIFY_PRETTYPRINT_REGULAR': False,
    })
    
    if config:
        app.config.update(config)
    
    # Initialize broadcaster with Socket.IO instance
    from backend.api.broadcaster import initialize_socketio
    initialize_socketio(socketio)
    
    # Global error handlers
    @app.errorhandler(400)
    def bad_request(error):
        """Handle bad request errors."""
        return jsonify({
            'error': {
                'code': 'INVALID_REQUEST',
                'message': str(error.description)
            }
        }), 400
    
    @app.errorhandler(404)
    def not_found(error):
        """Handle 404 errors."""
        return jsonify({
            'error': {
                'code': 'NOT_FOUND',
                'message': 'Endpoint not found'
            }
        }), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        """Handle internal server errors."""
        logger.error(f"Internal server error: {error}")
        return jsonify({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': 'Internal server error'
            }
        }), 500
    
    # Health check endpoint (legacy, also in routes)
    @app.route('/api/v1/health', methods=['GET'])
    def health_check():
        """Health check endpoint."""
        return jsonify({'status': 'ok'}), 200
    
    # Register API routes
    from backend.api.routes import register_routes
    register_routes(app)
    
    # Register WebSocket namespace for /graph
    from backend.api.socketio_handlers import GraphNamespace
    socketio.on_namespace(GraphNamespace('/graph'))

    logger.info("Flask app created successfully with Socket.IO")
    return app


if __name__ == '__main__':
    app = create_app()
    socketio.run(app, debug=True, host='127.0.0.1', port=5000, allow_unsafe_werkzeug=True)
