import { TitleBar } from './components/layout/TitleBar';
import { MenuBar } from './components/layout/MenuBar';
import { TreeView } from './components/layout/TreeView';
import { clearIconCache } from './components/graph/mapNodeIcon';
import type { TreeNode } from './utils/treeUtils';
import { Inspector } from './components/layout/Inspector';
import type { NodeProperty } from './components/layout/Inspector';
import { NewProjectDialog } from './components/dialogs/NewProjectDialog';
import { AddChildDialog } from './components/dialogs/AddChildDialog';
import { AssetSelectDialog } from './components/dialogs/AssetSelectDialog';
import { AssetCategoryDialog } from './components/dialogs/AssetCategoryDialog';
import { SettingsDialog } from './components/dialogs/SettingsDialog';
import { SaveConfirmDialog, type SaveAction } from './components/dialogs/SaveConfirmDialog';
import { ImportCsvDialog } from './components/dialogs/ImportCsvDialog';
import { TemplateEditor } from './views/TemplateEditor';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DebugPanel, type DebugLogEntry } from './components/dev/DebugPanel';
import { ErrorBoundary } from './components/dev/ErrorBoundary';
// Toggleable debug logging for tree/expansion state
const DEBUG_TREE = process.env.NODE_ENV !== 'production';
import { useGraphStore } from './store';
import { useGraphSync } from './hooks';
import { apiClient, type Node, type Template, type Graph, type TemplateSchema, API_BASE_URL } from './api/client';
import { normalizeGraph } from './utils/graph';
import { validateTemplateSchema, safeExtractOptions } from './utils/templateValidation';

function App() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);  // Track dirty state
  const isDirtyRef = useRef(false);  // Ref to access current dirty state in callbacks
  const sessionIdRef = useRef<string | null>(null);
  const currentGraphRef = useRef<Graph | null>(null);
  const templateIdRef = useRef<string | null>(null);
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
  const [selectedNodeData, setSelectedNodeData] = useState<Node | null>(null);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showAddChildDialog, setShowAddChildDialog] = useState(false);
  const [showAssetSelectDialog, setShowAssetSelectDialog] = useState(false);
  const [showAssetCategoryDialog, setShowAssetCategoryDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [showSaveConfirmDialog, setShowSaveConfirmDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const pendingCloseActionRef = useRef<(() => Promise<void>) | null>(null);
  const [addChildParentId, setAddChildParentId] = useState<string | null>(null);
  const [addChildTitle, setAddChildTitle] = useState<string | undefined>(undefined);
  const [assetSelectParentId, setAssetSelectParentId] = useState<string | null>(null);
  const [assetSelectNodeType, setAssetSelectNodeType] = useState<string>('asset_reference');
  const [assetCategoryParentId, setAssetCategoryParentId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateSchema, setTemplateSchema] = useState<TemplateSchema | null>(null);
  const [lastFilePath, setLastFilePath] = useState<string | null>(null);
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);
  const [expandAllSignal, setExpandAllSignal] = useState(0);
  const [collapseAllSignal, setCollapseAllSignal] = useState(0);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const debugLogCounterRef = useRef(0);
  const [isAppInitialized, setIsAppInitialized] = useState(false);
  // Track which nodes are expanded (by id) - restore from localStorage
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('talus-tally:expandedMap');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (err) {
      console.warn('Failed to restore expanded state:', err);
    }
    return {};
  });
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isInitialConnection, setIsInitialConnection] = useState(true);
  const initialLoadStartRef = useRef<number>(Date.now());
  const INITIAL_LOADING_MS = 15000;
  const { nodes: storeNodes, currentGraph, setCurrentGraph } = useGraphStore();
  
  // Enable real-time WebSocket synchronization
  useGraphSync();

  // Keep ref in sync with state for use in event handlers
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    currentGraphRef.current = currentGraph || null;
  }, [currentGraph]);

  useEffect(() => {
    templateIdRef.current = currentTemplateId;
  }, [currentTemplateId]);

  // Load saved indicator size on mount
  useEffect(() => {
    const savedSize = localStorage.getItem('indicator_size');
    if (savedSize) {
      const size = parseInt(savedSize, 10);
      if (!isNaN(size)) {
        document.documentElement.style.setProperty('--indicator-size', `${size}px`);
        console.log('✓ Restored indicator size:', size + 'px');
      }
    }
  }, []);

  // Persist expanded state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('talus-tally:expandedMap', JSON.stringify(expandedMap));
    } catch (err) {
      console.warn('Failed to persist expanded state:', err);
    }
  }, [expandedMap]);

  // Wait for backend and create/restore session on mount
  useEffect(() => {
    const initApp = async () => {
      try {
        // TEMPORARY: Force clear corrupted state
        const forceReset = false; // Set to false after testing
        if (forceReset) {
          console.warn('🔄 Force clearing all saved state...');
          localStorage.clear();
          setCurrentGraph({ id: 'default', nodes: [], edges: [] });
        }
        
        // Wait for backend to be ready with continuous polling during initial window
        const startTime = initialLoadStartRef.current;
        const maxWaitMs = INITIAL_LOADING_MS;
        let ready = false;
        
        while (!ready && (Date.now() - startTime) < maxWaitMs) {
          try {
            const response = await fetch(`${API_BASE_URL}/api/v1/health`, {
              method: 'GET',
              signal: AbortSignal.timeout(1000),
            });
            if (response.ok) {
              ready = true;
              console.log('✓ Backend is ready');
              break;
            }
          } catch {
            // Backend not ready yet, continue polling
          }
          
          // Wait 300ms before next attempt
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        setIsInitialConnection(false);
        
        if (!ready) {
          const errorMsg = 'Cannot connect to backend. Please ensure the server is running.';
          console.error(errorMsg);
          setBackendError(errorMsg);
          setIsAppInitialized(true);
          return;
        }
        setBackendError(null); // Clear any previous errors
        
        // Try to restore existing session from localStorage
        const savedSessionId = localStorage.getItem('talus_tally_session_id');
        if (savedSessionId) {
          console.log('Found saved session ID:', savedSessionId);
          try {
            // Validate session still exists on backend
            const sessionInfo = await apiClient.getSessionInfo(savedSessionId);
            if (sessionInfo && sessionInfo.session_id) {
              console.log('✓ Restored session:', savedSessionId);
              setSessionId(savedSessionId);
              
              // If session has a project, restore it
              if (sessionInfo.has_project) {
                console.log('✓ Session has existing project, restoring graph...');
                try {
                  const restoredTemplateId = sessionInfo.template_id || localStorage.getItem('talus_tally_template_id');
                  if (restoredTemplateId) {
                    try {
                      const schema = await apiClient.getTemplateSchema(restoredTemplateId);
                      
                      // Validate template schema before using it
                      const validation = validateTemplateSchema(schema);
                      if (!validation.isValid) {
                        console.error('Template validation failed:', validation.errors);
                        throw new Error(`Template validation failed:\n${validation.errors.join('\n')}`);
                      }
                      
                      setTemplateSchema(schema);
                      setCurrentTemplateId(restoredTemplateId);
                      console.log('✓ Template schema restored:', restoredTemplateId);
                    } catch (err) {
                      console.warn('Failed to restore template schema:', err);
                      alert(`Template Error: ${err instanceof Error ? err.message : String(err)}\n\nThe template may be corrupted. Please start a new project.`);
                    }
                  }
                  const graphData = await apiClient.getSessionGraph(savedSessionId);
                  console.log('[DEBUG] Raw graphData from backend:', JSON.stringify(graphData, null, 2));
                  const graph = normalizeGraph(graphData.graph);
                  console.log('[DEBUG] Normalized graph nodes:', graph.nodes);
                  setCurrentGraph(graph);
                  console.log('✓ Graph restored with', Object.keys(graph.nodes).length, 'nodes');
                } catch (err) {
                  console.warn('Failed to restore graph, starting fresh:', err);
                  // Clear corrupted state and start fresh
                  setCurrentGraph({ id: 'default', nodes: [], edges: [] });
                }
              }
              setIsAppInitialized(true);
              return;
            }
          } catch (err) {
            console.warn('Saved session invalid, creating new session:', err);
            localStorage.removeItem('talus_tally_session_id');
          }
        }
        
        // Create new session
        const session = await apiClient.createSession();
        const sid = session.session_id || session.id || 'unknown';
        setSessionId(sid);
        localStorage.setItem('talus_tally_session_id', sid);
        console.log('✓ Session created:', sid);
        setIsAppInitialized(true);
        setIsInitialConnection(false);
      } catch (err) {
        setIsInitialConnection(false);
        const errorMsg = `Failed to initialize app: ${err instanceof Error ? err.message : String(err)}`;
        console.error('✗', errorMsg);
        setBackendError('Failed to initialize app. Please check the backend connection.');
        setIsAppInitialized(true);
      }
    };
    initApp();
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;

    const maxEntries = 500;
    const original = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };

    const formatArg = (arg: unknown) => {
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch (err) {
        return String(arg);
      }
    };

    const pushLog = (level: DebugLogEntry['level'], args: unknown[]) => {
      const now = new Date();
      const time = now.toISOString().slice(11, 23);
      const message = args.map(formatArg).join(' ');
      setDebugLogs((prev) => {
        const entry: DebugLogEntry = {
          id: ++debugLogCounterRef.current,
          level,
          time,
          message,
        };
        if (prev.length >= maxEntries) {
          return [...prev.slice(prev.length - maxEntries + 1), entry];
        }
        return [...prev, entry];
      });
    };

    console.log = (...args: unknown[]) => {
      original.log(...args);
      pushLog('log', args);
    };
    console.info = (...args: unknown[]) => {
      original.info(...args);
      pushLog('info', args);
    };
    console.warn = (...args: unknown[]) => {
      original.warn(...args);
      pushLog('warn', args);
    };
    console.error = (...args: unknown[]) => {
      original.error(...args);
      pushLog('error', args);
    };
    console.debug = (...args: unknown[]) => {
      original.debug(...args);
      pushLog('debug', args);
    };

    return () => {
      console.log = original.log;
      console.info = original.info;
      console.warn = original.warn;
      console.error = original.error;
      console.debug = original.debug;
    };
  }, []);

  // Convert backend nodes to tree structure
  const convertNodesToTree = useCallback((nodes: Record<string, Node>): TreeNode[] => {
    const nodeList = Object.values(nodes);
    if (nodeList.length === 0) return [];

    const iconByType = templateSchema?.node_types?.reduce<Record<string, string>>((acc, nodeType) => {
      if (nodeType.id && nodeType.icon) {
        acc[nodeType.id] = nodeType.icon;
      }
      return acc;
    }, {}) || {};

    // Helper to get allowed_children - uses backend data if available, falls back to schema
    const getAllowedChildren = (node: Node | undefined): string[] => {
      if (!node) return [];
      // First priority: use allowed_children from backend schema enrichment
      if (node.allowed_children !== undefined && Array.isArray(node.allowed_children)) {
        return node.allowed_children;
      }
      // Fallback: get from template schema
      if (!templateSchema?.node_types) {
        return [];
      }
      const typeSchema = templateSchema.node_types.find(nt => nt.id === node.type);
      return typeSchema?.allowed_children || [];
    };

    const buildTree = (node: Node, nodesMap: Record<string, Node>, parentId: string | null): TreeNode => {
      const schemaIconId = iconByType[node.type];
      const iconId = node.icon_id ?? schemaIconId ?? undefined;
      const allowedChildren = getAllowedChildren(node);
      return {
        id: node.id,
        name: node.properties?.name || node.type,
        type: (node.type as any) || 'project',
        indicator_id: node.indicator_id ?? undefined,
        indicator_set: node.indicator_set ?? undefined,
        icon_id: iconId,
        statusIndicatorSvg: node.statusIndicatorSvg ?? undefined,
        statusText: node.statusText ?? undefined,
        parent_id: parentId ?? undefined,
        allowed_children: allowedChildren,
        children: node.children?.map(childId => {
          const childNode = nodesMap[childId];
          return childNode
            ? buildTree(childNode, nodesMap, node.id)
            : {
                id: childId,
                name: 'Unknown',
                type: 'unknown',
                allowed_children: [],
                children: [],
                parent_id: node.id,
              };
        }) || []
      };
    };

    // Find root nodes (nodes without parents)
    const roots = nodeList.filter(n => !nodeList.some(p => 
      p.children?.includes(n.id)
    ));

    return roots.map(root => buildTree(root, nodes, null));
  }, [templateSchema]);

  // Track if this is the first tree build after project load
  const firstTreeBuild = useRef(true);
  // Track previous child counts for root nodes (do not store in expandedMap)
  const rootChildCounts = useRef<Record<string, number>>({});
  useEffect(() => {
    // Build tree only if we have nodes
    if (!storeNodes || Object.keys(storeNodes).length === 0) {
      setTreeNodes([]);
      return;
    }
    const tree = convertNodesToTree(storeNodes);
    setTreeNodes(tree);
  }, [storeNodes, convertNodesToTree]);

  // Get selected node data
  useEffect(() => {
    if (selectedNode && storeNodes[selectedNode]) {
      setSelectedNodeData(storeNodes[selectedNode]);
    } else {
      setSelectedNodeData(null);
    }
  }, [selectedNode, storeNodes]);

  // Convert node properties to inspector format
  const getNodeProperties = useCallback((): NodeProperty[] => {
    if (!selectedNodeData || !templateSchema) {
      return [];
    }

    // Find the node type schema
    const nodeTypeSchema = templateSchema.node_types.find(nt => nt.id === selectedNodeData.type);
    if (!nodeTypeSchema) {
      return [];
    }

    // Start with name as the first editable property
    const nameProperty: NodeProperty = {
      id: 'name',
      name: 'Name',
      type: 'text',
      value: selectedNodeData.properties?.name || '',
      required: true,
    };

    // Build properties from schema
    const schemaProperties = nodeTypeSchema.properties.filter((prop) => prop.id !== 'name').map((prop) => {
      let value = selectedNodeData.properties?.[prop.id];
      if (value === undefined && prop.id === 'name') {
        value = selectedNodeData.properties?.name || '';
      }
      let type: NodeProperty['type'] = 'text';
      if (prop.type === 'number') type = 'number';
      else if (prop.type === 'select') type = 'select';
      else if (prop.type === 'textarea') type = 'textarea';
      else if (prop.type === 'currency') type = 'currency';
      else if (prop.type === 'date') type = 'date';
      else if (prop.type === 'checkbox') type = 'checkbox';
      else if (prop.type === 'editor') type = 'editor';
      // Build options for select - use safe extraction to handle malformed data
      let options = undefined;
      if (prop.type === 'select') {
        options = safeExtractOptions(prop);
      }
      
      // Extract markup tokens if this is an editor field with markup_profile
      let markupTokens = undefined;
      if (prop.type === 'editor' && (prop as any).markup_tokens) {
        markupTokens = (prop as any).markup_tokens;
      }
      
      return {
        id: prop.id,
        name: prop.name,
        type,
        value: value ?? '',
        options,
        required: prop.required,
        markupTokens,
      };
    });

    return [nameProperty, ...schemaProperties];
  }, [selectedNodeData, templateSchema]);

  // Get linked asset metadata if this node has an asset_id property
  const getLinkedAssetMetadata = useCallback((): any => {
    if (!selectedNodeData) return null;
    if (!templateSchema) {
      return null;
    }

    // Check if this node has an asset_id property (like asset_reference nodes)
    const assetId = selectedNodeData.properties?.asset_id;
    if (!assetId) return null;

    // Find the asset node in the store
    const assetNode = storeNodes[assetId];
    if (!assetNode) return null;

    // Get the schema for the asset node type
    const assetTypeSchema = templateSchema?.node_types?.find(nt => nt.id === assetNode.type);
    if (!assetTypeSchema) {
      return null;
    }

    // Build asset properties
    const assetProperties = (assetTypeSchema.properties || []).map((prop) => {
      let value = assetNode.properties?.[prop.id];
      if (value === undefined && prop.id === 'name') {
        value = assetNode.properties?.name || '';
      }
      let type: NodeProperty['type'] = 'text';
      if (prop.type === 'number') type = 'number';
      else if (prop.type === 'select') type = 'select';
      else if (prop.type === 'textarea') type = 'textarea';
      else if (prop.type === 'currency') type = 'currency';
      else if (prop.type === 'date') type = 'date';
      else if (prop.type === 'checkbox') type = 'checkbox';
      else if (prop.type === 'editor') type = 'editor';
      // Build options for select - use safe extraction to handle malformed data
      let options = undefined;
      if (prop.type === 'select') {
        options = safeExtractOptions(prop);
      }
      
      // Extract markup tokens if this is an editor field with markup_profile
      let markupTokens = undefined;
      if (prop.type === 'editor' && (prop as any).markup_tokens) {
        markupTokens = (prop as any).markup_tokens;
      }
      
      return {
        id: prop.id,
        name: prop.name,
        type,
        value: value ?? '',
        options,
        required: prop.required,
        markupTokens,
      };
    });

    return {
      nodeId: assetNode.id,
      nodeType: assetNode.type,
      name: assetNode.properties?.name || 'Asset',
      properties: assetProperties,
    };
  }, [selectedNodeData, templateSchema, storeNodes]);

  // Memoize computed values for inspector
  const nodeProperties = useMemo(() => getNodeProperties(), [getNodeProperties]);
  const linkedAsset = useMemo(() => getLinkedAssetMetadata(), [getLinkedAssetMetadata]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) {
      // Validate the session still exists on the backend
      try {
        await apiClient.getSessionInfo(sessionIdRef.current);
        console.log(`[Session] Using existing sessionId: ${sessionIdRef.current}`);
        return sessionIdRef.current;
      } catch (err) {
        console.warn('[Session] Existing session invalid, creating new one:', err);
        // Session is stale, create a new one
      }
    }
    console.log('[Session] Creating new session...');
    const session = await apiClient.createSession();
    const sid = session.session_id || session.id || 'unknown';
    console.log(`[Session] Created new session: ${sid}`);
    setSessionId(sid);
    localStorage.setItem('talus_tally_session_id', sid);
    return sid;
  }, []);

  const restoreGraphToSession = useCallback(async (sid: string) => {
    if (!currentGraphRef.current) {
      console.warn('[Recovery] No graph to restore (currentGraphRef is null)');
      return;
    }
    console.log(`[Recovery] Restoring graph to new session ${sid}...`);
    try {
      const result = await apiClient.loadGraphIntoSession(sid, currentGraphRef.current, templateIdRef.current);
      console.log(`[Recovery] Graph restored successfully to session ${sid}`);
      return result;
    } catch (restoreErr) {
      const msg = restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
      console.error(`[Recovery] Failed to restore graph to session ${sid}: ${msg}`);
      throw restoreErr;  // Re-throw so caller knows recovery failed
    }
  }, []);

  const safeExecuteCommand = useCallback(async (commandType: string, data: any) => {
    const sid = await ensureSession();
    try {
      console.log(`[Command] Executing ${commandType} with session ${sid}...`);
      return await apiClient.executeCommand(sid, commandType, data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[Command] Got error: ${msg}`);
      if (msg.includes('Session not found') || msg.includes('INVALID_SESSION')) {
        console.log('[Recovery] Detected session lost, starting recovery...');
        try {
          const newSession = await apiClient.createSession();
          const newSid = newSession.session_id || newSession.id || 'unknown';
          console.log(`[Recovery] Created new session: ${newSid}`);
          setSessionId(newSid);
          localStorage.setItem('talus_tally_session_id', newSid);
          
          await restoreGraphToSession(newSid);
          
          console.log(`[Recovery] Retrying command ${commandType} with new session...`);
          return await apiClient.executeCommand(newSid, commandType, data);
        } catch (recoveryErr) {
          const recoveryMsg = recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr);
          console.error(`[Recovery] Recovery failed: ${recoveryMsg}`);
          throw recoveryErr;  // Throw the recovery error, not the original error
        }
      }
      throw err;
    }
  }, [ensureSession, restoreGraphToSession]);

  // Menu handlers
  const handleNew = useCallback(async () => {
    try {
      // Check if current project has unsaved changes
      if (isDirty && sessionId) {
        const confirmed = window.confirm(
          'You have unsaved changes. Do you want to discard them and create a new project?'
        );
        if (!confirmed) {
          return;
        }
        // Discard changes
        try {
          await apiClient.resetDirtyState(sessionId);
          setIsDirty(false);
        } catch (err) {
          console.warn('Failed to reset dirty state:', err);
          setIsDirty(false);  // Reset locally anyway
        }
      }
      
      // Load templates if not already loaded
      if (templates.length === 0) {
        const loadedTemplates = await apiClient.listTemplates();
        console.log('Loaded templates:', loadedTemplates);
        setTemplates(loadedTemplates);
        if (loadedTemplates.length === 0) {
          alert('No templates available. Please add templates to the backend.');
          return;
        }
      }
      // Show new project dialog
      setShowNewProjectDialog(true);
    } catch (err) {
      console.error('✗ Failed to load templates:', err);
      alert(`Failed to load templates. Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [templates.length, isDirty, sessionId]);

  const handleCreateProject = useCallback(async (templateId: string, projectName: string) => {
    try {
      console.log('Creating project with template:', templateId, 'and name:', projectName);
      const result = await apiClient.createProject(templateId, projectName);
      console.log('✓ API Response:', result);
      console.log('✓ API Response keys:', Object.keys(result));
      
      // Check for API error response
      if ('error' in result && result.error) {
        const errorMsg = (result.error as any).message || (result.error as any).code || 'Unknown error';
        console.error('✗ API Error:', errorMsg);
        alert(`Failed to create project: ${errorMsg}`);
        return;
      }
      
      console.log('✓ API Response.graph:', result.graph);
      
      const graph = normalizeGraph(result.graph);
      console.log('Setting graph with nodes:', graph.nodes?.length || 0);
      console.log('Final graph structure:', graph);
      
      // Load template schema for type information
      try {
        const schema = await apiClient.getTemplateSchema(templateId);
        
        // Validate template schema before using it
        const validation = validateTemplateSchema(schema);
        if (!validation.isValid) {
          console.error('Template validation failed:', validation.errors);
          throw new Error(`Template validation failed:\n${validation.errors.join('\n')}`);
        }
        
        setTemplateSchema(schema);
        localStorage.setItem('talus_tally_template_id', templateId);
        console.log('✓ Template schema loaded:', schema);
      } catch (schemaErr) {
        console.error('✗ Failed to load template schema:', schemaErr);
        alert(`Template Error: ${schemaErr instanceof Error ? schemaErr.message : String(schemaErr)}\n\nThe template may be invalid. Please check the template file.`);
        setTemplateSchema(null);
        throw schemaErr; // Prevent continuing with invalid template
      }
      
      // Update session and load graph
      const newSessionId = result.session_id || 'unknown';
      setSessionId(newSessionId);
      setCurrentTemplateId(templateId);
      setLastFilePath(null);  // New project has no file path yet
      localStorage.setItem('talus_tally_session_id', newSessionId);
      setCurrentGraph(graph);
      setShowNewProjectDialog(false);
      setIsDirty(false);  // New project is clean
      console.log('✓ Project created with session:', newSessionId);
    } catch (err) {
      console.error('✗ Failed to create project:', err);
      alert(`Failed to create project. Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [normalizeGraph, setCurrentGraph]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    console.log('[DEBUG] handleSave called. lastFilePath:', lastFilePath);
    if (!sessionId) {
      alert('No active session');
      return false;
    }
    try {
      const { isTauri } = await import('@tauri-apps/api/core');
      if (!isTauri()) {
        alert('Save is only available in the desktop app.');
        return false;
      }

      const graph = currentGraph || { id: 'default', nodes: [], edges: [] };
      const payload = JSON.stringify({ 
        graph, 
        template_id: currentTemplateId,
        expanded_map: expandedMap 
      }, null, 2);

      if (!lastFilePath) {
        console.log('[DEBUG] No lastFilePath, prompting for save location');
        const { save } = await import('@tauri-apps/plugin-dialog');
        const filePath = await save({
          title: 'Save Project',
          defaultPath: 'talus-project.json',
          filters: [{ name: 'Talus Project', extensions: ['json'] }],
        });
        if (!filePath) return false;
        console.log('[DEBUG] User selected save path:', filePath);
        setLastFilePath(filePath);
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        await writeTextFile(filePath, payload);
      } else {
        console.log('[DEBUG] Saving to existing path:', lastFilePath);
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        await writeTextFile(lastFilePath, payload);
      }
      // Mark session as clean after saving
      await apiClient.saveSession(sessionId);
      setIsDirty(false);
      console.log('✓ Project saved');
      return true;
    } catch (err) {
      console.error('✗ Save failed:', err);
      alert('Save failed.');
      return false;
    }
  }, [currentGraph, lastFilePath, sessionId, currentTemplateId, expandedMap]);

  const handleSaveAs = useCallback(async (): Promise<boolean> => {
    try {
      const { isTauri } = await import('@tauri-apps/api/core');
      if (!isTauri()) {
        alert('Save is only available in the desktop app.');
        return false;
      }
      const graph = currentGraph || { id: 'default', nodes: [], edges: [] };
      const payload = JSON.stringify({ 
        graph, 
        template_id: currentTemplateId,
        expanded_map: expandedMap 
      }, null, 2);
      const { save } = await import('@tauri-apps/plugin-dialog');
      const filePath = await save({
        title: 'Save Project As',
        defaultPath: 'talus-project.json',
        filters: [{ name: 'Talus Project', extensions: ['json'] }],
      });
      if (!filePath) return false;
      setLastFilePath(filePath);
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      await writeTextFile(filePath, payload);
      // Mark session as clean after saving
      if (sessionId) {
        try {
          await apiClient.saveSession(sessionId);
          setIsDirty(false);
        } catch (err) {
          console.warn('Failed to mark session as clean (session may be stale):', err);
          // Continue anyway - file was saved successfully
        }
      }
      console.log('✓ Project saved');
      return true;
    } catch (err) {
      console.error('✗ Save As failed:', err);
      alert('Save failed.');
      return false;
    }
  }, [currentGraph, sessionId, currentTemplateId, expandedMap]);

  const handleOpen = useCallback(async () => {
    try {
      const { isTauri } = await import('@tauri-apps/api/core');
      if (!isTauri()) {
        alert('Open is only available in the desktop app.');
        return;
      }
      const { open } = await import('@tauri-apps/plugin-dialog');
      const filePath = await open({
        title: 'Open Project',
        multiple: false,
        filters: [{ name: 'Talus Project', extensions: ['json'] }],
      });
      if (!filePath || Array.isArray(filePath)) return;
      
      console.log('📂 Opening file:', filePath);
      
      // Read and parse file
      let fileContents: string;
      let parsed: any;
      try {
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        fileContents = await readTextFile(filePath);
      } catch (readErr) {
        const errMsg = readErr instanceof Error ? readErr.message : String(readErr);
        console.error('✗ Failed to read file:', readErr);
        alert(`Cannot read file: ${errMsg}`);
        return;
      }
      
      try {
        parsed = JSON.parse(fileContents);
      } catch (parseErr) {
        console.error('✗ File is not valid JSON:', parseErr);
        alert('File is not a valid Talus project (invalid JSON).');
        return;
      }
      
      let normalizedGraph;
      try {
        normalizedGraph = normalizeGraph(parsed.graph ?? parsed);
      } catch (normErr) {
        console.error('✗ Failed to normalize graph structure:', normErr);
        alert('Project file has an invalid graph structure.');
        return;
      }

      const templateId = parsed.template_id || null;
      let finalGraph = normalizedGraph;

      // Ensure we have a valid session for this file
      let sid: string;
      if (sessionId) {
        // Validate that the session still exists on the backend
        try {
          await apiClient.getSessionInfo(sessionId);
          sid = sessionId;
          console.log(`[File Open] Using existing session: ${sid}`);
        } catch (err) {
          console.warn('Existing session invalid, creating new one:', err);
          const newSession = await apiClient.createSession();
          sid = newSession.session_id || newSession.id || 'unknown';
          console.log(`[File Open] Created new session for file: ${sid}`);
          setSessionId(sid);
          localStorage.setItem('talus_tally_session_id', sid);
        }
      } else {
        const newSession = await apiClient.createSession();
        sid = newSession.session_id || newSession.id || 'unknown';
        console.log(`[File Open] Created new session for file: ${sid}`);
        setSessionId(sid);
        localStorage.setItem('talus_tally_session_id', sid);
      }

      // Load graph into backend session (always - we just ensured a session exists)
      try {
        console.log(`[File Open] Loading graph into session ${sid}...`);
        const loadResult = await apiClient.loadGraphIntoSession(sid, normalizedGraph, templateId);
        console.log('✓ Graph loaded into backend session');
        finalGraph = normalizeGraph(loadResult.graph ?? loadResult);
        setCurrentTemplateId(templateId);
        
        if (templateId) {
          try {
            const schema = await apiClient.getTemplateSchema(templateId);
            
            // Validate template schema before using it
            const validation = validateTemplateSchema(schema);
            if (!validation.isValid) {
              console.error('Template validation failed:', validation.errors);
              throw new Error(`Template validation failed:\n${validation.errors.join('\n')}`);
            }
            
            setTemplateSchema(schema);
            console.log('✓ Template schema loaded for:', templateId);
          } catch (schemaErr) {
            console.error('✗ Template schema error:', schemaErr);
            alert(`Template Error: ${schemaErr instanceof Error ? schemaErr.message : String(schemaErr)}\n\nThe template may be invalid or corrupted.\nThe project will load but some features may not work correctly.`);
            // Keep templateSchema as null but don't crash - we'll use backend-provided allowed_children
            setTemplateSchema(null);
          }
        } else {
          console.info('ℹ No template ID in project file, working with schema-less data');
          setTemplateSchema(null);
        }
      } catch (sessionErr) {
        const errMsg = sessionErr instanceof Error ? sessionErr.message : String(sessionErr);
        console.error('⚠ Failed to load graph into backend session:', sessionErr);
        console.log('Continuing with local graph only - operations may fail later...');
        // Don't break the flow, but warn user that backend operations may fail
        alert('Warning: Could not sync project to backend. Edit operations may not work properly.');
      }

      setCurrentGraph(finalGraph);
      setLastFilePath(filePath);
      console.log('[DEBUG] File opened and lastFilePath set to:', filePath);
      
      // Restore expanded state if saved in file
      if (parsed.expanded_map && typeof parsed.expanded_map === 'object') {
        setExpandedMap(parsed.expanded_map);
        console.log('✓ Restored tree expansion state');
      }
      
      console.log('✓ Project opened:', filePath);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('✗ Open failed:', err);
      alert(`Failed to open project: ${errMsg}`);
    }
  }, [normalizeGraph, setCurrentGraph, sessionId, setSessionId, setExpandedMap, setTemplateSchema, setCurrentTemplateId]);

  const handleUndo = useCallback(async () => {
    if (!sessionId) return;
    try {
      const result = await apiClient.undo(sessionId);
      console.log('✓ Undo executed:', result);
      const graph = normalizeGraph(result.graph ?? result);
      setCurrentGraph(graph);
    } catch (err) {
      console.error('✗ Undo failed:', err);
    }
  }, [normalizeGraph, sessionId, setCurrentGraph]);

  const handleRedo = useCallback(async () => {
    if (!sessionId) return;
    try {
      const result = await apiClient.redo(sessionId);
      console.log('✓ Redo executed:', result);
      const graph = normalizeGraph(result.graph ?? result);
      setCurrentGraph(graph);
    } catch (err) {
      console.error('✗ Redo failed:', err);
    }
  }, [normalizeGraph, sessionId, setCurrentGraph]);

  const toggleInspector = useCallback(() => {
    setInspectorOpen(prev => !prev);
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandAllSignal((prev) => prev + 1);
  }, []);

  const handleCollapseAll = useCallback(() => {
    setCollapseAllSignal((prev) => prev + 1);
  }, []);

  const handleCloseApp = useCallback(async () => {
    const currentIsDirty = isDirtyRef.current;
    console.log('handleCloseApp called, isDirty:', currentIsDirty);
    if (currentIsDirty) {
      // Set up the action to execute after user makes their choice
      pendingCloseActionRef.current = async () => {
        console.log('[CLOSE] Proceeding with force close...');
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          console.log('[CLOSE] Calling force_close_window command');
          await invoke('force_close_window');
          console.log('[CLOSE] force_close_window returned');
          return;
        } catch (tauriErr) {
          console.error('[CLOSE] Tauri force close failed:', tauriErr);
          console.log('[CLOSE] Trying fallback window.close()');
          window.close?.();
        }
      };
      // Show the save confirm dialog
      console.log('Opening save confirmation dialog');
      setShowSaveConfirmDialog(true);
    } else {
      // No unsaved changes, close immediately with force_close_window
      console.log('No unsaved changes, force closing immediately');
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        console.log('[CLOSE] Calling force_close_window for clean state');
        await invoke('force_close_window');
      } catch (err) {
        console.error('[CLOSE] Clean force close failed:', err);
        window.close?.();
      }
    }
  }, []);

  const [addChildType, setAddChildType] = useState<string | undefined>(undefined);
  const openAddChildDialog = useCallback((parentId: string, parentName?: string, childTypeName?: string, childTypeId?: string) => {
    setAddChildParentId(parentId);
    setAddChildType(childTypeId);
    const typeName = childTypeName || 'Child';
    setAddChildTitle(parentName ? `Add ${typeName} to ${parentName}` : `Add ${typeName}`);
    setShowAddChildDialog(true);
    // Expand the parent node so the new child will be visible
    setExpandedMap((prev) => ({ ...prev, [parentId]: true }));
  }, []);

  const getAssetNodeTypes = useCallback(() => {
    if (!templateSchema) return ['part_asset', 'tool_asset', 'vehicle_asset', 'camera_gear_asset'];
    const types = new Set<string>();
    
    // Find all category types and get their allowed children (the actual assets)
    templateSchema.node_types
      .filter((nt) => nt.id.endsWith('_category'))
      .forEach((category) => {
        category.allowed_children?.forEach((child) => types.add(child));
      });

    // Also check named categories like 'vehicles'
    const vehiclesSchema = templateSchema.node_types.find(nt => nt.id === 'vehicles');
    vehiclesSchema?.allowed_children?.forEach((child) => types.add(child));

    // Fallback: if nothing found, look for all types ending in _asset
    if (types.size === 0) {
      templateSchema.node_types
        .map((t) => t.id)
        .filter((id) => id.endsWith('_asset'))
        .forEach((id) => types.add(id));
    }

    return Array.from(types);
  }, [templateSchema]);

  const assetOptions = useCallback((nodeTypeName?: string) => {
    let assetTypes: Set<string>;
    
    // If a specific node type is provided, check if it has allowed_asset_types filter
    if (nodeTypeName && templateSchema) {
      const nodeTypeSchema = templateSchema.node_types.find(nt => nt.id === nodeTypeName);
      if (nodeTypeSchema?.allowed_asset_types && nodeTypeSchema.allowed_asset_types.length > 0) {
        // Use the template-defined filter
        assetTypes = new Set(nodeTypeSchema.allowed_asset_types);
      } else {
        // No filter defined - show all asset types
        assetTypes = new Set(getAssetNodeTypes());
      }
    } else {
      // No node type specified - show all asset types
      assetTypes = new Set(getAssetNodeTypes());
    }
    
    return Object.values(storeNodes)
      .filter((node) => assetTypes.has(node.type))
      .map((node) => ({
        id: node.id,
        name: node.properties?.name || node.type,
        type: node.type,
        typeLabel: templateSchema?.node_types.find(nt => nt.id === node.type)?.name || node.type,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [getAssetNodeTypes, storeNodes, templateSchema]);

  const assetCategoryOptions = useCallback(() => {
    const fallback = [
      { id: 'parts_inventory', label: 'Parts Inventory' },
      { id: 'tools_inventory', label: 'Tools Inventory' },
      { id: 'vehicles', label: 'Vehicles' },
    ];
    if (!templateSchema) return fallback;
    
    // Check both project_root and inventory_root for inventory types
    const root = templateSchema.node_types.find(nt => nt.id === 'project_root');
    const assetRoot = templateSchema.node_types.find(nt => nt.id === 'inventory_root');
    const allowed = [
      ...(root?.allowed_children || []),
      ...(assetRoot?.allowed_children || [])
    ];
    
    const isAssetCategory = (id: string) => id.endsWith('_inventory') || id === 'vehicles';
    const options = allowed
      .filter(isAssetCategory)
      .map((id) => ({
        id,
        label: templateSchema.node_types.find(nt => nt.id === id)?.name || id,
      }));
    return options.length > 0 ? options : fallback;
  }, [templateSchema]);

  // Helper to check if adding a child would create a cycle
  const wouldCreateCycle = (parentId: string, childType: string): boolean => {
    // Find all descendants of the parent node
    const visited = new Set<string>();
    function dfs(nodeId: string) {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = storeNodes[nodeId];
      if (node && Array.isArray(node.children)) {
        node.children.forEach(dfs);
      }
    }
    dfs(parentId);
    // If the new child would have the same id as any ancestor, that's a cycle
    // But since new child gets a new id, we only need to check if the parent is a descendant of itself (should never happen)
    // However, if the UI ever allows selecting an existing node as a child, check here
    // For now, always return false (no cycle) for new nodes, but keep this for future extension
    return false;
  };

  const handleAddChildConfirm = useCallback((childName: string) => {
    if (!addChildParentId) {
      alert('No parent selected');
      return;
    }
    const parentNode = storeNodes[addChildParentId];
    if (!parentNode) {
      alert('Parent node not found');
      return;
    }
    // Use the child type selected from the flyout
    let childType = addChildType || 'task';
    // Frontend cycle detection: prevent adding a child if it would create a cycle (future-proof)
    if (wouldCreateCycle(addChildParentId, childType)) {
      alert('Cannot add child: this would create a cycle in the project tree.');
      return;
    }
    console.log(`Creating child node: type="${childType}", parent type="${parentNode.type}"`);
    safeExecuteCommand('CreateNode', {
        blueprint_type_id: childType,
        name: childName,
        parent_id: addChildParentId,
      })
      .then((result) => {
        const graph = normalizeGraph(result.graph ?? result);
        setCurrentGraph(graph);
        // Ensure parent node remains expanded after adding child
        setExpandedMap((prev) => ({ ...prev, [addChildParentId]: true }));
        setShowAddChildDialog(false);
        setAddChildParentId(null);
        setAddChildType(undefined);
        setIsDirty(result.is_dirty ?? true);  // Update dirty state from API
      })
      .catch((err) => {
        console.error('Failed to add child:', err);
        alert('Failed to add child node');
      });
  }, [addChildParentId, addChildType, normalizeGraph, safeExecuteCommand, setCurrentGraph, storeNodes]);

  const handleAssetSelectConfirm = useCallback(async (assetId: string) => {
    if (!assetSelectParentId) {
      alert('No parent selected');
      return;
    }
    const assetNode = storeNodes[assetId];
    if (!assetNode) {
      alert('Asset not found');
      return;
    }
    try {
      const sid = await ensureSession();
      const createResult = await safeExecuteCommand('CreateNode', {
        blueprint_type_id: assetSelectNodeType,
        name: assetNode.properties?.name || 'Asset Reference',
        parent_id: assetSelectParentId,
      });

      const createdGraph = normalizeGraph(createResult.graph ?? createResult);
      const createdNodeId = createdGraph.nodes.find(
        (n) => n.type === assetSelectNodeType && n.properties?.name === (assetNode.properties?.name || 'Asset Reference')
      )?.id;

      if (createdNodeId) {
        await safeExecuteCommand('UpdateProperty', {
          node_id: createdNodeId,
          property_id: 'asset_id',
          old_value: null,
          new_value: assetId,
        });
      }

      const refreshedGraph = createdNodeId
        ? normalizeGraph((await apiClient.getSessionGraph(sid)).graph)
        : createdGraph;

      setCurrentGraph(refreshedGraph);
      setExpandedMap((prev) => ({ ...prev, [assetSelectParentId]: true }));
      setShowAssetSelectDialog(false);
      setAssetSelectParentId(null);
      setAssetSelectNodeType('asset_reference');
      setIsDirty(true);
    } catch (err) {
      console.error('Failed to add asset reference:', err);
      alert('Failed to add asset reference');
    }
  }, [assetSelectParentId, assetSelectNodeType, ensureSession, normalizeGraph, safeExecuteCommand, setCurrentGraph, storeNodes]);

  const handleAssetCategoryConfirm = useCallback(async (categoryId: string, name: string) => {
    if (!assetCategoryParentId) {
      alert('No parent selected');
      return;
    }
    try {
      const result = await safeExecuteCommand('CreateNode', {
        blueprint_type_id: categoryId,
        name,
        parent_id: assetCategoryParentId,
      });
      const graph = normalizeGraph(result.graph ?? result);
      setCurrentGraph(graph);
      setExpandedMap((prev) => ({ ...prev, [assetCategoryParentId]: true }));
      setShowAssetCategoryDialog(false);
      setAssetCategoryParentId(null);
      setIsDirty(result.is_dirty ?? true);
    } catch (err) {
      console.error('Failed to add asset category:', err);
      alert('Failed to add asset category');
    }
  }, [assetCategoryParentId, normalizeGraph, safeExecuteCommand, setCurrentGraph]);

  const handleImportSuccess = useCallback((details: {
    graph: Graph;
    createdNodeIds: string[];
    parentId: string;
    blueprintTypeId: string;
    createdCount: number;
    undoAvailable: boolean;
    redoAvailable: boolean;
  }) => {
    const graph = normalizeGraph(details.graph);
    setCurrentGraph(graph);
    setExpandedMap((prev) => ({ ...prev, [details.parentId]: true }));
    if (details.createdNodeIds.length > 0) {
      setSelectedNode(details.createdNodeIds[0]);
    }
    setIsDirty(true);
  }, [normalizeGraph, setCurrentGraph, setExpandedMap, setSelectedNode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + N - New Project
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleNew();
      }
      // Ctrl/Cmd + S - Save
      else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      // Ctrl/Cmd + Z - Undo
      else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y - Redo
      else if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
        e.preventDefault();
        handleRedo();
      }
      // Ctrl/Cmd + I - Toggle Inspector
      else if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        toggleInspector();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNew, handleSave, handleUndo, handleRedo, toggleInspector]);

  // Intercept Tauri window close request
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    
    const setupCloseHandler = async () => {
      console.log('[CLOSE HANDLER SETUP] Starting setup');
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const { listen } = await import('@tauri-apps/api/event');
        const appWindow = getCurrentWindow();
        console.log('[CLOSE HANDLER SETUP] Got window reference');
        
        // Listen for the custom close event emitted by Rust
        unlisten = await listen('tauri://close-requested', async () => {
          const currentIsDirty = isDirtyRef.current;
          console.log('====================================');
          console.log('[CLOSE REQUESTED] EVENT RECEIVED!');
          console.log('[CLOSE REQUESTED] isDirtyRef.current:', currentIsDirty);
          console.log('====================================');
          
          if (currentIsDirty) {
            console.log('[CLOSE REQUESTED] Dirty state detected, showing save dialog');
            // Set up the action to execute after user makes their choice
            pendingCloseActionRef.current = async () => {
              console.log('[CLOSE REQUESTED DESTROY] About to force close window...');
              try {
                const { invoke } = await import('@tauri-apps/api/core');
                console.log('[CLOSE REQUESTED DESTROY] Calling force_close_window');
                await invoke('force_close_window');
                console.log('[CLOSE REQUESTED DESTROY] Force close completed');
              } catch (err) {
                console.error('[CLOSE REQUESTED DESTROY] Error:', err);
              }
            };
            // Trigger the save dialog to show
            // Use setTimeout to ensure state update happens after event listener completes
            setTimeout(() => {
              console.log('[CLOSE REQUESTED] Setting showSaveConfirmDialog to true');
              setShowSaveConfirmDialog(true);
            }, 0);
          } else {
            console.log('[CLOSE REQUESTED] Clean state, force closing window...');
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              console.log('[CLOSE REQUESTED] Calling force_close_window');
              await invoke('force_close_window');
              console.log('[CLOSE REQUESTED] Force close completed');
            } catch (err) {
              console.error('[CLOSE REQUESTED] Force close failed:', err);
            }
          }
        });
        console.log('[CLOSE HANDLER SETUP] ✓ Event listener registered for tauri://close-requested');
      } catch (err) {
        console.error('[CLOSE HANDLER SETUP] ❌ Failed to setup close handler:', err);
      }
    };
    
    setupCloseHandler();
    
    return () => {
      console.log('[CLOSE HANDLER CLEANUP] Cleaning up event listener');
      if (unlisten) {
        unlisten();
      }
    };
  }, []);  // Empty deps - only setup once, use ref for current state

  // Handle save dialog confirmation
  const handleSaveConfirm = useCallback(async (action: SaveAction) => {
    console.log('[SAVE DIALOG] User selected action:', action);
    setShowSaveConfirmDialog(false);

    // Execute the action
    if (action === 'save') {
      console.log('[SAVE DIALOG] Saving...');
      const saved = await handleSave();
      if (!saved) {
        console.log('[SAVE DIALOG] Save canceled or failed, staying open');
        pendingCloseActionRef.current = null;
        return;
      }
    } else if (action === 'save-as') {
      console.log('[SAVE DIALOG] Save As...');
      const savedAs = await handleSaveAs();
      if (!savedAs) {
        console.log('[SAVE DIALOG] Save As canceled or failed, staying open');
        pendingCloseActionRef.current = null;
        return;
      }
    } else if (action === 'dont-save') {
      console.log('[SAVE DIALOG] Don\'t save, closing immediately');
    } else if (action === 'cancel') {
      console.log('[SAVE DIALOG] Cancel, staying open');
      pendingCloseActionRef.current = null;
      return;
    }

    // Execute the pending close action if user didn't cancel
    if ((action === 'save-as' || action === 'dont-save' || action === 'save') && pendingCloseActionRef.current) {
      console.log('[SAVE DIALOG] Executing pending close action, pendingCloseActionRef.current exists:', !!pendingCloseActionRef.current);
      try {
        console.log('[SAVE DIALOG] About to call close action...');
        // Use a timeout to ensure we actually close even if the promise hangs
        const closePromise = pendingCloseActionRef.current();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Close timeout')), 5000)
        );
        const result = await Promise.race([closePromise, timeoutPromise]);
        console.log('[SAVE DIALOG] Close action completed, result:', result);
      } catch (err) {
        console.error('[SAVE DIALOG] Close action failed or timed out:', err);
        // If destroy failed or timed out, try immediate fallback
        try {
          console.log('[SAVE DIALOG] Trying immediate fallback methods');
          // Try Tauri destroy with short timeout
          try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            const win = getCurrentWindow();
            await Promise.race([
              win.destroy(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
            ]);
            console.log('[SAVE DIALOG] Emergency destroy succeeded');
          } catch (tauri) {
            console.error('[SAVE DIALOG] Emergency destroy failed:', tauri);
            // Final fallback
            window.close?.();
          }
        } catch (fallbackErr) {
          console.error('[SAVE DIALOG] All close attempts failed:', fallbackErr);
        }
      }
      pendingCloseActionRef.current = null;
    }
  }, [handleSave, handleSaveAs]);

  // Menu configuration
  const menus = {
    File: [
      { label: 'New Project', onClick: handleNew },
      { label: 'Open Project...', onClick: handleOpen },
      { label: 'Save', onClick: handleSave },
      { label: 'Save As...', onClick: handleSaveAs },
      { label: '---', onClick: () => {} },
      { label: 'Refresh Blueprint', onClick: async () => {
        try {
          // Reload the template schema without losing the current graph
          const templateId = currentTemplateId;
          if (!templateId) {
            alert('No template is currently loaded.');
            return;
          }
          
          if (!sessionId) {
            alert('No active session. Please open or create a project first.');
            return;
          }
          
          console.log('Refreshing template schema:', templateId);
          const schema = await apiClient.getTemplateSchema(templateId);
          
          // Validate the refreshed schema
          const validation = validateTemplateSchema(schema);
          if (!validation.isValid) {
            console.error('Refreshed template validation failed:', validation.errors);
            alert(`Template validation failed:\n${validation.errors.join('\n')}`);
            return;
          }
          
          setTemplateSchema(schema);
          console.log('✓ Template schema refreshed successfully');
          clearIconCache();
          
          // Reload the blueprint in the backend session
          try {
            await apiClient.reloadBlueprint(sessionId);
            console.log('✓ Backend blueprint reloaded from disk');
          } catch (blueprintErr) {
            console.warn('Failed to reload backend blueprint:', blueprintErr);
            // Continue anyway - the frontend schema is updated
          }
          
          // Reload the graph from backend to get updated allowedchildren on nodes
          try {
            const graphData = await apiClient.getSessionGraph(sessionId);
            const refreshedGraph = normalizeGraph(graphData.graph);
            setCurrentGraph(refreshedGraph);
            console.log('✓ Graph reloaded with updated node metadata');
          } catch (graphErr) {
            console.warn('Failed to reload graph after schema refresh:', graphErr);
            // Schema is still updated, just nodes might have stale allowed_children
          }
          
          alert('Template schema refreshed successfully!');
        } catch (error) {
          console.error('Failed to refresh blueprint:', error);
          alert(`Failed to refresh template: ${error instanceof Error ? error.message : String(error)}`);
        }
      } },
      { label: '---', onClick: () => {} },
      { label: 'Exit', onClick: async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('exit_app');
        } catch {
          window.close?.();
        }
      } },
    ],
    Edit: [
      { label: 'Undo', onClick: handleUndo },
      { label: 'Redo', onClick: handleRedo },
    ],
    View: [
      { label: 'Toggle Properties Panel', onClick: toggleInspector },
      { label: 'Expand All', onClick: handleExpandAll },
      { label: 'Collapse All', onClick: handleCollapseAll },
    ],
    Tools: [
      { label: 'Import from CSV...', onClick: () => setShowImportDialog(true) },
      { label: 'Template Editor', onClick: () => setShowTemplateEditor(true) },
      { label: 'Settings', onClick: () => setShowSettingsDialog(true) },
    ],
    Help: [
      { label: 'Documentation', onClick: () => console.log('Docs - TODO') },
      { label: 'About', onClick: () => console.log('About - TODO') },
    ],
  };

  return (
    <ErrorBoundary>
      {!isAppInitialized || isInitialConnection ? (
        <div className="flex items-center justify-center h-screen bg-bg-dark text-fg-primary">
          <div className="text-center">
            <div className="text-2xl mb-4">Loading Talus Tally...</div>
            <div className="text-sm text-fg-secondary">
              {isInitialConnection ? 'Connecting to backend server...' : 'Initializing session...'}
            </div>
          </div>
        </div>
      ) : backendError ? (
        <div className="flex items-center justify-center h-screen bg-bg-dark text-fg-primary">
          <div className="text-center max-w-md">
            <div className="text-2xl mb-4 text-red-500">Connection Error</div>
            <div className="text-sm text-fg-secondary mb-6">{backendError}</div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              Retry Connection
            </button>
          </div>
        </div>
      ) : (
      <div className="flex flex-col h-screen bg-bg-dark text-fg-primary relative">
      <TitleBar title={isDirty ? "TALUS TALLY *" : "TALUS TALLY"} isDirty={isDirty} onClose={handleCloseApp} />
      <MenuBar menus={menus} />

      {/* Main Content - Tree View with Optional Inspector */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Tree View */}
        <main className="flex-1 bg-bg-dark border-r border-border overflow-auto p-4">
          {treeNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-fg-secondary">
              <div className="text-lg mb-4">No project loaded</div>
              <div className="text-sm">Use File → New Project to get started</div>
            </div>
          ) : (
            <TreeView
              nodes={treeNodes}
              onSelectNode={setSelectedNode}
              expandAllSignal={expandAllSignal}
              collapseAllSignal={collapseAllSignal}
              getTypeLabel={(typeId) => {
                if (!templateSchema) return typeId;
                const typeSchema = templateSchema.node_types.find(nt => nt.id === typeId);
                return typeSchema?.name || typeId;
              }}
              expandedMap={expandedMap}
              setExpandedMap={setExpandedMap}
              onContextMenu={(nodeId, action) => {
                console.log(`Context menu action "${action}" on node:`, nodeId);
                if (action === 'add-asset-category') {
                  setAssetCategoryParentId(nodeId);
                  setShowAssetCategoryDialog(true);
                  return;
                }
                if (action.startsWith('add:')) {
                  const type = action.split(':')[1];
                  const node = storeNodes[nodeId];
                  if (!node) {
                    alert('Node not found');
                    return;
                  }
                  if (type === 'assets' || type === 'asset_category') {
                    setAssetCategoryParentId(nodeId);
                    setShowAssetCategoryDialog(true);
                    return;
                  }
                  if (type === 'asset_reference' || type === 'uses_camera_gear' || type === 'uses_car_part' || type === 'uses_tool') {
                    setAssetSelectParentId(nodeId);
                    setAssetSelectNodeType(type);
                    setShowAssetSelectDialog(true);
                    return;
                  }
                  // Find the child type name from template schema for dialog title
                  let childTypeName = type;
                  if (templateSchema) {
                    const childTypeSchema = templateSchema.node_types.find(nt => nt.id === type);
                    if (childTypeSchema) {
                      childTypeName = childTypeSchema.name;
                    }
                  }
                  openAddChildDialog(nodeId, node.properties?.name, childTypeName, type);
                } else if (action === 'delete') {
                  if (confirm('Delete this node?')) {
                    safeExecuteCommand('DeleteNode', {
                        node_id: nodeId,
                      })
                      .then((result) => {
                        const graph = normalizeGraph(result.graph ?? result);
                        setCurrentGraph(graph);
                        setIsDirty(result.is_dirty ?? true);  // Update dirty state from API
                        console.log('✓ Node deleted via API');
                      })
                      .catch((err) => {
                        console.error('Failed to delete node:', err);
                        alert('Failed to delete node');
                      });
                  }
                } else if (action.startsWith('move:')) {
                  const newParentId = action.split(':')[1];
                  console.log(`Moving node ${nodeId} to new parent ${newParentId}`);
                  safeExecuteCommand('MoveNode', {
                    node_id: nodeId,
                    new_parent_id: newParentId,
                  })
                    .then((result) => {
                      const graph = normalizeGraph(result.graph ?? result);
                      setCurrentGraph(graph);
                      setIsDirty(result.is_dirty ?? true);
                      console.log('✓ Node moved via API');
                    })
                    .catch((err) => {
                      const msg = err instanceof Error ? err.message : String(err);
                      console.error('Failed to move node:', err);
                      // Extract error message from response
                      const errorMsg = msg.includes('not allowed') ? msg : 'Failed to move node to this location';
                      alert(`Cannot move node: ${errorMsg}`);
                    });
                } else if (action.startsWith('reorder:')) {
                  // Handle reorder drop zone
                  // action format: reorder:<targetNodeId>:<above|below>
                  const [, targetNodeId, position] = action.split(':');
                  const targetNode = storeNodes[targetNodeId];
                  const draggedNode = storeNodes[nodeId];
                  const normalizeId = (value: unknown) => (value === null || value === undefined ? null : String(value));
                  const findParentId = (childId?: string): string | null => {
                    if (!childId) return null;
                    for (const candidate of Object.values(storeNodes ?? {})) {
                      if (candidate?.children?.includes(childId)) {
                        return candidate.id;
                      }
                    }
                    return null;
                  };

                  const targetParentId = normalizeId(targetNode?.parent_id ?? findParentId(targetNodeId));
                  const draggedParentId = normalizeId(draggedNode?.parent_id ?? findParentId(nodeId));
                  if (!targetNode || !draggedNode || targetParentId !== draggedParentId) {
                    alert('Invalid reorder operation');
                    return;
                  }

                  const collectRootIds = (): string[] => {
                    if (Array.isArray(treeNodes) && treeNodes.length > 0) {
                      return treeNodes.map((root) => root.id);
                    }
                    const allNodes = Object.values(storeNodes ?? {});
                    const childIds = new Set<string>();
                    allNodes.forEach((n) => n.children?.forEach((childId) => childIds.add(childId)));
                    return allNodes
                      .filter((n) => !childIds.has(n.id))
                      .map((n) => n.id);
                  };

                  let siblings: string[];
                  if (targetParentId) {
                    const parentNode = storeNodes[targetParentId];
                    if (!parentNode || !Array.isArray(parentNode.children)) {
                      alert('Parent not found for reorder');
                      return;
                    }
                    siblings = parentNode.children.slice();
                  } else {
                    siblings = collectRootIds();
                  }

                  const filteredSiblings = siblings.filter((id) => id !== nodeId);
                  const targetIndex = filteredSiblings.indexOf(targetNodeId);
                  if (targetIndex === -1) {
                    alert('Target position unavailable for reorder');
                    return;
                  }
                  let newIndex = targetIndex;
                  if (position === 'below') {
                    newIndex += 1;
                  }

                  safeExecuteCommand('ReorderNode', {
                    node_id: nodeId,
                    new_index: newIndex,
                  })
                    .then((result) => {
                      const graph = normalizeGraph(result.graph ?? result);
                      setCurrentGraph(graph);
                      setIsDirty(result.is_dirty ?? true);
                      console.log('✓ Node reordered via API');
                    })
                    .catch((err) => {
                      const msg = err instanceof Error ? err.message : String(err);
                      console.error('Failed to reorder node:', err);
                      alert(`Cannot reorder node: ${msg}`);
                    });
                }
              }}
            />
          )}
        </main>

        {/* Inspector Panel - Collapsible */}
        {inspectorOpen && (
          <aside className="w-80 h-full bg-bg-darker border-l border-border flex flex-col flex-shrink-0">
            <Inspector
              nodeId={selectedNode || undefined}
              nodeName={selectedNodeData?.properties?.name || selectedNode || undefined}
              nodeType={selectedNodeData?.type || undefined}
              properties={nodeProperties}
              linkedAsset={linkedAsset}
              orphanedProperties={selectedNodeData?.metadata?.orphaned_properties as Record<string, string | number> | undefined}
              onOrphanedPropertyDelete={(propKey) => {
                if (!selectedNodeData || !currentGraph) return;
                
                // Remove the orphaned property from metadata
                const updatedMetadata = { ...selectedNodeData.metadata };
                if (updatedMetadata.orphaned_properties) {
                  delete updatedMetadata.orphaned_properties[propKey];
                  
                  // If no more orphaned properties, remove the object
                  if (Object.keys(updatedMetadata.orphaned_properties).length === 0) {
                    delete updatedMetadata.orphaned_properties;
                  }
                }
                
                // Update the node's metadata
                const updatedNode: Node = {
                  ...selectedNodeData,
                  metadata: updatedMetadata
                };
                
                // Update the graph
                const updatedGraph: Graph = {
                  id: currentGraph.id,
                  nodes: currentGraph.nodes.map(n => 
                    n.id === selectedNodeData.id ? updatedNode : n
                  ),
                  edges: currentGraph.edges
                };
                
                setCurrentGraph(updatedGraph);
                setIsDirty(true);
                console.log(`✓ Deleted orphaned property: ${propKey}`);
              }}
              onPropertyChange={(propId, value) => {
                if (!selectedNodeData) {
                  alert('No node selected');
                  return;
                }
                console.log('[onPropertyChange] Starting property update:', {
                  nodeId: selectedNodeData.id,
                  propId,
                  oldValue: selectedNodeData.properties?.[propId],
                  newValue: value
                });
                safeExecuteCommand('UpdateProperty', {
                    node_id: selectedNodeData.id,
                    property_id: propId,
                    old_value: selectedNodeData.properties?.[propId],
                    new_value: value,
                  })
                  .then((result) => {
                    console.log('[onPropertyChange] Got result from API');
                    console.log('[onPropertyChange] Result keys:', Object.keys(result));
                    console.log('[onPropertyChange] Result.graph:', result.graph);
                    console.log('[onPropertyChange] Result.graph.roots count:', result.graph?.roots?.length);
                    console.log('[onPropertyChange] Starting normalizeGraph...');
                    try {
                      const graph = normalizeGraph(result.graph ?? result);
                      console.log('[onPropertyChange] Graph normalized successfully, nodes:', graph.nodes.length);
                      setCurrentGraph(graph);
                      setIsDirty(result.is_dirty ?? true);  // Update dirty state from API
                      console.log('✓ Property updated');
                    } catch (error) {
                      console.error('[onPropertyChange] Error normalizing graph:', error);
                      alert('Error updating UI after property change: ' + (error as Error).message);
                    }
                  })
                  .catch((err) => {
                    console.error('Failed to update property:', err);
                    alert('Failed to update property');
                  });
              }}
              onLinkedAssetPropertyChange={(propId, value) => {
                const linkedAssetMetadata = getLinkedAssetMetadata();
                if (!linkedAssetMetadata) {
                  alert('No linked asset');
                  return;
                }
                // Update the linked asset node, not the reference node
                safeExecuteCommand('UpdateProperty', {
                    node_id: linkedAssetMetadata.nodeId,
                    property_id: propId,
                    old_value: storeNodes[linkedAssetMetadata.nodeId]?.properties?.[propId],
                    new_value: value,
                  })
                  .then((result) => {
                    const graph = normalizeGraph(result.graph ?? result);
                    setCurrentGraph(graph);
                    setIsDirty(result.is_dirty ?? true);  // Update dirty state from API
                    console.log('✓ Asset property updated');
                  })
                  .catch((err) => {
                    console.error('Failed to update asset property:', err);
                    alert('Failed to update asset property');
                  });
              }}
            />
          </aside>
        )}
      </div>

      {/* New Project Dialog */}
      {showNewProjectDialog && (
        <NewProjectDialog
          templates={templates}
          onConfirm={handleCreateProject}
          onCancel={() => setShowNewProjectDialog(false)}
        />
      )}


      {/* Dev-only Debug Panel */}
      {process.env.NODE_ENV !== 'production' && (
        <DebugPanel treeNodes={treeNodes} expandedMap={expandedMap} logs={debugLogs} />
      )}

      {/* New Project Dialog */}
      {showNewProjectDialog && (
        <NewProjectDialog
          templates={templates}
          onConfirm={handleCreateProject}
          onCancel={() => setShowNewProjectDialog(false)}
        />
      )}
      {/* Add Child Dialog */}
      {showAddChildDialog && (
        <AddChildDialog
          title={addChildTitle}
          confirmLabel={addChildTitle?.replace(/^Add /, 'Add ') || 'Add Child'}
          onConfirm={handleAddChildConfirm}
          onCancel={() => {
            setShowAddChildDialog(false);
            setAddChildParentId(null);
            setAddChildType(undefined);
          }}
        />
      )}

      {showAssetSelectDialog && (
        <AssetSelectDialog
          title="Select Asset to Use"
          assets={assetOptions(assetSelectNodeType)}
          onConfirm={handleAssetSelectConfirm}
          onCancel={() => {
            setShowAssetSelectDialog(false);
            setAssetSelectParentId(null);
            setAssetSelectNodeType('asset_reference');
          }}
        />
      )}

      {showAssetCategoryDialog && (
        <AssetCategoryDialog
          title="Add Asset Category"
          categories={assetCategoryOptions()}
          onConfirm={handleAssetCategoryConfirm}
          onCancel={() => {
            setShowAssetCategoryDialog(false);
            setAssetCategoryParentId(null);
          }}
        />
      )}

      {showImportDialog && (
        <ImportCsvDialog
          isOpen={showImportDialog}
          selectedNodeId={selectedNode}
          nodes={storeNodes}
          templateSchema={templateSchema}
          ensureSession={ensureSession}
          onClose={() => setShowImportDialog(false)}
          onImported={handleImportSuccess}
        />
      )}

      {/* Settings Dialog */}
      {showSettingsDialog && (
        <SettingsDialog
          isOpen={showSettingsDialog}
          onClose={() => setShowSettingsDialog(false)}
        />
      )}

      {/* Template Editor View */}
      {showTemplateEditor && (
        <div className="absolute inset-0 bg-bg-dark z-50">
          <TemplateEditor onClose={() => setShowTemplateEditor(false)} />
        </div>
      )}

      {/* Save Confirm Dialog */}
      <SaveConfirmDialog
        isOpen={showSaveConfirmDialog}
        onConfirm={handleSaveConfirm}
        onCancel={() => {
          console.log('[SAVE DIALOG] User clicked Cancel');
          setShowSaveConfirmDialog(false);
          pendingCloseActionRef.current = null;
        }}
      />
    </div>
      )}
  </ErrorBoundary>
  );
}

export default App;
