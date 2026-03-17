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

  const refresh = useCallback(async () => {
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
      setLoading(true);
      setError(null);
      const result = await apiClient.getManpowerPayload(sessionId);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load manpower data');
      console.error('Error loading manpower:', err);
    } finally {
      setLoading(false);
      refreshingRef.current = false;
      if (refreshPendingRef.current) {
        refreshPendingRef.current = false;
        void refresh();
      }
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshSignal]);

  useWebSocket(live ? {
    onNodeCreated: refresh,
    onNodeUpdated: refresh,
    onNodeDeleted: refresh,
    onPropertyChanged: refresh,
  } : {});

  return {
    data,
    loading,
    error,
    refresh,
  };
}