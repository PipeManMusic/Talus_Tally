"""
Entry point for running backend as a module: python -m backend
"""
from backend.app import create_app

if __name__ == '__main__':
    app = create_app()
    
    # Import socketio from app module
    from backend.app import socketio
    
    socketio.run(
        app, 
        debug=True, 
        host='127.0.0.1', 
        port=5000, 
        allow_unsafe_werkzeug=True
    )
