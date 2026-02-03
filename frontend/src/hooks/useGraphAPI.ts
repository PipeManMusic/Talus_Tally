import { useState, useCallback } from 'react';
import { apiClient } from '@/api/client';
import { useGraphStore } from '@/store';
import type { Graph } from '@/api/client';

interface GraphAPIState {
  loading: boolean;
  error: string | null;
  saving: boolean;
}

export function useGraphAPI() {
  const [state, setState] = useState<GraphAPIState>({
    loading: false,
    error: null,
    saving: false,
  });

  const { setCurrentGraph, nodes } = useGraphStore();

  // Load a graph from the backend
  const loadGraph = useCallback(async (graphId: string) => {
    setState({ loading: true, error: null, saving: false });
    
    try {
      const graph = await apiClient.getGraph(graphId);
      
      // Update Zustand store with loaded graph
      setCurrentGraph(graph);
      
      setState({ loading: false, error: null, saving: false });
      return graph;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load graph';
      setState({ loading: false, error: errorMessage, saving: false });
      throw err;
    }
  }, [setCurrentGraph]);

  // Save the current graph to the backend
  const saveGraph = useCallback(async (graphId: string) => {
    setState((prev) => ({ ...prev, saving: true, error: null }));
    
    try {
      // Convert store nodes to API format
      const nodeList = Object.values(nodes);
      const graph: Graph = {
        id: graphId,
        nodes: nodeList as any[],
        edges: [], // TODO: Extract edges from React Flow or store
      };

      const savedGraph = await apiClient.saveGraph(graphId, graph);
      
      setState((prev) => ({ ...prev, saving: false }));
      return savedGraph;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save graph';
      setState((prev) => ({ ...prev, saving: false, error: errorMessage }));
      throw err;
    }
  }, [nodes]);

  // Create a new graph
  const createGraph = useCallback(async () => {
    setState({ loading: true, error: null, saving: false });
    
    try {
      // For now, create an empty graph with generated ID
      const newGraphId = `graph-${Date.now()}`;
      const newGraph: Graph = {
        id: newGraphId,
        nodes: [],
        edges: [],
      };

      setCurrentGraph(newGraph);
      
      setState({ loading: false, error: null, saving: false });
      return newGraph;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create graph';
      setState({ loading: false, error: errorMessage, saving: false });
      throw err;
    }
  }, [setCurrentGraph]);

  // Clear any errors
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    loading: state.loading,
    error: state.error,
    saving: state.saving,
    loadGraph,
    saveGraph,
    createGraph,
    clearError,
  };
}
