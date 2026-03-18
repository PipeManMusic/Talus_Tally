import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { apiClient, type Node as NodeType, type TemplateSchema } from '../../api/client';
import { mapNodeIcon, subscribeToIconCache } from '../graph/mapNodeIcon';
import { AlertCircle } from 'lucide-react';
import { useFilterStore } from '../../store/filterStore';
import { evaluateNodeVisibility } from '../../utils/filterEngine';
import { buildBlockingHierarchyLayout } from '../../utils/blockingLayout';

// Helper to recolor SVG fills and strokes with a single color
const recolorSvg = (svgString: string, color: string | undefined): string => {
  if (!color || !svgString) return svgString;
  let recolored = svgString;
  recolored = recolored
    .replace(/fill="([^"]*)"/gi, (_match, value) => {
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'none' || normalized === 'transparent') {
        return `fill="${value}"`;
      }
      return `fill="${color}"`;
    })
    .replace(/fill='([^']*)'/gi, (_match, value) => {
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'none' || normalized === 'transparent') {
        return `fill='${value}'`;
      }
      return `fill='${color}'`;
    })
    .replace(/stroke="([^"]*)"/gi, (_match, value) => {
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'none' || normalized === 'transparent') {
        return `stroke="${value}"`;
      }
      return `stroke="${color}"`;
    });
  return recolored;
};

const iconDefaults: Record<string, string> = {
  project_root: 'film',
  assets: 'archive-box',
  inventory_root: 'archive-box',
  camera_gear_inventory: 'camera',
  camera_gear_category: 'camera',
  camera_gear_asset: 'camera',
  parts_inventory: 'cog',
  part_category: 'cog',
  part_asset: 'cog',
  car_parts_inventory: 'cog',
  tools_inventory: 'cog',
  tool_category: 'cog',
  tool_asset: 'cog',
  vehicles: 'truck',
  vehicle_asset: 'truck',
  phase: 'calendar-days',
  season: 'calendar-days',
  episode: 'video-camera',
  task: 'clipboard-document-check',
  footage: 'play-circle',
  location_scout: 'map-pin',
};

interface Edge {
  from: string;
  to: string;
}

interface NodeData {
  id: string;
  label: string;
  x: number;
  y: number;
}

interface Props {
  sessionId: string | null;
  nodes: Record<string, NodeType>;
  velocityScores?: Record<string, any>;
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
  onCountsChange?: (nodeCount: number, edgeCount: number) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  fitToViewSignal?: number;
  refreshSignal?: number;
  blockingViewConfig?: TemplateSchema['blocking_view'];
  templateSchema?: TemplateSchema | null;
}

export function NodeBlockingEditor({ sessionId, nodes, velocityScores = {}, selectedNodeId, onNodeSelect, onCountsChange, onDirtyChange, fitToViewSignal, refreshSignal, blockingViewConfig, templateSchema }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDev = import.meta.env.DEV;
  const { rules, filterMode } = useFilterStore();
  const [nodePositions, setNodePositions] = useState<NodeData[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [drawingWire, setDrawingWire] = useState<{ from: string; x: number; y: number } | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [spacePressed, setSpacePressed] = useState(false);
  const [nodeDepths, setNodeDepths] = useState<Record<string, number>>({});
  const [parentNodeIds, setParentNodeIds] = useState<Record<string, string | undefined>>({});
  const [iconSvgs, setIconSvgs] = useState<Record<string, string | undefined>>({});
  const [iconCacheVersion, setIconCacheVersion] = useState(0);
  const fitToViewRef = useRef<() => void>(() => {});

  const typeSchemaMap = useMemo(() => {
    const map = new Map<string, { color?: string; shape?: string }>();
    templateSchema?.node_types?.forEach((nodeType) => {
      const color = (nodeType as any).color ?? (nodeType as any).schema_color ?? (nodeType as any).schemaColor;
      const shape = (nodeType as any).shape ?? (nodeType as any).schema_shape ?? (nodeType as any).schemaShape;
      map.set(nodeType.id, { color, shape });
    });
    return map;
  }, [templateSchema]);

  const maxDepthObserved = useMemo(() => {
    const depths = Object.values(nodeDepths);
    if (depths.length === 0) return 0;
    return depths.reduce((max, value) => (value > max ? value : max), 0);
  }, [nodeDepths]);

  const nodeSizeConfig = useMemo(() => {
    const fallback = {
      baseWidth: 160,
      baseHeight: 100,
      maxDepth: 6,
      minScale: 0.7,
      maxScale: 1.3,
      direction: 'down' as const,
    };

    const config = blockingViewConfig?.node_size || {};
    const baseWidth = Math.max(40, Number(config.base_width ?? fallback.baseWidth));
    const baseHeight = Math.max(30, Number(config.base_height ?? fallback.baseHeight));
    const maxDepth = Math.max(1, Math.floor(Number(config.max_depth ?? fallback.maxDepth)));
    const rawMin = Number(config.min_scale ?? fallback.minScale);
    const rawMax = Number(config.max_scale ?? fallback.maxScale);
    const minScale = Math.max(0.1, Math.min(rawMin, rawMax));
    const maxScale = Math.max(minScale + 0.01, Math.max(rawMin, rawMax));
    const direction = config.direction === 'up' ? 'up' : 'down';

    return { baseWidth, baseHeight, maxDepth, minScale, maxScale, direction };
  }, [blockingViewConfig]);

  const getEffectiveMaxDepth = useCallback(() => {
    if (maxDepthObserved <= 0) return nodeSizeConfig.maxDepth;
    return Math.max(1, Math.min(nodeSizeConfig.maxDepth, maxDepthObserved));
  }, [maxDepthObserved, nodeSizeConfig.maxDepth]);

  const nodeVisibility = useMemo(() => {
    const visibility = new Map<string, boolean>();
    Object.entries(nodes).forEach(([nodeId, node]) => {
      visibility.set(nodeId, evaluateNodeVisibility({
        id: node.id,
        name: node.properties?.name || node.id,
        type: node.type,
        properties: node.properties || {},
        velocity: velocityScores[nodeId],
      }, rules));
    });
    return visibility;
  }, [nodes, rules, velocityScores]);

  const getNodeScale = useCallback((nodeId: string) => {
    const depth = nodeDepths[nodeId] ?? 0;
    const effectiveMax = getEffectiveMaxDepth();
    const clampedDepth = Math.min(depth, effectiveMax);
    const t = effectiveMax > 0 ? clampedDepth / effectiveMax : 0;
    return nodeSizeConfig.direction === 'up'
      ? nodeSizeConfig.minScale + (nodeSizeConfig.maxScale - nodeSizeConfig.minScale) * t
      : nodeSizeConfig.maxScale - (nodeSizeConfig.maxScale - nodeSizeConfig.minScale) * t;
  }, [getEffectiveMaxDepth, nodeDepths, nodeSizeConfig.direction, nodeSizeConfig.maxScale, nodeSizeConfig.minScale]);

  const MIN_CANVAS_SCALE = 0.02;
  const MAX_CANVAS_SCALE = 20;

  const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const hexToRgb = (hex: string) => {
    const parsed = hex.trim();
    if (!/^#([0-9a-fA-F]{6})$/.test(parsed)) {
      return null;
    }
    const num = parseInt(parsed.slice(1), 16);
    return {
      r: (num >> 16) & 0xff,
      g: (num >> 8) & 0xff,
      b: num & 0xff,
    };
  };

  const rgbToHsl = (r: number, g: number, b: number) => {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (delta !== 0) {
      s = delta / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case rn:
          h = ((gn - bn) / delta) % 6;
          break;
        case gn:
          h = (bn - rn) / delta + 2;
          break;
        case bn:
          h = (rn - gn) / delta + 4;
          break;
      }
      h *= 60;
      if (h < 0) h += 360;
    }

    return { h, s, l };
  };

  const hslToRgb = (h: number, s: number, l: number) => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let rn = 0;
    let gn = 0;
    let bn = 0;

    if (h >= 0 && h < 60) {
      rn = c;
      gn = x;
    } else if (h >= 60 && h < 120) {
      rn = x;
      gn = c;
    } else if (h >= 120 && h < 180) {
      gn = c;
      bn = x;
    } else if (h >= 180 && h < 240) {
      gn = x;
      bn = c;
    } else if (h >= 240 && h < 300) {
      rn = x;
      bn = c;
    } else {
      rn = c;
      bn = x;
    }

    return {
      r: Math.round((rn + m) * 255),
      g: Math.round((gn + m) * 255),
      b: Math.round((bn + m) * 255),
    };
  };

  const adjustHexColor = (color: string, delta: number, saturationDelta = 0) => {
    const rgb = hexToRgb(color);
    if (!rgb) {
      return color;
    }
    const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const deltaL = (delta / 255) * 100;
    const nextL = clampNumber(l * 100 + deltaL, 0, 100) / 100;
    const nextS = clampNumber(s * 100 + saturationDelta, 0, 100) / 100;
    const { r, g, b } = hslToRgb(h, nextS, nextL);
    return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  };

  const mixHexColors = (colorA: string, colorB: string, weight = 0.5) => {
    const rgbA = hexToRgb(colorA);
    const rgbB = hexToRgb(colorB);
    if (!rgbA || !rgbB) {
      return colorA;
    }
    const w = clampNumber(weight, 0, 1);
    const r = Math.round(rgbA.r * (1 - w) + rgbB.r * w);
    const g = Math.round(rgbA.g * (1 - w) + rgbB.g * w);
    const b = Math.round(rgbA.b * (1 - w) + rgbB.b * w);
    return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  };

  const getShapeType = (shape?: string) => {
    const normalized = shape?.trim();
    if (!normalized) return 'roundedSquare';
    return normalized;
  };

  useEffect(() => {
    const unsubscribe = subscribeToIconCache(() => {
      setIconCacheVersion((version) => version + 1);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isDev) return;
    const dailyDriver = Object.values(nodes).find(
      (node) => node?.properties?.name?.toLowerCase?.() === 'daily driver'
    );
    if (!dailyDriver) return;
    const typeSchema = typeSchemaMap.get(dailyDriver.type);
    console.debug('[NodeBlockingEditor] Daily Driver colors', {
      nodeId: dailyDriver.id,
      nodeType: dailyDriver.type,
      nodeSchemaColor: dailyDriver.schema_color,
      templateTypeColor: typeSchema?.color,
      nodeSchemaShape: dailyDriver.schema_shape,
      templateTypeShape: typeSchema?.shape,
    });
  }, [isDev, nodes, typeSchemaMap]);

  // Calculate node hierarchy and positions
  useEffect(() => {
    const nodeIds = Object.keys(nodes);
    if (nodeIds.length === 0) {
      setNodeDepths({});
      setParentNodeIds({});
      setNodePositions([]);
      return;
    }

    const layout = buildBlockingHierarchyLayout(nodes, {
      visibleNodeIds: new Set(
        nodeIds.filter((id) => nodeVisibility.get(id) ?? true),
      ),
      hideFilteredNodes: filterMode === 'hide' && rules.length > 0,
      baseWidth: nodeSizeConfig.baseWidth,
      baseHeight: nodeSizeConfig.baseHeight,
      maxScale: nodeSizeConfig.maxScale,
    });

    setNodeDepths(layout.depths);
    setParentNodeIds(layout.parentIds);
    setNodePositions(layout.positions);
  }, [nodes, filterMode, nodeSizeConfig.baseWidth, nodeSizeConfig.baseHeight, nodeSizeConfig.maxScale, nodeVisibility, rules.length]);

  useEffect(() => {
    let isMounted = true;
    const iconIds = new Map<string, string | undefined>();

    nodePositions.forEach((nodeData) => {
      const node = nodes[nodeData.id];
      if (!node) return;
      const iconSourceId = (node as any).icon_id ?? iconDefaults[node.type] ?? node.type ?? undefined;
      iconIds.set(nodeData.id, iconSourceId);
    });

    setIconSvgs((prev) => {
      const next: Record<string, string | undefined> = {};
      iconIds.forEach((_iconId, nodeId) => {
        if (nodeId in prev) {
          next[nodeId] = prev[nodeId];
        }
      });
      return next;
    });

    iconIds.forEach((iconId, nodeId) => {
      if (!iconId) {
        setIconSvgs((prev) => {
          if (!prev[nodeId]) return prev;
          const next = { ...prev };
          delete next[nodeId];
          return next;
        });
        return;
      }

      mapNodeIcon(iconId)
        .then((icon) => {
          if (!isMounted) return;
          setIconSvgs((prev) => {
            if (prev[nodeId] === icon) return prev;
            return { ...prev, [nodeId]: icon };
          });
        })
        .catch((err) => {
          console.warn('[NodeBlockingEditor] Failed to load icon', iconId, err);
          if (!isMounted) return;
          setIconSvgs((prev) => {
            if (!prev[nodeId]) return prev;
            const next = { ...prev };
            delete next[nodeId];
            return next;
          });
        });
    });

    return () => {
      isMounted = false;
    };
  }, [nodes, nodePositions, iconCacheVersion]);



  // Keyboard handlers for space pan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spacePressed) {
        setSpacePressed(true);
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [spacePressed]);

  const fetchRelationships = useCallback(async () => {
    if (!sessionId) return;
    try {
      const response = await apiClient.getBlockingGraph(sessionId);
      setEdges(response.relationships.map(r => ({
        from: r.blockingNodeId,
        to: r.blockedNodeId
      })));
    } catch (error) {
      console.error('Failed to fetch blocking relationships:', error);
    }
  }, [sessionId]);

  // Fetch existing relationships
  useEffect(() => {
    fetchRelationships();
  }, [fetchRelationships, refreshSignal]);

  // Notify parent of counts changes
  useEffect(() => {
    onCountsChange?.(nodePositions.length, edges.length);
  }, [nodePositions, edges, onCountsChange]);

  const getNodePosition = (nodeId: string) => {
    return nodePositions.find(n => n.id === nodeId);
  };

  const displayedNodeIds = useMemo(() => {
    return new Set(nodePositions.map((node) => node.id));
  }, [nodePositions]);

  const handleNodeMouseDown = (nodeId: string, e: React.MouseEvent) => {
    if (e.button === 0) { // Left click
      setDraggingNode(nodeId);
      e.preventDefault();
    }
  };

  const handleNodeStartWire = (nodeId: string, e: React.MouseEvent) => {
    if (!svgRef.current) return;
    e.stopPropagation();
    
    // Calculate mouse position in canvas coordinates
    const rect = svgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / scale;
    const y = (e.clientY - rect.top - pan.y) / scale;
    
    setDrawingWire({ from: nodeId, x, y });
  };

  const handleSVGMouseMove = (e: React.MouseEvent) => {
    if (!svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / scale;
    const y = (e.clientY - rect.top - pan.y) / scale;

    if (draggingNode) {
      const scaleFactor = getNodeScale(draggingNode);
      const width = nodeSizeConfig.baseWidth * scaleFactor;
      const height = nodeSizeConfig.baseHeight * scaleFactor;
      setNodePositions(positions =>
        positions.map(n =>
          n.id === draggingNode
            ? { ...n, x: x - width / 2, y: y - height / 2 }
            : n
        )
      );
    }

    if (drawingWire) {
      setDrawingWire(w => w ? { ...w, x, y } : null);
    }

    if (isPanning) {
      const newX = pan.x + (e.clientX - rect.left - panStart.x);
      const newY = pan.y + (e.clientY - rect.top - panStart.y);
      setPan({ x: newX, y: newY });
      setPanStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const handleSVGMouseUp = () => {
    setDraggingNode(null);
    setIsPanning(false);
  };

  const handleNodeMouseEnter = (nodeId: string) => {
    if (!drawingWire) {
      setHoveredNode(nodeId);
    }
  };

  const handleNodeMouseLeave = () => {
    if (!drawingWire) {
      setHoveredNode(null);
    }
  };

  const handleNodeDrop = async (toNodeId: string) => {
    if (!drawingWire || !sessionId) return;

    const { from } = drawingWire;
    
    if (from === toNodeId) {
      setMessage({ type: 'error', text: 'A node cannot block itself' });
      setDrawingWire(null);
      return;
    }

    if (edges.some(e => e.from === from && e.to === toNodeId)) {
      setMessage({ type: 'error', text: 'This relationship already exists' });
      setDrawingWire(null);
      return;
    }

    try {
      const result = await apiClient.updateBlockingRelationship(sessionId, toNodeId, from);
      await fetchRelationships();
      setMessage({ type: 'success', text: 'Blocking relationship created' });
      if (typeof result?.is_dirty === 'boolean') {
        onDirtyChange?.(result.is_dirty);
      } else {
        onDirtyChange?.(true);
      }
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to create relationship' });
    }

    setDrawingWire(null);
  };

  const handleSVGMouseDown = (e: React.MouseEvent) => {
    // Middle mouse button or space+left click for panning
    const isMiddleClick = e.button === 1;
    const isSpaceClick = spacePressed && e.button === 0 && !draggingNode;

    if (isMiddleClick || isSpaceClick) {
      setIsPanning(true);
      const rect = svgRef.current!.getBoundingClientRect();
      setPanStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      e.preventDefault();
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    if (!svgRef.current) {
      return;
    }

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Use whichever wheel axis carries the dominant scroll intent. This keeps
    // direction stable across mice/trackpads where Shift may emit deltaX.
    const rawDelta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (rawDelta === 0) {
      return;
    }

    // Scroll up (negative delta) zooms in. Holding Shift doubles zoom speed.
    const normalizedUnits = Math.abs(rawDelta) / 100;
    const zoomPerUnit = e.shiftKey ? 1.2 : 1.1;
    const signedExponent = rawDelta < 0 ? normalizedUnits : -normalizedUnits;
    const scaleMultiplier = Math.pow(zoomPerUnit, signedExponent);
    const nextScaleUnclamped = scale * scaleMultiplier;
    const nextScale = Math.max(MIN_CANVAS_SCALE, Math.min(MAX_CANVAS_SCALE, nextScaleUnclamped));

    // Keep the world-point under cursor stationary during zoom.
    const worldX = (mouseX - pan.x) / scale;
    const worldY = (mouseY - pan.y) / scale;
    const nextPanX = mouseX - worldX * nextScale;
    const nextPanY = mouseY - worldY * nextScale;

    setScale(nextScale);
    setPan({ x: nextPanX, y: nextPanY });
  };

  const fitToView = useCallback(() => {
    if (nodePositions.length === 0 || !svgRef.current) return;

    // Calculate bounds of all nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const getNodeSize = (nodeId: string) => {
      const scaleFactor = getNodeScale(nodeId);
      return {
        width: nodeSizeConfig.baseWidth * scaleFactor,
        height: nodeSizeConfig.baseHeight * scaleFactor,
      };
    };

    nodePositions.forEach(node => {
      const size = getNodeSize(node.id);
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + size.width);
      maxY = Math.max(maxY, node.y + size.height);
    });

    const svgRect = svgRef.current.getBoundingClientRect();
    const svgWidth = svgRect.width;
    const svgHeight = svgRect.height;
    if (svgWidth < 2 || svgHeight < 2) {
      return;
    }

    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;

    const safeBoundsWidth = Math.max(boundsWidth, 1);
    const safeBoundsHeight = Math.max(boundsHeight, 1);
    const scaleX = svgWidth / safeBoundsWidth;
    const scaleY = svgHeight / safeBoundsHeight;
    // Slightly bias outward so boundary nodes are guaranteed visible.
    const fitScale = Math.min(scaleX, scaleY) * 0.98;
    const newScale = Math.max(MIN_CANVAS_SCALE, Math.min(MAX_CANVAS_SCALE, fitScale));

    // Center the view
    const centeredX = (svgWidth / 2) - ((minX + boundsWidth / 2) * newScale);
    const centeredY = (svgHeight / 2) - ((minY + boundsHeight / 2) * newScale);

    setScale(newScale);
    setPan({ x: centeredX, y: centeredY });
  }, [MAX_CANVAS_SCALE, MIN_CANVAS_SCALE, getNodeScale, nodePositions, nodeSizeConfig.baseHeight, nodeSizeConfig.baseWidth]);

  useEffect(() => {
    fitToViewRef.current = fitToView;
  }, [fitToView]);

  useEffect(() => {
    if (fitToViewSignal === undefined) return;

    // Run immediately and retry once after the frame/paint so toolbar clicks that
    // happen during layout changes still settle on correct bounds.
    fitToViewRef.current();
    const rafId = window.requestAnimationFrame(() => fitToViewRef.current());
    const timeoutId = window.setTimeout(() => fitToViewRef.current(), 80);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
    };
  }, [fitToViewSignal]);

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-full bg-bg-dark text-fg-secondary">
        <div className="text-center">
          <AlertCircle size={48} className="mx-auto mb-3 opacity-50" />
          <p>Please open a project to configure blocking relationships</p>
        </div>
      </div>
    );
  }

  const getNodeSize = (nodeId: string) => {
    const scaleFactor = getNodeScale(nodeId);
    return {
      width: nodeSizeConfig.baseWidth * scaleFactor,
      height: nodeSizeConfig.baseHeight * scaleFactor,
    };
  };
  const edgeKey = (edge: Edge) => `${edge.from}-${edge.to}`;

  return (
    <div className="flex flex-col h-full bg-bg-dark">
      {message && (
        <div className={`mx-4 mt-3 p-2 rounded-md text-sm ${
          message.type === 'success' ? 'bg-status-success/20 text-status-success' : 'bg-status-danger/20 text-status-danger'
        }`}>
          {message.text}
        </div>
      )}

      {/* Main Content: Canvas + Properties Panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 overflow-hidden relative bg-gradient-to-br from-bg-dark to-bg-light cursor-grab active:cursor-grabbing">
        <svg
          ref={svgRef}
          className="w-full h-full"
          onMouseMove={handleSVGMouseMove}
          onMouseUp={handleSVGMouseUp}
          onMouseDown={handleSVGMouseDown}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#ef4444" />
            </marker>
            <marker
              id="arrowhead-hover"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#dc2626" />
            </marker>
          </defs>

          {/* Background grid */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`} pointerEvents="none">
            <defs>
              <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#374151" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="5000" height="5000" fill="url(#grid)" />
          </g>

          {/* Draw edges */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
            {/* Family connection wires — top-down genogram brackets */}
            {(() => {
              // Build parent → [children] map from current positions.
              const parentToChildren = new Map<string, string[]>();
              nodePositions.forEach((nodeData) => {
                const pid = parentNodeIds[nodeData.id] ?? nodes[nodeData.id]?.parent_id;
                if (!pid || !nodePositions.find(n => n.id === pid)) return;
                if (!parentToChildren.has(pid)) parentToChildren.set(pid, []);
                parentToChildren.get(pid)!.push(nodeData.id);
              });

              const lineStyle = {
                stroke: '#4b5563' as const,
                strokeWidth: 1.5,
                opacity: 0.8,
                pointerEvents: 'none' as const,
              };
              const result: React.ReactElement[] = [];

              parentToChildren.forEach((childIds, pid) => {
                const parentPos = nodePositions.find(n => n.id === pid);
                if (!parentPos) return;

                const parentSize = getNodeSize(pid);
                // Parent's bottom-center.
                const pMidX = parentPos.x + parentSize.width / 2;
                const pBottom = parentPos.y + parentSize.height;

                const children = childIds
                  .map(cid => {
                    const cp = nodePositions.find(n => n.id === cid);
                    if (!cp) return null;
                    const cs = getNodeSize(cid);
                    return { id: cid, midX: cp.x + cs.width / 2, top: cp.y };
                  })
                  .filter((c): c is { id: string; midX: number; top: number } => c !== null);

                if (children.length === 0) return;

                // Elbow Y is the midpoint between parent bottom and children tops.
                const childTop = Math.min(...children.map(c => c.top));
                const elbowY = (pBottom + childTop) / 2;

                // 1 — Vertical arm from parent bottom down to elbow Y.
                result.push(
                  <line key={`fa-${pid}`} x1={pMidX} y1={pBottom} x2={pMidX} y2={elbowY} {...lineStyle} />,
                );

                // 2 — Horizontal bus at elbow Y spanning all children centers.
                const minChildX = Math.min(...children.map(c => c.midX));
                const maxChildX = Math.max(...children.map(c => c.midX));
                result.push(
                  <line
                    key={`fh-${pid}`}
                    x1={Math.min(pMidX, minChildX)}
                    y1={elbowY}
                    x2={Math.max(pMidX, maxChildX)}
                    y2={elbowY}
                    {...lineStyle}
                  />,
                );

                // 3 — Vertical branch from elbow Y down to each child's top-center.
                children.forEach(c => {
                  result.push(
                    <line key={`fb-${c.id}`} x1={c.midX} y1={elbowY} x2={c.midX} y2={c.top} {...lineStyle} />,
                  );
                });
              });

              return result;
            })()}

            {/* Blocking relationship wires */}
            {edges.map((edge) => {
              const fromVisible = nodeVisibility.get(edge.from) ?? true;
              const toVisible = nodeVisibility.get(edge.to) ?? true;
              const fromDisplayed = displayedNodeIds.has(edge.from);
              const toDisplayed = displayedNodeIds.has(edge.to);

              if (filterMode === 'hide' && rules.length > 0 && (!fromDisplayed || !toDisplayed)) {
                return null;
              }

              const fromNode = getNodePosition(edge.from);
              const toNode = getNodePosition(edge.to);
              if (!fromNode || !toNode) return null;

              const edgeId = edgeKey(edge);
              const isHovered = hoveredEdge === edgeId;
              const isGhosted = filterMode === 'ghost' && rules.length > 0 && (!fromVisible || !toVisible);

              const fromSize = getNodeSize(edge.from);
              const toSize = getNodeSize(edge.to);

              // Blocking edges connect side-to-side so they stay visually distinct from
              // the vertical family tree lines. Pick left or right edge based on relative position.
              const fromCenterX = fromNode.x + fromSize.width / 2;
              const toCenterX = toNode.x + toSize.width / 2;
              const x1 = fromCenterX <= toCenterX ? fromNode.x + fromSize.width : fromNode.x;
              const y1 = fromNode.y + fromSize.height / 2;
              const x2 = fromCenterX <= toCenterX ? toNode.x : toNode.x + toSize.width;
              const y2 = toNode.y + toSize.height / 2;

              // Cubic bezier — bulge outward so lines don't cross the family wires.
              const dx = Math.abs(x2 - x1);
              const bulge = Math.max(dx * 0.5, 60);
              const cx1 = x1 + (x1 <= x2 ? bulge : -bulge);
              const cx2 = x2 + (x1 <= x2 ? -bulge : bulge);
              const pathData = `M ${x1} ${y1} C ${cx1} ${y1} ${cx2} ${y2} ${x2} ${y2}`;

              return (
                <g key={edgeId}>
                  <path
                    d={pathData}
                    fill="none"
                    stroke={isHovered ? '#dc2626' : '#ef4444'}
                    strokeWidth={isHovered ? '3' : '2'}
                    markerEnd={isHovered ? 'url(#arrowhead-hover)' : 'url(#arrowhead)'}
                    className="transition-all"
                    onMouseEnter={() => setHoveredEdge(edgeId)}
                    onMouseLeave={() => setHoveredEdge(null)}
                    opacity={isGhosted ? '0.18' : '0.7'}
                    strokeDasharray="5,5"
                  />
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 50}
                    textAnchor="middle"
                    fontSize="12"
                    fill="#ef4444"
                    className="cursor-pointer pointer-events-none select-none"
                    fontWeight="600"
                    opacity={isGhosted ? '0.3' : '1'}
                  >
                    blocks
                  </text>
                </g>
              );
            })}

            {/* Draw wire being created */}
            {drawingWire && getNodePosition(drawingWire.from) && (
              <line
                x1={getNodePosition(drawingWire.from)!.x + getNodeSize(drawingWire.from).width}
                y1={getNodePosition(drawingWire.from)!.y + getNodeSize(drawingWire.from).height / 2}
                x2={drawingWire.x}
                y2={drawingWire.y}
                stroke="#3b82f6"
                strokeWidth="2"
                strokeDasharray="4,4"
                markerEnd="url(#arrowhead-hover)"
                pointerEvents="none"
              />
            )}

            {/* Draw nodes */}
            {nodePositions.map(nodeData => {
              const node = nodes[nodeData.id];
              if (!node) return null; // Skip rendering if node doesn't exist
              const isVisible = nodeVisibility.get(nodeData.id) ?? true;
              const isGhosted = filterMode === 'ghost' && rules.length > 0 && !isVisible;
              const parentId = parentNodeIds[nodeData.id] ?? node.parent_id;
              const parentNode = parentId ? nodes[parentId] : null;
              const parentName = parentNode?.properties?.name || (parentId ? parentId.slice(0, 8) : '');
              const nodeSize = getNodeSize(nodeData.id);
              const nodeDepth = nodeDepths[nodeData.id] ?? 0;
              const nodeScale = getNodeScale(nodeData.id);
              const typeSchema = typeSchemaMap.get(node.type);
              const resolvedColor = node.schema_color ?? typeSchema?.color;
              const shapeType = getShapeType(node.schema_shape ?? typeSchema?.shape);
              const orphanedReason = typeof (node as any).metadata?.orphaned_reason === 'string'
                ? ((node as any).metadata.orphaned_reason as string).toLowerCase()
                : '';
              const isOrphaned = Boolean((node as any).metadata?.orphaned)
                && (orphanedReason.includes('not found in current template') || orphanedReason.includes('removed from template'));
              const neutralFill = resolvedColor
                ? mixHexColors(resolvedColor, '#000000', 0.45)
                : '#0f172a';
              const neutralStroke = '#1f2937';
              const overlayFill = resolvedColor
                ? mixHexColors(resolvedColor, '#000000', 0.2)
                : '#1f2937';
              const isSelected = selectedNodeId === nodeData.id;
              const strokeColor = isSelected || hoveredNode === nodeData.id || drawingWire?.from === nodeData.id
                ? '#3b82f6'
                : isOrphaned
                  ? '#ef4444'
                : resolvedColor
                  ? mixHexColors(resolvedColor, '#000000', 0.6)
                  : '#4b5563';
              const selectedStrokeWidth = isSelected ? 3 : 2;
              const overlayInset = Math.max(4, Math.min(12, nodeSize.height * 0.1));
              const overlayWidth = Math.max(20, nodeSize.width - overlayInset * 2);
              const overlayHeight = Math.max(16, nodeSize.height - overlayInset * 2);
              const overlayCenterX = nodeSize.width / 2;
              const overlayCenterY = nodeSize.height / 2;
              const showBaseShape = shapeType === 'circle' || shapeType === 'hexagon';

              const iconSvg = iconSvgs[nodeData.id];
              const iconColor = '#ffffff';
              const iconHref = iconSvg
                ? `data:image/svg+xml;utf8,${encodeURIComponent(recolorSvg(iconSvg, iconColor))}`
                : null;
              const hasIcon = Boolean(iconHref);

              const baseShapeProps = {
                fill: hoveredNode === nodeData.id ? adjustHexColor(neutralFill, 10) : neutralFill,
                stroke: strokeColor || neutralStroke,
                strokeWidth: selectedStrokeWidth,
                className: 'cursor-move select-none transition-all',
                onMouseDown: (e: React.MouseEvent) => handleNodeMouseDown(nodeData.id, e),
                onMouseEnter: () => handleNodeMouseEnter(nodeData.id),
                onMouseLeave: handleNodeMouseLeave,
                onClick: () => onNodeSelect?.(nodeData.id),
              };

              const overlayShapeProps = showBaseShape
                ? {
                    fill: hoveredNode === nodeData.id && !node.schema_color ? '#1e3a8a' : overlayFill,
                    stroke: strokeColor,
                    strokeWidth: 1.5,
                    pointerEvents: 'none' as const,
                    className: 'select-none transition-all',
                  }
                : {
                    ...baseShapeProps,
                    fill: hoveredNode === nodeData.id && !node.schema_color ? '#1e3a8a' : overlayFill,
                    stroke: strokeColor,
                    strokeWidth: 1.5,
                  };

              const renderBaseShape = () => (
                <rect
                  width={nodeSize.width}
                  height={nodeSize.height}
                  rx={Math.max(8, Math.min(18, nodeSize.height * 0.22))}
                  ry={Math.max(8, Math.min(18, nodeSize.height * 0.22))}
                  {...baseShapeProps}
                />
              );

              const renderNodeShape = () => {
                if (shapeType === 'circle') {
                  const radius = Math.min(overlayWidth, overlayHeight) / 2;
                  return (
                    <ellipse
                      cx={overlayCenterX}
                      cy={overlayCenterY}
                      rx={radius}
                      ry={radius}
                      {...overlayShapeProps}
                    />
                  );
                }
                if (shapeType === 'hexagon') {
                  const w = overlayWidth;
                  const h = overlayHeight;
                  const inset = 2;
                  const extra = Math.max(6, Math.min(14, Math.min(w, h) * 0.1));
                  const cx = overlayCenterX;
                  const cy = overlayCenterY;
                  const radius = Math.min(w, h) / 2 + extra - inset;
                  const angleOffset = 0;
                  const points = Array.from({ length: 6 }, (_, i) => {
                    const angle = angleOffset + (i * Math.PI) / 3;
                    const x = cx + radius * Math.cos(angle);
                    const y = cy + radius * Math.sin(angle);
                    return `${x},${y}`;
                  }).join(' ');
                  return <polygon points={points} {...overlayShapeProps} />;
                }
                const radius = shapeType === 'rounded'
                  ? Math.max(6, Math.min(20, nodeSize.height * 0.2))
                  : shapeType === 'roundedSquare'
                    ? Math.max(4, Math.min(16, nodeSize.height * 0.16))
                    : Math.max(3, Math.min(12, nodeSize.height * 0.12));
                return (
                  <rect
                    x={overlayInset}
                    y={overlayInset}
                    width={overlayWidth}
                    height={overlayHeight}
                    rx={radius}
                    ry={radius}
                    {...overlayShapeProps}
                  />
                );
              };

              const iconSize = Math.max(14, Math.min(22, nodeSize.height * 0.24));
              const iconX = nodeSize.width / 2 - iconSize / 2;
              const iconY = nodeSize.height * 0.24 - iconSize / 2;
              const nameY = hasIcon ? nodeSize.height * 0.56 : nodeSize.height * 0.5;
              const typeY = hasIcon ? nodeSize.height * 0.72 : nodeSize.height * 0.66;
              const parentY = hasIcon ? nodeSize.height * 0.86 : nodeSize.height * 0.82;
              const handleRadius = Math.max(5, Math.min(10, nodeSize.height * 0.08));

              return (
                <g key={nodeData.id} transform={`translate(${nodeData.x}, ${nodeData.y})`} opacity={isGhosted ? 0.28 : isOrphaned ? 0.78 : 1}>
                  {/* Main node body */}
                  {showBaseShape && renderBaseShape()}
                  {renderNodeShape()}

                  {iconHref && (
                    <image
                      href={iconHref}
                      x={iconX}
                      y={iconY}
                      width={iconSize}
                      height={iconSize}
                      className="pointer-events-none select-none"
                      opacity="0.95"
                    />
                  )}

                  {/* Node name */}
                  <text
                    x={nodeSize.width / 2}
                    y={nameY}
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="600"
                    className="pointer-events-none select-none"
                    fill="#ffffff"
                  >
                    {nodeData.label.length > 16 ? nodeData.label.substring(0, 14) + '...' : nodeData.label}
                  </text>

                  {/* Node type */}
                  <text
                    x={nodeSize.width / 2}
                    y={typeY}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    className="pointer-events-none select-none"
                    fill="#ffffff"
                  >
                    {node.type.toUpperCase()}
                  </text>

                  {/* Parent breadcrumb */}
                  {parentName && (
                    <text
                      x={nodeSize.width / 2}
                      y={parentY}
                      textAnchor="middle"
                      fontSize="10"
                      className="pointer-events-none select-none"
                      fill="#ffffff"
                    >
                      ← {parentName.length > 14 ? parentName.substring(0, 12) + '...' : parentName}
                    </text>
                  )}

                  {isOrphaned && (
                    <text
                      x={nodeSize.width - 10}
                      y={14}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="700"
                      className="pointer-events-none select-none"
                      fill="#fca5a5"
                    >
                      ⚠
                    </text>
                  )}

                  {/* Output handle (wire start) */}
                  <circle
                    cx={nodeSize.width}
                    cy={nodeSize.height / 2}
                    r={handleRadius}
                    fill="#3b82f6"
                    stroke="#1e40af"
                    strokeWidth="1"
                    className="cursor-crosshair hover:opacity-90 transition-opacity"
                    onMouseDown={(e) => handleNodeStartWire(nodeData.id, e)}
                  />

                  {/* Input handle (wire end) */}
                  <circle
                    cx="0"
                    cy={nodeSize.height / 2}
                    r={handleRadius}
                    fill={hoveredNode === nodeData.id && drawingWire ? '#10b981' : '#6b7280'}
                    stroke={hoveredNode === nodeData.id && drawingWire ? '#059669' : '#4b5563'}
                    strokeWidth="2"
                    className="cursor-crosshair transition-all"
                    onMouseUp={() => drawingWire && handleNodeDrop(nodeData.id)}
                    onMouseEnter={() => {
                      if (drawingWire) handleNodeMouseEnter(nodeData.id);
                    }}
                  />
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      </div>

      {/* Footer Controls */}
      <div className="p-4 border-t border-border bg-bg-light text-xs text-fg-secondary space-y-2">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="font-semibold text-fg-primary mb-1">Map Controls</p>
            <ul className="space-y-0.5">
              <li><span className="font-mono">Left Drag:</span> Move nodes</li>
              <li><span className="font-mono">Space + Drag:</span> Pan canvas</li>
              <li><span className="font-mono">Middle Click + Drag:</span> Pan canvas</li>
              <li><span className="font-mono">Scroll:</span> Zoom in/out</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-fg-primary mb-1">Wire Controls</p>
            <ul className="space-y-0.5">
              <li><span className="font-mono">Blue Circle:</span> Start connection</li>
              <li><span className="font-mono">Drag to Node:</span> Create relationship</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
