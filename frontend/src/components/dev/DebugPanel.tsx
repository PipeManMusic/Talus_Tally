import { useState, useRef, useEffect } from 'react';

export type DebugLogEntry = {
  id: number;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  time: string;
  message: string;
};

type DebugPanelProps = {
  treeNodes: unknown;
  expandedMap: unknown;
  logs?: DebugLogEntry[];
};

export function DebugPanel({ treeNodes, expandedMap, logs = [] }: DebugPanelProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const formatLogsForCopy = () => {
    if (logs.length === 0) return 'No logs captured yet.';
    return logs
      .map((entry) => `[${entry.time}] ${entry.level.toUpperCase()} ${entry.message}`)
      .join('\n');
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
            <button
              style={{ background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', fontSize: 11 }}
              onClick={handleCopyLogs}
            >
              Copy Logs
            </button>
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
