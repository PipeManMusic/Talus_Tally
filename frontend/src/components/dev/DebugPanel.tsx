import { useState, useRef, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  type DebugLogEntry,
  getDebugLogSnapshot,
  getDebugLogCount,
  subscribeDebugLogs,
} from '../../store/debugLogStore';
import { filterDebugPanelLogs } from '../../config/debugPanelConfig';

export type { DebugLogEntry };

type DebugPanelProps = {
  treeNodes: unknown;
  expandedMap: unknown;
};

export function DebugPanel({ treeNodes, expandedMap }: DebugPanelProps) {
  const allLogs = useSyncExternalStore(subscribeDebugLogs, getDebugLogSnapshot);
  const totalLogs = useSyncExternalStore(subscribeDebugLogs, getDebugLogCount);
  const logs = useMemo(() => filterDebugPanelLogs(allLogs), [allLogs]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const formatEntriesForCopy = (entries: DebugLogEntry[]) => {
    if (entries.length === 0) return 'No logs captured yet.';
    return entries
      .map((entry) => `[${entry.time}] ${entry.level.toUpperCase()} ${entry.message}`)
      .join('\n');
  };

  const getLastTemplateDeleteTraceEntries = () => {
    const prefix = '[TemplateEditor::DELETE]';
    const requestMarker = `${prefix} Delete requested`;
    const endMarkers = [
      `${prefix} Delete API/update succeeded`,
      `${prefix} Delete API/update failed`,
      `${prefix} User cancelled deletion`,
    ];

    const lastRequestIndex = [...logs]
      .map((entry, index) => ({ entry, index }))
      .reverse()
      .find(({ entry }) => entry.message.includes(requestMarker))?.index;

    if (lastRequestIndex === undefined) {
      return logs.filter((entry) => entry.message.includes(prefix));
    }

    let endIndex = logs.length - 1;
    for (let i = lastRequestIndex; i < logs.length; i += 1) {
      if (endMarkers.some((marker) => logs[i].message.includes(marker))) {
        endIndex = i;
        break;
      }
    }

    return logs.slice(lastRequestIndex, endIndex + 1);
  };

  const formatLogsForCopy = () => {
    return formatEntriesForCopy(logs);
  };

  const formatLastTemplateDeleteTraceForCopy = () => {
    const entries = getLastTemplateDeleteTraceEntries();
    if (entries.length === 0) {
      return 'No TemplateEditor::DELETE logs captured yet.';
    }
    return formatEntriesForCopy(entries);
  };

  const handleCopyLogs = async () => {
    const text = formatLogsForCopy();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch (err) {
      // fall back to execCommand
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };

  const handleCopyTemplateDeleteTrace = async () => {
    const text = formatLastTemplateDeleteTraceForCopy();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch (err) {
      // fall back to execCommand
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={panelRef} style={{ position: 'fixed', bottom: 0, right: 0, zIndex: 9999, background: '#222', color: '#fff', fontSize: 12, minWidth: 320, maxWidth: 480, maxHeight: 400, overflow: 'auto', borderTopLeftRadius: 8, border: '1px solid #444', opacity: 0.95 }}>
      <button style={{ width: '100%', background: '#333', color: '#fff', border: 'none', padding: 4, cursor: 'pointer', borderTopLeftRadius: 8 }} onClick={() => setOpen(o => !o)}>
        {open ? '▼' : '▲'} Debug Panel
      </button>
      {open && (
        <div style={{ padding: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div><b>Debug Logs</b></div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                style={{ background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', fontSize: 11 }}
                onClick={handleCopyTemplateDeleteTrace}
                title="Copy only the last TemplateEditor delete trace"
              >
                Copy Last Delete Trace
              </button>
              <button
                style={{ background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', fontSize: 11 }}
                onClick={handleCopyLogs}
              >
                Copy Logs
              </button>
            </div>
          </div>
          <div style={{ color: '#8ecae6', fontSize: 10, marginBottom: 4 }}>
            Showing {logs.length} of {totalLogs} captured entries
          </div>
          <div style={{ background: '#111', color: '#ccc', fontSize: 11, maxHeight: 160, overflow: 'auto', padding: 6 }}>
            {logs.length === 0 && <div>No logs captured yet.</div>}
            {logs.map((entry) => {
              const color = entry.level === 'error'
                ? '#ff6b6b'
                : entry.level === 'warn'
                  ? '#ffd166'
                  : entry.level === 'info'
                    ? '#4cc9f0'
                    : entry.level === 'debug'
                      ? '#bdb2ff'
                      : '#c7f9cc';
              return (
                <div key={entry.id} style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  [{entry.time}] {entry.level.toUpperCase()} {entry.message}
                </div>
              );
            })}
          </div>
          <div><b>Tree Nodes</b></div>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#222', color: '#0f0', fontSize: 11 }}>{JSON.stringify(treeNodes, null, 2)}</pre>
          <div><b>Expanded Map</b></div>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#222', color: '#0ff', fontSize: 11 }}>{JSON.stringify(expandedMap, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
