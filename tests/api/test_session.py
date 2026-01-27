import pytest
# This import will fail until you write backend/api/session.py
from backend.api.session import SessionManager

def test_selection_tracking():
    """Phase 5.2: Verify selection state."""
    session = SessionManager()
    session.select("node-1")
    
    assert session.selection == ["node-1"]
    
    session.clear_selection()
    assert session.selection == []