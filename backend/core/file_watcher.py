"""
Shared Drive File Watcher

Watches project and template files for external modifications (e.g., from cloud sync
like Autodesk Desktop Connector or Dropbox) and triggers reload callbacks.

Handles:
- Debouncing rapid file system events (cloud sync tools fire multiple events)
- Self-echo protection (ignore events triggered by our own saves)
- Thread-safe operation with Flask/SocketIO
"""

import logging
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Set
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileModifiedEvent

logger = logging.getLogger(__name__)


class SharedDriveWatcher:
    """
    Watches project and template files for external changes.
    
    Features:
    - Debounced file change detection (500ms default)
    - Self-echo protection to ignore our own saves
    - Separate callbacks for project and template changes
    """
    
    def __init__(
        self,
        on_project_changed: Optional[Callable[[str], None]] = None,
        on_template_changed: Optional[Callable[[str], None]] = None,
        debounce_ms: int = 500
    ):
        """
        Initialize the file watcher.
        
        Args:
            on_project_changed: Callback when project file is externally modified.
                               Receives file path as argument.
            on_template_changed: Callback when template file is externally modified.
                                Receives file path as argument.
            debounce_ms: Milliseconds to wait before processing a file change
        """
        self.on_project_changed = on_project_changed
        self.on_template_changed = on_template_changed
        self.debounce_seconds = debounce_ms / 1000.0
        
        self.observer: Optional[Any] = None
        self.watched_files: Dict[str, str] = {}  # {normalized_path: file_type}
        self.pending_timers: Dict[str, threading.Timer] = {}
        self.ignored_paths: Set[str] = set()
        self.ignored_until: Dict[str, float] = {}
        self.lock = threading.Lock()
        
        logger.info(f"SharedDriveWatcher initialized (debounce={debounce_ms}ms)")
    
    def watch_project(self, project_path: str) -> None:
        """
        Add a project file to watch.
        
        Args:
            project_path: Absolute path to the project file
        """
        normalized = str(Path(project_path).resolve())
        with self.lock:
            self.watched_files[normalized] = 'project'
        logger.info(f"Watching project file: {normalized}")
        self._start_observer_if_needed()
    
    def watch_template(self, template_path: str) -> None:
        """
        Add a template file to watch.
        
        Args:
            template_path: Absolute path to the template file
        """
        normalized = str(Path(template_path).resolve())
        with self.lock:
            self.watched_files[normalized] = 'template'
        logger.info(f"Watching template file: {normalized}")
        self._start_observer_if_needed()
    
    def ignore_next_event(self, file_path: str) -> None:
        """
        Temporarily ignore the next modify event for a file.
        
        Call this immediately before saving a file to prevent
        the watcher from reloading the file we just saved.
        
        Args:
            file_path: Path to the file we're about to save
        """
        normalized = str(Path(file_path).resolve())
        expires_at = time.time() + 2.0
        with self.lock:
            self.ignored_paths.add(normalized)
            self.ignored_until[normalized] = expires_at
        logger.debug(f"Ignoring next event for: {normalized}")
    
    def stop(self) -> None:
        """Stop watching files and clean up resources."""
        with self.lock:
            # Cancel all pending timers
            for timer in self.pending_timers.values():
                timer.cancel()
            self.pending_timers.clear()
            
            # Stop observer
            if self.observer:
                self.observer.stop()
                self.observer.join(timeout=2.0)
                self.observer = None
            
            self.watched_files.clear()
            self.ignored_paths.clear()
            self.ignored_until.clear()
        
        logger.info("SharedDriveWatcher stopped")
    
    def _start_observer_if_needed(self) -> None:
        """Start the watchdog observer if not already running."""
        with self.lock:
            if self.observer is None and self.watched_files:
                self.observer = Observer()
                
                # Collect unique directories to watch
                directories = set()
                for file_path in self.watched_files.keys():
                    directories.add(str(Path(file_path).parent))
                
                # Schedule a handler for each directory
                event_handler = _FileChangeHandler(self)
                for directory in directories:
                    self.observer.schedule(event_handler, directory, recursive=False)
                    logger.debug(f"Observing directory: {directory}")
                
                self.observer.start()
                logger.info("File observer started")
    
    def _handle_file_modified(self, file_path: str) -> None:
        """
        Handle a file modification event (called by watchdog handler).
        
        This method debounces events and triggers the appropriate callback.
        
        Args:
            file_path: Path to the modified file
        """
        normalized = str(Path(file_path).resolve())
        
        with self.lock:
            # Check if this file is being watched
            if normalized not in self.watched_files:
                return
            
            # Check if we should ignore this event (self-echo protection)
            if normalized in self.ignored_paths:
                expires_at = self.ignored_until.get(normalized, 0.0)
                if time.time() <= expires_at:
                    logger.debug(f"Ignoring self-echo event for: {normalized}")
                    return
                # Expired ignore window: clean up markers and continue processing
                self.ignored_paths.discard(normalized)
                self.ignored_until.pop(normalized, None)
            
            file_type = self.watched_files[normalized]
            
            # Cancel any pending timer for this file
            if normalized in self.pending_timers:
                self.pending_timers[normalized].cancel()
            
            # Schedule a new debounced callback
            def debounced_callback():
                with self.lock:
                    self.pending_timers.pop(normalized, None)
                
                logger.info(f"External change detected: {file_type} file {normalized}")
                
                if file_type == 'project' and self.on_project_changed:
                    try:
                        self.on_project_changed(normalized)
                    except Exception as e:
                        logger.error(f"Error in on_project_changed callback: {e}", exc_info=True)
                elif file_type == 'template' and self.on_template_changed:
                    try:
                        self.on_template_changed(normalized)
                    except Exception as e:
                        logger.error(f"Error in on_template_changed callback: {e}", exc_info=True)
            
            timer = threading.Timer(self.debounce_seconds, debounced_callback)
            self.pending_timers[normalized] = timer
            timer.start()
            logger.debug(f"Debouncing {file_type} change for {normalized}")


class _FileChangeHandler(FileSystemEventHandler):
    """Internal watchdog event handler."""
    
    def __init__(self, watcher: SharedDriveWatcher):
        super().__init__()
        self.watcher = watcher
    
    def on_modified(self, event):
        """Handle file modification events."""
        if isinstance(event, FileModifiedEvent) and not event.is_directory:
            self.watcher._handle_file_modified(event.src_path)
