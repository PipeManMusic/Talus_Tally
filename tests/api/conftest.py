import os
import subprocess
import time
import requests
import pytest
import sys

@pytest.fixture(scope="session", autouse=True)
def backend_server():
    """Start the backend server for API tests, and stop it after tests complete."""
    # Use the .venv python and run backend as module
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
    python_bin = os.path.join(project_root, '.venv/bin/python')
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTHONPATH"] = project_root
    
    # Start the server - run as module to avoid import issues
    proc = subprocess.Popen(
        [python_bin, '-m', 'backend'],
        cwd=project_root,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    # Wait for server to be ready
    url = "http://localhost:5000/api/v1/sessions"
    for i in range(60):  # Increased timeout to 60 seconds
        try:
            resp = requests.get(url, timeout=1)
            if resp.status_code < 500:
                break
        except Exception as e:
            time.sleep(1)
    else:
        # Server didn't start - collect output and fail
        proc.terminate()
        stdout, stderr = proc.communicate(timeout=5)
        error_msg = f"Backend server did not start in time.\nSTDOUT:\n{stdout}\nSTDERR:\n{stderr}"
        raise RuntimeError(error_msg)
    
    yield
    
    # Cleanup
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except Exception:
        proc.kill()
