from datetime import datetime
from typing import List, Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class LogEvent:
    """Represents a single log event."""
    timestamp: datetime
    source: str
    event_type: str
    payload: Dict[str, Any]


class LogManager:
    """Singleton log manager for tracking system events."""
    
    _instance = None
    
    def __new__(cls):
        """Implement singleton pattern."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        """Initialize the log manager (only runs once due to singleton)."""
        if self._initialized:
            return
        self._history: List[LogEvent] = []
        self._initialized = True
    
    def emit(self, source: str, event_type: str, payload: Dict[str, Any]) -> None:
        """
        Emit a log event.
        
        Args:
            source: The source of the event (e.g., "CORE", "Dispatcher")
            event_type: The type of event (e.g., "UPDATE", "EXECUTE_COMPLETE")
            payload: Additional data about the event
        """
        event = LogEvent(
            timestamp=datetime.now(),
            source=source,
            event_type=event_type,
            payload=payload
        )
        self._history.append(event)
    
    def get_history(self, source: Optional[str] = None) -> List[LogEvent]:
        """
        Get the event history, optionally filtered by source.
        
        Args:
            source: Optional source filter
            
        Returns:
            List of log events
        """
        if source is None:
            return self._history.copy()
        return [event for event in self._history if event.source == source]
    
    def clear(self) -> None:
        """Clear the event history."""
        self._history.clear()
