"""
Entry point for running backend as a module: python -m backend
"""
import sys
import os
import signal

# Ensure user data dir is populated with defaults on first run
try:
    from backend.infra.first_run_copy import ensure_user_data_populated
    ensure_user_data_populated()
except Exception as e:
    import logging
    logging.warning(f"[Startup] Failed to copy default templates/assets to user data dir: {e}")

from backend.app import create_app

if __name__ == '__main__':
    app = create_app()
    
    # Import socketio from app module
    from backend.app import socketio

    # Graceful shutdown on SIGTERM (sent by Tauri on app close)
    def _shutdown(signum, frame):
        print(f"[Backend] Received signal {signum}, shutting down...")
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)
    
    # Always allow unsafe werkzeug for now since we're using Flask/Werkzeug as the production server
    # In a real production deployment, you'd use gunicorn/waitress instead
    socketio.run(
        app, 
        debug=False,  # Never debug in packaged mode
        host='127.0.0.1', 
        port=5000, 
        allow_unsafe_werkzeug=True  # Required for packaged deployments
    )
