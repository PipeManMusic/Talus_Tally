import { useState, useCallback } from 'react';
import { apiClient } from '../api/client';
import type { Node } from '../api/client';

export function useNodes() {
  const [nodes, setNodes] = useState<Record<string, Node>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createNode = useCallback(async (nodeData: Partial<Node>) => {
    setLoading(true);
    setError(null);
    try {
      const newNode = await apiClient.createNode(nodeData);
      setNodes((prev) => ({ ...prev, [newNode.id]: newNode }));
      return newNode;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create node';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateNode = useCallback(async (id: string, data: Partial<Node>) => {
    setLoading(true);
    setError(null);
    try {
      const updatedNode = await apiClient.updateNode(id, data);
      setNodes((prev) => ({ ...prev, [id]: updatedNode }));
      return updatedNode;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update node';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteNode = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.deleteNode(id);
      setNodes((prev) => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete node';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getNode = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const node = await apiClient.getNode(id);
      setNodes((prev) => ({ ...prev, [id]: node }));
      return node;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch node';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    nodes,
    loading,
    error,
    createNode,
    updateNode,
    deleteNode,
    getNode,
  };
}
