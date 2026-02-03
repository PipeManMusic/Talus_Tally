import { useState, useCallback, useEffect, useRef } from 'react';
import { apiClient } from '../api/client';
import { Socket } from 'socket.io-client';

interface WebSocketCallbacks {
  onNodeCreated?: (data: any) => void;
  onNodeUpdated?: (data: any) => void;
  onNodeDeleted?: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useWebSocket(callbacks: WebSocketCallbacks = {}) {
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const callbacksRef = useRef(callbacks);

  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    const newSocket = apiClient.connectSocket({
      onConnect: () => {
        setConnected(true);
        callbacksRef.current.onConnect?.();
      },
      onNodeCreated: (data) => callbacksRef.current.onNodeCreated?.(data),
      onNodeUpdated: (data) => callbacksRef.current.onNodeUpdated?.(data),
      onNodeDeleted: (data) => callbacksRef.current.onNodeDeleted?.(data),
      onDisconnect: () => {
        setConnected(false);
        callbacksRef.current.onDisconnect?.();
      },
    });

    setSocket(newSocket);

    return () => {
      apiClient.disconnectSocket();
    };
  }, []);

  const emit = useCallback(
    (event: string, data?: any) => {
      socket?.emit(event, data);
    },
    [socket]
  );

  return {
    connected,
    socket,
    emit,
  };
}
