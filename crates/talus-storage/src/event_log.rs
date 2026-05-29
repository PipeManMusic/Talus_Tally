//! Append-only NDJSON event log.
//!
//! Each line is a single [`Event`] encoded by
//! [`crate::codec::encode_event`]. New events are appended; readers
//! get the full history in append order.

use std::path::{Path, PathBuf};

use talus_core::command::Event;
use talus_core::error::Result;

/// Append-only log of [`Event`]s persisted as newline-delimited JSON.
#[derive(Debug)]
pub struct EventLog {
    path: PathBuf,
}

impl EventLog {
    /// Open (or create) a log at `path`. The parent directory must
    /// already exist.
    ///
    /// # Errors
    /// Returns [`talus_core::error::Error::Io`] if the file cannot be
    /// created or opened for append.
    pub fn open(_path: impl Into<PathBuf>) -> Result<Self> {
        unimplemented!("event_log::open")
    }

    /// Append `event` to the log. Flushes and fsyncs before returning.
    ///
    /// # Errors
    /// Returns [`talus_core::error::Error::Serialization`] if encoding
    /// fails, or [`talus_core::error::Error::Io`] if the underlying
    /// write fails.
    pub fn append(&self, _event: &Event) -> Result<()> {
        unimplemented!("event_log::append")
    }

    /// Read every event in the log, in append order.
    ///
    /// # Errors
    /// Returns [`talus_core::error::Error::Io`] if the file cannot be
    /// read, or [`talus_core::error::Error::Serialization`] if any
    /// line fails to decode.
    pub fn read_all(&self) -> Result<Vec<Event>> {
        unimplemented!("event_log::read_all")
    }

    /// Path the log is bound to.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use talus_core::ids::NodeId;

    fn log() -> (EventLog, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let log = EventLog::open(dir.path().join("events.ndjson")).expect("open log");
        (log, dir)
    }

    #[test]
    fn read_all_on_empty_log_returns_empty_vec() {
        let (log, _dir) = log();
        assert_eq!(log.read_all().unwrap(), Vec::<Event>::new());
    }

    #[test]
    fn append_then_read_round_trips_one_event() {
        let (log, _dir) = log();
        let ev = Event::NodeInserted {
            node_id: NodeId::new(),
        };
        log.append(&ev).unwrap();
        assert_eq!(log.read_all().unwrap(), vec![ev]);
    }

    #[test]
    fn append_preserves_order() {
        let (log, _dir) = log();
        let a = Event::NodeInserted {
            node_id: NodeId::new(),
        };
        let b = Event::NodeInserted {
            node_id: NodeId::new(),
        };
        let c = Event::NodeInserted {
            node_id: NodeId::new(),
        };
        log.append(&a).unwrap();
        log.append(&b).unwrap();
        log.append(&c).unwrap();
        assert_eq!(log.read_all().unwrap(), vec![a, b, c]);
    }

    #[test]
    fn reopen_sees_prior_events() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("events.ndjson");
        let ev = Event::NodeInserted {
            node_id: NodeId::new(),
        };
        {
            let log = EventLog::open(&path).unwrap();
            log.append(&ev).unwrap();
        }
        let reopened = EventLog::open(&path).unwrap();
        assert_eq!(reopened.read_all().unwrap(), vec![ev]);
    }
}
