import { useCallback, useEffect } from 'react';
import { useWebSocket } from './useWebSocket';
import { useGraphStore } from '@/store';

/**
 * Hook for real-time graph synchronization via WebSocket
 * Automatically syncs node create/update/delete events with the graph store
 */
export function useGraphSync() {
  const { addNode, updateNode, removeNode } = useGraphStore();

  // Handle real-time node events
  const handleNodeCreated = useCallback((data: any) => {
    console.log('[GraphSync] Node created:', data);
    if (data.node) {
      addNode(data.node);
    }
  }, [addNode]);

  const handleNodeUpdated = useCallback((data: any) => {
    console.log('[GraphSync] Node updated:', data);
    if (data.id && data.node) {
      updateNode(data.id, data.node);
    }
  }, [updateNode]);

  const handleNodeDeleted = useCallback((data: any) => {
    console.log('[GraphSync] Node deleted:', data);
    if (data.id) {
      removeNode(data.id);
    }
  }, [removeNode]);

  const handleConnect = useCallback(() => {
    console.log('[GraphSync] WebSocket connected');
  }, []);

  const handleDisconnect = useCallback(() => {
    console.log('[GraphSync] WebSocket disconnected');
  }, []);

  // Set up WebSocket with callbacks
  const { connected, emit } = useWebSocket({
    onNodeCreated: handleNodeCreated,
    onNodeUpdated: handleNodeUpdated,
    onNodeDeleted: handleNodeDeleted,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
  });

  useEffect(() => {
    if (!connected) {
      return;
    }

    const sessionId = localStorage.getItem('talus_tally_session_id');
    if (sessionId) {
      emit('join_session', { session_id: sessionId });
    }
  }, [connected, emit]);

  // Emit node operations to other clients
  const broadcastNodeCreated = useCallback((node: any) => {
    emit('node:create', { node });
  }, [emit]);

  const broadcastNodeUpdated = useCallback((id: string, node: any) => {
    emit('node:update', { id, node });
  }, [emit]);

  const broadcastNodeDeleted = useCallback((id: string) => {
    emit('node:delete', { id });
  }, [emit]);

  return {
    connected,
    broadcastNodeCreated,
    broadcastNodeUpdated,
    broadcastNodeDeleted,
  };
}
