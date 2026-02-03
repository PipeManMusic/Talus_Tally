import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '../api/client';
import type { Session } from '../api/client';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const newSession = await apiClient.createSession();
      setSession(newSession);
      // Store session ID in localStorage
      const sessionId = newSession.session_id || newSession.id || 'unknown';
      localStorage.setItem('sessionId', sessionId);
      return newSession;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create session';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSession = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const loadedSession = await apiClient.getSession(id);
      setSession(loadedSession);
      return loadedSession;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load session';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Restore session from localStorage on mount
  useEffect(() => {
    const savedSessionId = localStorage.getItem('sessionId');
    if (savedSessionId) {
      loadSession(savedSessionId).catch(console.error);
    }
  }, [loadSession]);

  return {
    session,
    loading,
    error,
    createSession,
    loadSession,
  };
}
