import { useCallback, useEffect, useRef, useState } from 'react';

import { apiClient, type ManpowerPayload } from '../api/client';
import { useWebSocket } from './useWebSocket';

interface UseManpowerPayloadOptions {
  sessionId?: string | null;
  refreshSignal?: number;
  live?: boolean;
}

interface UseManpowerPayloadResult {
  data: ManpowerPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Silently refresh without showing loading indicator. */
  silentRefresh: () => Promise<void>;
  /** Directly patch the local payload (for optimistic UI). */
  patchData: (updater: (prev: ManpowerPayload) => ManpowerPayload) => void;
}

export function useManpowerPayload({
  sessionId,
  refreshSignal,
  live = true,
}: UseManpowerPayloadOptions): UseManpowerPayloadResult {
  const [data, setData] = useState<ManpowerPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshPendingRef = useRef(false);
  const refreshingRef = useRef(false);

  const refresh = useCallback(async (silent = false) => {
    if (!sessionId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (refreshingRef.current) {
      refreshPendingRef.current = true;
      return;
    }

    refreshingRef.current = true;

    try {
      if (!silent) setLoading(true);
      setError(null);
      const result = await apiClient.getManpowerPayload(sessionId);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load manpower data');
      console.error('Error loading manpower:', err);
    } finally {
      if (!silent) setLoading(false);
      refreshingRef.current = false;
      if (refreshPendingRef.current) {
        refreshPendingRef.current = false;
        void refresh(silent);
      }
    }
  }, [sessionId]);

  const silentRefresh = useCallback(() => refresh(true), [refresh]);

  const patchData = useCallback(
    (updater: (prev: ManpowerPayload) => ManpowerPayload) => {
      setData((prev) => (prev ? updater(prev) : prev));
    },
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh, refreshSignal]);

  useWebSocket(live ? {
    onNodeCreated: silentRefresh,
    onNodeUpdated: silentRefresh,
    onNodeDeleted: silentRefresh,
    onPropertyChanged: silentRefresh,
  } : {});

  return {
    data,
    loading,
    error,
    refresh: useCallback(() => refresh(false), [refresh]),
    silentRefresh,
    patchData,
  };
}