/**
 * External debug log store — completely decoupled from React state.
 *
 * Previously, every console.log triggered `setDebugLogs()` in App.tsx,
 * causing a full App re-render on every log message.  Moving the buffer
 * outside React means logging never forces component re-renders in the
 * main tree.  Only DebugPanel subscribes (via useSyncExternalStore) so
 * only that small leaf component updates when new entries arrive.
 */

export type DebugLogEntry = {
  id: number;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  time: string;
  message: string;
};

const MAX_ENTRIES = 10_000;

let logs: DebugLogEntry[] = [];
let counter = 0;
const listeners = new Set<() => void>();

export function pushDebugLog(level: DebugLogEntry['level'], message: string): void {
  counter++;
  const entry: DebugLogEntry = {
    id: counter,
    level,
    time: new Date().toISOString().slice(11, 23),
    message,
  };
  if (logs.length >= MAX_ENTRIES) {
    logs = [...logs.slice(logs.length - MAX_ENTRIES + 1), entry];
  } else {
    logs = [...logs, entry];
  }
  for (const fn of listeners) fn();
}

export function getDebugLogSnapshot(): DebugLogEntry[] {
  return logs;
}

export function getDebugLogCount(): number {
  return counter;
}

export function subscribeDebugLogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
