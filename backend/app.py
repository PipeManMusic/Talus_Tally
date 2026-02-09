"""
Talus Core REST API Server

Exposes the Python backend (Layers 1-4) as JSON/REST endpoints.
No business logic here - just serialization and API wrapping.

Layer 5: REST API Bridge
"""

import os
import sys
from pathlib import Path

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    # Load from project root
    env_path = Path(__file__).parent.parent / '.env'
    if env_path.exists():
        load_dotenv(env_path)
        print(f"[ENV] Loaded .env from {env_path}")
        print(f"[ENV] TALUS_ENV={os.getenv('TALUS_ENV', 'not set')}")
except ImportError:
    print("[WARN] python-dotenv not installed; skipping .env file")

from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from flask_socketio import SocketIO
import logging

# Configure logging
import sys
is_production = getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS')

log_level = logging.WARNING if is_production else logging.INFO
logging.basicConfig(
    level=log_level,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Suppress Werkzeug logging in production
if is_production:
    logging.getLogger('werkzeug').setLevel(logging.ERROR)
    logging.getLogger('socketio').setLevel(logging.ERROR)
    logging.getLogger('engineio').setLevel(logging.ERROR)

# Get the directory of this file for relative path resolution
BACKEND_DIR = Path(__file__).parent.parent
# Static files directory - check multiple locations
# 1. Development: frontend/dist in source tree
STATIC_DIR = BACKEND_DIR / 'frontend' / 'dist'
if not STATIC_DIR.exists():
    # 2. Packaged: /opt/talus-tally/dist
    STATIC_DIR = Path('/opt/talus-tally/dist')
if not STATIC_DIR.exists():
    # 3. PyInstaller temporary: _internal/frontend/dist
    STATIC_DIR = Path(getattr(sys, '_MEIPASS', '.')) / 'frontend' / 'dist'
if not STATIC_DIR.exists():
    STATIC_DIR = None
    
logger.info(f"Static files directory: {STATIC_DIR if STATIC_DIR else 'Not configured (dev mode)'}")

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
    # Explicitly use threading mode for PyInstaller compatibility
    # Auto-detection fails in frozen executables
    socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')
    
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
    
    # Serve static frontend files if available
    if STATIC_DIR and STATIC_DIR.exists():
        @app.route('/')
        def index():
            """Serve the main index.html for React app."""
            return send_file(STATIC_DIR / 'index.html')
        
        @app.route('/<path:path>')
        def serve_static(path):
            """Serve static assets from dist folder."""
            file_path = STATIC_DIR / path
            if file_path.exists() and file_path.is_file():
                return send_file(file_path)
            # For any non-asset routes, serve index.html (React Router compatibility)
            if not path.startswith('api/'):
                return send_file(STATIC_DIR / 'index.html')
            return jsonify({'error': 'Not found'}), 404
    
    # Register API routes
    from backend.api.routes import register_routes
    register_routes(app)
    
    # Register export routes
    from backend.api.export_routes import export_bp
    app.register_blueprint(export_bp)
    
    # Register velocity routes
    from backend.api.velocity_routes import velocity_bp
    app.register_blueprint(velocity_bp)
    
    # Register WebSocket namespace for /graph
    from backend.api.socketio_handlers import GraphNamespace
    socketio.on_namespace(GraphNamespace('/graph'))

    logger.info("Flask app created successfully with Socket.IO")
    return app


if __name__ == '__main__':
    app = create_app()
    
    # Check if running as background daemon (via TALUS_DAEMON env var)
    # When running in background, Flask's reloader causes SIGTTOU/SIGTTIN job control signals
    is_daemon = os.environ.get('TALUS_DAEMON', '').lower() in ('1', 'true', 'yes')
    
    # Disable reloader when running as daemon to avoid terminal job control issues
    use_reloader = not is_daemon
    
    if is_daemon:
        logger.info("Running in daemon mode - reloader disabled")
    
    socketio.run(app, debug=True, host='127.0.0.1', port=5000, 
                 allow_unsafe_werkzeug=True, use_reloader=use_reloader)
