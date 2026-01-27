import pytest
from datetime import datetime
# This import will fail until you write backend/infra/logging.py
from backend.infra.logging import LogManager

def test_log_manager_singleton():
    """Verify LogManager maintains history and is a singleton."""
    logger1 = LogManager()
    logger2 = LogManager()
    assert logger1 is logger2
    
    logger1.clear()
    logger1.emit("TEST", "ACTION", {"value": 1})
    
    assert len(logger2.get_history()) == 1
    assert logger2.get_history()[0].payload["value"] == 1

def test_signal_flow_structure():
    """Verify logs contain strict timestamps and sources."""
    logger = LogManager()
    logger.clear()
    
    logger.emit("CORE", "UPDATE", {})
    event = logger.get_history()[0]
    
    assert isinstance(event.timestamp, datetime)
    assert event.source == "CORE"
    assert event.event_type == "UPDATE"