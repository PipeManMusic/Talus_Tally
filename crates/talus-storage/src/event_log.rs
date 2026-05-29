//! Append-only NDJSON event log.
//!
//! Each line is a single [`Event`] encoded by
//! [`crate::codec::encode_event`]. New events are appended; readers
//! get the full history in append order.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

use talus_core::command::Event;
use talus_core::error::{Error, Result};

use crate::codec::{decode_event, encode_event};

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
    pub fn open(path: impl Into<PathBuf>) -> Result<Self> {
        let path = path.into();
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| io_err(&e))?;
        Ok(Self { path })
    }

    /// Append `event` to the log. Flushes and fsyncs before returning.
    ///
    /// # Errors
    /// Returns [`talus_core::error::Error::Serialization`] if encoding
    /// fails, or [`talus_core::error::Error::Io`] if the underlying
    /// write fails.
    pub fn append(&self, event: &Event) -> Result<()> {
        let mut bytes = encode_event(event)?;
        bytes.push(b'\n');
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
            .map_err(|e| io_err(&e))?;
        file.write_all(&bytes).map_err(|e| io_err(&e))?;
        file.sync_all().map_err(|e| io_err(&e))?;
        Ok(())
    }

    /// Read every event in the log, in append order.
    ///
    /// # Errors
    /// Returns [`talus_core::error::Error::Io`] if the file cannot be
    /// read, or [`talus_core::error::Error::Serialization`] if any
    /// line fails to decode.
    pub fn read_all(&self) -> Result<Vec<Event>> {
        let bytes = std::fs::read(&self.path).map_err(|e| io_err(&e))?;
        let mut out = Vec::new();
        for line in bytes.split(|b| *b == b'\n') {
            if line.is_empty() {
                continue;
            }
            out.push(decode_event(line)?);
        }
        Ok(out)
    }

    /// Path the log is bound to.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Empty the log, discarding every event. The file is preserved
    /// (subsequent `read_all` returns an empty `Vec`).
    ///
    /// Used by snapshot+truncate cycles: write a `Project` snapshot
    /// elsewhere, then call `truncate` so the log restarts from the
    /// snapshot's point in time.
    ///
    /// # Errors
    /// Returns [`talus_core::error::Error::Io`] if the file cannot be
    /// truncated.
    pub fn truncate(&self) -> Result<()> {
        let _ = self;
        unimplemented!("event_log::truncate")
    }
}

fn io_err(e: &std::io::Error) -> Error {
    Error::Io(e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use talus_core::ids::NodeTypeId;
    use talus_core::node::Node;

    fn sample_event() -> Event {
        Event::NodeInserted(Node::new(NodeTypeId::new(), "n"))
    }

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
        let ev = sample_event();
        log.append(&ev).unwrap();
        assert_eq!(log.read_all().unwrap(), vec![ev]);
    }

    #[test]
    fn append_preserves_order() {
        let (log, _dir) = log();
        let a = sample_event();
        let b = sample_event();
        let c = sample_event();
        log.append(&a).unwrap();
        log.append(&b).unwrap();
        log.append(&c).unwrap();
        assert_eq!(log.read_all().unwrap(), vec![a, b, c]);
    }

    #[test]
    fn reopen_sees_prior_events() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("events.ndjson");
        let ev = sample_event();
        {
            let log = EventLog::open(&path).unwrap();
            log.append(&ev).unwrap();
        }
        let reopened = EventLog::open(&path).unwrap();
        assert_eq!(reopened.read_all().unwrap(), vec![ev]);
    }

    #[test]
    fn truncate_empties_the_log() {
        let (log, _dir) = log();
        log.append(&sample_event()).unwrap();
        log.append(&sample_event()).unwrap();
        assert_eq!(log.read_all().unwrap().len(), 2);
        log.truncate().unwrap();
        assert_eq!(log.read_all().unwrap(), Vec::<Event>::new());
    }

    #[test]
    fn append_after_truncate_starts_fresh() {
        let (log, _dir) = log();
        log.append(&sample_event()).unwrap();
        log.truncate().unwrap();
        let next = sample_event();
        log.append(&next).unwrap();
        assert_eq!(log.read_all().unwrap(), vec![next]);
    }

    #[test]
    fn truncate_survives_reopen() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("events.ndjson");
        {
            let log = EventLog::open(&path).unwrap();
            log.append(&sample_event()).unwrap();
            log.truncate().unwrap();
        }
        let reopened = EventLog::open(&path).unwrap();
        assert_eq!(reopened.read_all().unwrap(), Vec::<Event>::new());
    }
}
