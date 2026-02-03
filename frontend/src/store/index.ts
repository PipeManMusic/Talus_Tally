import { create } from 'zustand';
import type { Node, Graph } from '../api/client';

interface GraphState {
  currentGraph: Graph | null;
  selectedNodeId: string | null;
  nodes: Record<string, Node>;
  clipboard: Node | null;
  
  // Graph actions
  setCurrentGraph: (graph: Graph) => void;
  clearGraph: () => void;
  
  // Node actions
  selectNode: (nodeId: string) => void;
  deselectNode: () => void;
  updateNode: (nodeId: string, node: Node) => void;
  addNode: (node: Node) => void;
  removeNode: (nodeId: string) => void;
  
  // Clipboard actions
  copyNode: (nodeId: string) => void;
  cutNode: (nodeId: string) => void;
  pasteNode: () => Node | null;
  clearClipboard: () => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  currentGraph: null,
  selectedNodeId: null,
  nodes: {},
  clipboard: null,

  setCurrentGraph: (graph) => {
    const nodes = graph?.nodes ? graph.nodes.reduce((acc, node) => ({ ...acc, [node.id]: node }), {}) : {};
    set({
      currentGraph: graph || null,
      nodes,
    });
  },

  clearGraph: () =>
    set({
      currentGraph: null,
      selectedNodeId: null,
      nodes: {},
    }),

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  deselectNode: () => set({ selectedNodeId: null }),

  updateNode: (nodeId, node) =>
    set((state) => ({
      nodes: {
        ...state.nodes,
        [nodeId]: node,
      },
    })),

  addNode: (node) =>
    set((state) => ({
      nodes: {
        ...state.nodes,
        [node.id]: node,
      },
    })),

  removeNode: (nodeId) =>
    set((state) => {
      const newNodes = { ...state.nodes };
      delete newNodes[nodeId];
      return {
        nodes: newNodes,
        selectedNodeId:
          state.selectedNodeId === nodeId ? null : state.selectedNodeId,
      };
    }),

  copyNode: (nodeId) => {
    const node = get().nodes[nodeId];
    if (node) {
      set({ clipboard: { ...node } });
    }
  },

  cutNode: (nodeId) => {
    const node = get().nodes[nodeId];
    if (node) {
      set({ clipboard: { ...node } });
      get().removeNode(nodeId);
    }
  },

  pasteNode: () => {
    const clipboard = get().clipboard;
    if (clipboard) {
      const newNode = { ...clipboard, id: `${clipboard.id}_copy_${Date.now()}` };
      get().addNode(newNode);
      return newNode;
    }
    return null;
  },

  clearClipboard: () => set({ clipboard: null }),
}));

interface UIState {
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  searchOpen: boolean;
  
  // Theme actions
  setTheme: (theme: 'light' | 'dark') => void;
  
  // UI state actions
  toggleSidebar: () => void;
  toggleInspector: () => void;
  toggleSearch: () => void;
  setSidebarOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'dark',
  sidebarOpen: true,
  inspectorOpen: true,
  searchOpen: false,

  setTheme: (theme) => set({ theme }),

  toggleSidebar: () =>
    set((state) => ({
      sidebarOpen: !state.sidebarOpen,
    })),

  toggleInspector: () =>
    set((state) => ({
      inspectorOpen: !state.inspectorOpen,
    })),

  toggleSearch: () =>
    set((state) => ({
      searchOpen: !state.searchOpen,
    })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setInspectorOpen: (open) => set({ inspectorOpen: open }),

  setSearchOpen: (open) => set({ searchOpen: open }),
}));

interface SessionState {
  sessionId: string | null;
  isAuthenticated: boolean;
  user: any | null;
  
  // Session actions
  setSession: (sessionId: string) => void;
  clearSession: () => void;
  setUser: (user: any) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: localStorage.getItem('sessionId'),
  isAuthenticated: !!localStorage.getItem('sessionId'),
  user: null,

  setSession: (sessionId) => {
    localStorage.setItem('sessionId', sessionId);
    set({
      sessionId,
      isAuthenticated: true,
    });
  },

  clearSession: () => {
    localStorage.removeItem('sessionId');
    set({
      sessionId: null,
      isAuthenticated: false,
      user: null,
    });
  },

  setUser: (user) => set({ user }),
}));
