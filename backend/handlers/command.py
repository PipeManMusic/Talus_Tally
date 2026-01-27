from abc import ABC, abstractmethod
from typing import Any


class Command(ABC):
    """Abstract base class for all commands."""
    
    @abstractmethod
    def execute(self) -> Any:
        """Execute the command and return a result."""
        pass
    
    @abstractmethod
    def undo(self) -> None:
        """Undo the command."""
        pass
