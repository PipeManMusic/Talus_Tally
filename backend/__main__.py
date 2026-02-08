"""
Entry point for running backend as a module: python -m backend
"""
import sys
import os
from backend.app import create_app

if __name__ == '__main__':
    app = create_app()
    
    # Import socketio from app module
    from backend.app import socketio
    
    # Detect if running as PyInstaller executable
    # In production/packaged mode, always allow unsafe werkzeug since we're using it as the app server
    is_production = getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS')
    
    # Always allow unsafe werkzeug for now since we're using Flask/Werkzeug as the production server
    # In a real production deployment, you'd use gunicorn/waitress instead
    socketio.run(
        app, 
        debug=False,  # Never debug in packaged mode
        host='127.0.0.1', 
        port=5000, 
        allow_unsafe_werkzeug=True  # Required for packaged deployments
    )
