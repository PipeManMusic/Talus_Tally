import { useState, useEffect, useRef, type Dispatch, type SetStateAction, type DragEvent, type CSSProperties } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { mapNodeIndicator } from '../graph/mapNodeIndicator';
import { mapNodeIcon, subscribeToIconCache } from '../graph/mapNodeIcon';
import type { NodeTypeSchema } from '../../api/client';
import type { TreeNode } from '../../utils/treeUtils';
import { useFilterStore } from '../../store/filterStore';
import { evaluateNodeVisibility } from '../../utils/filterEngine';

const buildFilterNode = (node: TreeNode, velocityScores: Record<string, any>) => ({
  id: node.id,
  name: node.name,
  type: node.type,
  properties: node.properties || {},
  velocity: velocityScores[node.id],
});

const nodeMatchesFilters = (node: TreeNode, filterRules: ReturnType<typeof useFilterStore.getState>['rules'], velocityScores: Record<string, any>) => {
  return evaluateNodeVisibility(buildFilterNode(node, velocityScores), filterRules);
};

const subtreeHasMatch = (node: TreeNode, filterRules: ReturnType<typeof useFilterStore.getState>['rules'], velocityScores: Record<string, any>): boolean => {
  if (nodeMatchesFilters(node, filterRules, velocityScores)) {
    return true;
  }

  if (!Array.isArray(node.children) || node.children.length === 0) {
    return false;
  }

  return node.children.some((child) => subtreeHasMatch(child, filterRules, velocityScores));
};

// Helper to recolor SVG fills and strokes with the blueprint color
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

const WILDCARD_CHILDREN = new Set(['*', '__any__', 'any']);

type DragPayload = {
  nodeId?: string;
  nodeType?: string;
  parent_id?: string | null;
  descendants?: string[];
};

const globalDragPayloadRef: { current: DragPayload | null } = { current: null };

const collectDescendantIds = (item: TreeNode): string[] => {
  if (!Array.isArray(item.children) || item.children.length === 0) {
    return [];
  }
  const results: string[] = [];
  const stack: TreeNode[] = [...item.children];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    results.push(current.id);
    if (Array.isArray(current.children) && current.children.length > 0) {
      stack.push(...current.children);
    }
  }
  return results;
};

function FilteredTreeContent({
  node,
  allowedChildrenList,
  resolveTypeLabel,
  nodeTypeSchemas,
  velocityScores = {},
  onSelect,
  onExpand,
  onContextMenu,
  expandedMap,
  setExpandedMap,
  getTypeLabel,
  scrollContainerRef,
  level,
}: {
  node: TreeNode;
  allowedChildrenList: any[];
  resolveTypeLabel: (type: string) => string;
  nodeTypeSchemas?: Record<string, NodeTypeSchema>;
  velocityScores?: Record<string, any>;
  onSelect?: (id: string) => void;
  onExpand?: (id: string) => void;
  onContextMenu?: (nodeId: string, action: string) => void;
  expandedMap: Record<string, boolean>;
  setExpandedMap: Dispatch<SetStateAction<Record<string, boolean>>>;
  getTypeLabel?: (type: string) => string;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  level: number;
}) {
  const { rules: filterRules, filterMode } = useFilterStore();

  const groups: Array<{ key: string; title: string; items: TreeNode[] }> = [];
  const typeMap = new Map<string, { title: string; items: TreeNode[] }>();

  node.children?.forEach((child) => {
    const rawType = child.type ?? 'Unknown';
    const normalized = rawType.trim().toLowerCase();
    if (!typeMap.has(normalized)) {
      typeMap.set(normalized, {
        title: resolveTypeLabel(rawType),
        items: [],
      });
    }
    typeMap.get(normalized)?.items.push(child);
  });

  const consumed = new Set<string>();
  allowedChildrenList.forEach((typeId) => {
    const normalized = String(typeId ?? '').trim().toLowerCase();
    if (!normalized || consumed.has(normalized)) {
      return;
    }
    const group = typeMap.get(normalized);
    if (!group || group.items.length === 0) {
      return;
    }
    groups.push({ key: normalized, title: resolveTypeLabel(String(typeId)), items: group.items });
    consumed.add(normalized);
  });

  typeMap.forEach((group, normalized) => {
    if (consumed.has(normalized) || group.items.length === 0) {
      return;
    }
    groups.push({ key: normalized, title: group.title, items: group.items });
  });

  return (
    <>
      {groups.map((group) => (
        <div key={`${node.id}-${group.key}`} className="mb-3 last:mb-0">
          {(() => {
            const visibleItems = group.items.filter((child) => filterMode !== 'hide' || subtreeHasMatch(child, filterRules, velocityScores));
            if (visibleItems.length === 0) {
              return null;
            }

            return (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-fg-secondary mb-1">
                  {group.title}
                </div>
                <div className="space-y-1">
                  {visibleItems.map((child) => {
                    const isDirectMatch = nodeMatchesFilters(child, filterRules, velocityScores);
                    const hasMatchingDescendant = Array.isArray(child.children) && child.children.length > 0
                      ? child.children.some((grandchild) => subtreeHasMatch(grandchild, filterRules, velocityScores))
                      : false;

                    return (
                      <TreeItem
                        key={child.id}
                        node={child}
                        nodeTypeSchemas={nodeTypeSchemas}
                        velocityScores={velocityScores}
                        level={level + 1}
                        onSelect={onSelect}
                        onExpand={onExpand}
                        onContextMenu={onContextMenu}
                        expandedMap={expandedMap}
                        setExpandedMap={setExpandedMap}
                        getTypeLabel={getTypeLabel}
                        scrollContainerRef={scrollContainerRef}
                        isGhosted={filterMode === 'ghost' && !isDirectMatch && !hasMatchingDescendant}
                      />
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      ))}
    </>
  );
}

type TreeItemProps = {
  node: TreeNode;
  nodeTypeSchemas?: Record<string, NodeTypeSchema>;
  velocityScores?: Record<string, any>;
  level?: number;
  isGhosted?: boolean;
  onSelect?: (id: string) => void;
  onExpand?: (id: string) => void;
  onContextMenu?: (nodeId: string, action: string) => void;
  expandedMap: Record<string, boolean>;
  setExpandedMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  getTypeLabel?: (typeId: string) => string;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
};

function TreeItem({
  node,
  nodeTypeSchemas,
  velocityScores = {},
  level = 0,
  isGhosted = false,
  onSelect,
  onExpand,
  onContextMenu,
  expandedMap,
  setExpandedMap,
  getTypeLabel,
  scrollContainerRef,
}: TreeItemProps) {
  const [statusIndicators, setStatusIndicators] = useState<Array<{ key: string; svg?: string; text?: string; color?: string }>>([]);
  const [textColor, setTextColor] = useState<string | undefined>(undefined);
  const [textStyle, setTextStyle] = useState<string | undefined>(undefined);
  const [primaryIndicatorColor, setPrimaryIndicatorColor] = useState<string | undefined>(undefined);
  const [iconSvg, setIconSvg] = useState<string | undefined>(undefined);
  const [dragOverDropZoneId, setDragOverDropZoneId] = useState<string | null>(null);
  const [reorderDropZone, setReorderDropZone] = useState<'above' | 'below' | null>(null);
  const reorderDropZoneRef = useRef<'above' | 'below' | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showFlyout, setShowFlyout] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [iconCacheVersion, setIconCacheVersion] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const isSelected = node.selected === true;
  const orphanedReason = typeof node.metadata?.orphaned_reason === 'string' ? node.metadata.orphaned_reason.toLowerCase() : '';
  const hasTemplateType = !nodeTypeSchemas || Boolean(nodeTypeSchemas[node.type]);
  const isOrphaned = Boolean(node.metadata?.orphaned) && (
    !hasTemplateType || orphanedReason.includes('not found in current template') || orphanedReason.includes('removed from template')
  );

  const parentId = (node as any).parent_id ?? null;
  const indicatorDefaults: Record<string, string> = {
    project_root: 'empty',
    season: 'partial',
    episode: 'partial',
    task: 'partial',
    footage: 'filled',
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

  const nodeTypeSchema = nodeTypeSchemas?.[node.type];
  const statusProperties = (nodeTypeSchema?.properties || []).filter((property: any) => {
    if (property?.type !== 'select') {
      return false;
    }
    const setId = property?.indicator_set || 'status';
    return setId === 'status';
  });
  const fallbackIndicatorId = (node as any).indicator_id ?? indicatorDefaults[node.type] ?? undefined;
  const primaryStatusPropertyId =
    (nodeTypeSchema as any)?.primary_status_property_id ||
    statusProperties[0]?.id;
  const iconSourceId = (node as any).icon_id ?? iconDefaults[node.type] ?? node.type ?? undefined;

  useEffect(() => {
    const unsubscribe = subscribeToIconCache(() => {
      setIconSvg(undefined);
      setIconCacheVersion((version) => version + 1);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (!iconSourceId) {
      setIconSvg(undefined);
      return () => {
        isMounted = false;
      };
    }

    mapNodeIcon(iconSourceId)
      .then((icon) => {
        if (isMounted) setIconSvg(icon);
      })
      .catch((err) => {
        console.warn('[TreeView] Failed to load icon', iconSourceId, err);
        if (isMounted) setIconSvg(undefined);
      });

    return () => {
      isMounted = false;
    };
  }, [iconSourceId, iconCacheVersion]);

  useEffect(() => {
    let isMounted = true;

    const indicatorRequests: Array<Promise<any>> = [];

    statusProperties.forEach((property: any) => {
      const rawValue = (node.properties as Record<string, any> | undefined)?.[property.id];
      if (rawValue === undefined || rawValue === null || rawValue === '') {
        return;
      }

      const option = (property.options || []).find((candidate: any) =>
        candidate?.name === rawValue || candidate?.id === rawValue
      );
      const indicatorId = option?.indicator_id;
      if (!indicatorId) {
        return;
      }

      const indicatorSet = property?.indicator_set || 'status';
      indicatorRequests.push(
        mapNodeIndicator({ ...node, indicator_id: indicatorId, indicator_set: indicatorSet }).then((indicator) => ({
          key: `${property.id}:${indicatorId}`,
          propertyId: property.id,
          indicator,
        }))
      );
    });

    if (indicatorRequests.length === 0 && fallbackIndicatorId) {
      indicatorRequests.push(
        mapNodeIndicator({ ...node, indicator_id: fallbackIndicatorId, indicator_set: 'status' }).then((indicator) => ({
          key: `fallback:${fallbackIndicatorId}`,
          propertyId: undefined,
          indicator,
        }))
      );
    }

    if (indicatorRequests.length === 0) {
      if (isMounted) {
        setStatusIndicators([]);
        setPrimaryIndicatorColor(undefined);
        setTextColor(undefined);
        setTextStyle(undefined);
      }
      return () => {
        isMounted = false;
      };
    }

    Promise.all(indicatorRequests)
      .then((results) => {
        if (!isMounted) {
          return;
        }

        const renderedIndicators = results
          .filter((entry) => entry?.indicator)
          .map((entry) => ({
            key: entry.key,
            propertyId: entry.propertyId,
            svg: entry.indicator.statusIndicatorSvg,
            text: entry.indicator.statusText,
            color: entry.indicator.indicatorColor,
            textColor: entry.indicator.textColor,
            textStyle: entry.indicator.textStyle,
          }));

        setStatusIndicators(
          renderedIndicators.map((entry) => ({
            key: entry.key,
            svg: entry.svg,
            text: entry.text,
            color: entry.color,
          }))
        );

        const primaryEntry = renderedIndicators.find((entry) => entry.propertyId === primaryStatusPropertyId) || renderedIndicators[0];
        setPrimaryIndicatorColor(primaryEntry?.color);
        setTextColor(primaryEntry?.textColor ?? primaryEntry?.color ?? undefined);
        setTextStyle(primaryEntry?.textStyle ?? undefined);
      })
      .catch((err) => {
        console.warn('[TreeView] Failed to load status indicators', node.id, err);
        if (isMounted) {
          setStatusIndicators([]);
          setPrimaryIndicatorColor(undefined);
          setTextColor(undefined);
          setTextStyle(undefined);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [node.id, node.properties, nodeTypeSchema, primaryStatusPropertyId, fallbackIndicatorId]);

  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const allowedChildrenList = Array.isArray(node.allowed_children) ? node.allowed_children : [];
  const hasExplicitChildConstraint = Array.isArray(node.allowed_children);
  const normalizedAllowedChildren = allowedChildrenList.map((child) => String(child).trim().toLowerCase());
  const acceptsChildType = (childType?: string | null): boolean => {
    if (!childType) return false;
    if (normalizedAllowedChildren.length === 0) {
      // If allowed_children is explicitly [] → no children allowed.
      // If allowed_children is undefined/missing → permissive (accepts any).
      return !hasExplicitChildConstraint;
    }
    const normalized = childType.trim().toLowerCase();
    return normalizedAllowedChildren.some((allowed) => allowed === normalized || WILDCARD_CHILDREN.has(allowed));
  };
  const hasAllowedChildren = normalizedAllowedChildren.length > 0;
  const isInventoryType = (type: string) => type.endsWith('_inventory') || type === 'assets' || type === 'asset_category';
  const showAssetCategoryAction = allowedChildrenList.some((child) => isInventoryType(child));
  const standardTypes = allowedChildrenList.filter((child) => !isInventoryType(child));
  const handleMenuAction = (action: string) => {
    onContextMenu?.(node.id, action);
    setContextMenu(null);
  };

  const expanded = expandedMap[node.id] ?? false;
  const fallbackColor = 'var(--color-fg-primary)';
  const iconColor = textColor || primaryIndicatorColor || fallbackColor;
  const targetParentId = parentId === null || typeof parentId === 'undefined' ? null : String(parentId);

  const clearDragState = () => {
    setDragOverDropZoneId(null);
    setReorderDropZone(null);
    reorderDropZoneRef.current = null;
  };

  const getRowElement = (event: DragEvent<HTMLDivElement>): Element | null => {
    return rowRef.current ?? (event.target as Element)?.closest?.('[data-testid="tree-item-row"]') ?? event.currentTarget;
  };

  const computeDropZone = (clientY: number, fallbackEl?: Element | null): 'above' | 'below' | 'inside' => {
    const row = rowRef.current ?? fallbackEl;
    if (!row) return 'inside';
    const rect = row.getBoundingClientRect();
    if (!rect.height) return 'inside';
    const offsetY = clientY - rect.top;
    if (offsetY < rect.height * 0.25) return 'above';
    if (offsetY > rect.height * 0.75) return 'below';
    return 'inside';
  };

  const localDragPayloadRef = useRef<DragPayload | null>(null);

  const parseDragPayload = (event: DragEvent<HTMLDivElement>) => {
    let payload = event.dataTransfer.getData('application/json');
    if (!payload) {
      payload = event.dataTransfer.getData('text/plain');
    }
    if (!payload) {
      return globalDragPayloadRef.current ?? localDragPayloadRef.current;
    }
    try {
      const parsed = JSON.parse(payload) as DragPayload;
      globalDragPayloadRef.current = parsed;
      localDragPayloadRef.current = parsed;
      return parsed;
    } catch (err) {
      console.warn('[TreeView] Could not parse drag payload', err);
      return globalDragPayloadRef.current ?? localDragPayloadRef.current;
    }
  };

  const normalizeParentId = (value: unknown): string | null => {
    if (value === null || typeof value === 'undefined') {
      return null;
    }
    return String(value);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    const info = parseDragPayload(event);
    if (!info) {
      console.debug('[TreeView] dragOver ignored: missing payload', { targetId: node.id });
      clearDragState();
      return;
    }

    const draggedId = info.nodeId;
    const draggedType = info.nodeType;
    const draggedParentId = normalizeParentId(info.parent_id);
    const draggedDescendants = Array.isArray(info.descendants) ? info.descendants : [];
    if (!draggedId || draggedId === node.id) {
      console.debug('[TreeView] dragOver ignored: self drop blocked', { draggedId, targetId: node.id });
      clearDragState();
      return;
    }
    if (draggedDescendants.includes(node.id)) {
      console.debug('[TreeView] dragOver ignored: descendant blocked', { draggedId, targetId: node.id });
      clearDragState();
      return;
    }

    const rowEl = getRowElement(event);
    const rect = rowEl?.getBoundingClientRect();
    let dropZone = computeDropZone(event.clientY, rowEl);
    let isValid = false;

    if (dropZone === 'inside') {
      if (acceptsChildType(draggedType)) {
        isValid = true;
      } else if (draggedParentId === targetParentId) {
        if (rect) {
          dropZone = event.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
        } else {
          dropZone = 'below';
        }
        isValid = true;
      }
    } else if (draggedParentId === targetParentId) {
      isValid = true;
    }

    if (!isValid) {
      console.debug('[TreeView] dragOver ignored: invalid target pairing', {
        draggedId,
        draggedType,
        targetId: node.id,
        dropZone,
        draggedParentId,
        targetParentId,
      });
      clearDragState();
      return;
    }

    console.debug('[TreeView] dragOver valid', {
      draggedId,
      draggedType,
      targetId: node.id,
      dropZone,
    });
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';

    if (dragOverDropZoneId !== node.id) {
      setDragOverDropZoneId(node.id);
    }

    const nextReorder = dropZone === 'inside' ? null : dropZone;
    reorderDropZoneRef.current = nextReorder;
    if (reorderDropZone !== nextReorder) {
      setReorderDropZone(nextReorder);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const related = event.relatedTarget as Node | null;
    if (rowRef.current && related && rowRef.current.contains(related)) {
      return;
    }
    clearDragState();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const info = parseDragPayload(event);
    const savedDropZone = reorderDropZoneRef.current;
    clearDragState();
    globalDragPayloadRef.current = null;
    localDragPayloadRef.current = null;

    if (!info) {
      console.warn('[TreeView] drop ignored: missing payload', { targetId: node.id });
      return;
    }

    const droppedId = info.nodeId;
    const droppedType = info.nodeType;
    const droppedParentId = normalizeParentId(info.parent_id);
    const droppedDescendants = Array.isArray(info.descendants) ? info.descendants : [];
    if (!droppedId || droppedId === node.id) {
      console.debug('[TreeView] drop ignored: self drop blocked', { droppedId, targetId: node.id });
      return;
    }
    if (droppedDescendants.includes(node.id)) {
      console.debug('[TreeView] drop ignored: descendant blocked', { droppedId, targetId: node.id });
      return;
    }

    const rowEl = getRowElement(event);
    const rect = rowEl?.getBoundingClientRect();
    let dropZone = savedDropZone ?? computeDropZone(event.clientY, rowEl);
    if (dropZone === 'inside' && !acceptsChildType(droppedType) && droppedParentId === targetParentId) {
      if (rect) {
        dropZone = event.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
      } else {
        dropZone = 'below';
      }
    }

    if (dropZone === 'above' || dropZone === 'below') {
      console.debug('[TreeView] drop reorder', { droppedId, targetId: node.id, dropZone });
      onContextMenu?.(droppedId, `reorder:${node.id}:${dropZone}`);
    } else {
      if (!acceptsChildType(droppedType)) {
        console.debug('[TreeView] drop rejected: child type not accepted', { droppedId, droppedType, targetId: node.id });
        return;
      }
      if (droppedParentId === node.id) {
        console.debug('[TreeView] drop ignored: already child of target', { droppedId, targetId: node.id });
        return;
      }
      console.debug('[TreeView] drop move', { droppedId, targetId: node.id });
      onContextMenu?.(droppedId, `move:${node.id}`);
    }
  };

  const resolveTypeLabel = (type: string) => (getTypeLabel ? getTypeLabel(type) : type);

  const handleDragStart = (event: DragEvent<HTMLDivElement | HTMLButtonElement>) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    const payload: DragPayload = {
      nodeId: node.id,
      nodeType: node.type,
      parent_id: parentId,
      descendants: collectDescendantIds(node),
    };
    console.debug('[TreeView] dragStart', payload);
    globalDragPayloadRef.current = payload;
    localDragPayloadRef.current = payload;
    const json = JSON.stringify(payload);
    event.dataTransfer.setData('application/json', json);
    event.dataTransfer.setData('text/plain', json);
  };

  const handleDragEnd = () => {
    console.debug('[TreeView] dragEnd', { nodeId: node.id });
    clearDragState();
    if (globalDragPayloadRef.current?.nodeId === node.id) {
      globalDragPayloadRef.current = null;
    }
    localDragPayloadRef.current = null;
  };

  const isActiveDropTarget = dragOverDropZoneId === node.id;
  const isMoveTarget = isActiveDropTarget && reorderDropZone === null;
  const isReorderAbove = isActiveDropTarget && reorderDropZone === 'above';
  const isReorderBelow = isActiveDropTarget && reorderDropZone === 'below';

  const rowClasses = [
    'relative flex w-full items-center gap-1 px-2 py-1.5 rounded-sm cursor-pointer transition-colors border-l-2 border-transparent',
    isGhosted ? 'opacity-30' : '',
    isOrphaned ? 'bg-status-danger/10 border-l-status-danger/60' : '',
    isSelected
      ? 'bg-bg-selection border-l-4 border-accent-primary shadow-inner ring-1 ring-accent-primary/60'
      : isMoveTarget
        ? 'bg-accent-primary/20 border-l-4 border-accent-primary shadow-inner ring-2 ring-accent-primary/70'
        : isActiveDropTarget
          ? 'bg-accent-primary/10 border-l-2 border-accent-primary/60 ring-1 ring-accent-primary/40'
          : 'hover:bg-bg-selection'
  ].join(' ');

  const renderReorderLine = (position: 'above' | 'below') => (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-20"
      style={{ [position === 'above' ? 'top' : 'bottom']: '-1px' } as CSSProperties }
    >
      <div className="mx-2 h-0.5 rounded-full bg-accent-primary shadow-sm" />
    </div>
  );

  return (
    <div className="relative flex flex-col w-full">
      {isReorderAbove && renderReorderLine('above')}
      <div
        ref={rowRef}
        className={rowClasses}
        data-testid="tree-item-row"
        data-selected={isSelected ? 'true' : 'false'}
        aria-selected={isSelected}
        onClick={() => onSelect?.(node.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          setContextMenu({ x: event.clientX, y: event.clientY });
        }}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        title={isOrphaned ? 'Orphaned node' : undefined}
      >
        {isSelected && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1 left-0.5 w-1 rounded-full bg-accent-primary"
          />
        )}

        {hasAllowedChildren && (
          <>
            <button
              ref={addButtonRef}
              className="mr-1 px-1 py-0.5 rounded bg-bg-light border border-border hover:bg-accent-primary hover:text-fg-primary"
              title="Add child node"
              onClick={(event) => {
                event.stopPropagation();
                setShowFlyout((value) => !value);
              }}
              aria-label="Add child node"
              data-testid="add-child-btn"
            >
              +
            </button>
            {showFlyout && (
              <div
                className="fixed z-50 bg-bg-light border border-border rounded shadow-lg mt-1"
                style={{
                  left: (addButtonRef.current?.getBoundingClientRect().left ?? 0) + window.scrollX,
                  top: (addButtonRef.current?.getBoundingClientRect().bottom ?? 0) + window.scrollY,
                }}
                onMouseLeave={() => setShowFlyout(false)}
                data-testid="add-child-flyout"
              >
                {standardTypes.map((type: string) => (
                  <button
                    key={type}
                    className="block w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-bg-selection"
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowFlyout(false);
                      handleMenuAction(`add:${type}`);
                    }}
                    data-testid="add-child-flyout-option"
                  >
                    ➕ Add {resolveTypeLabel(type)}
                  </button>
                ))}
                {showAssetCategoryAction && (
                  <button
                    className="block w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-bg-selection"
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowFlyout(false);
                      handleMenuAction('add-asset-category');
                    }}
                    data-testid="add-child-flyout-option"
                  >
                    ➕ Add Asset Category
                  </button>
                )}
                <div className="border-t border-border my-1" />
                <button
                  className="block w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-bg-selection"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowFlyout(false);
                    handleMenuAction('import-csv-here');
                  }}
                  data-testid="add-child-flyout-option"
                >
                  📥 Import CSV Here
                </button>
                <button
                  className="block w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-bg-selection"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowFlyout(false);
                    handleMenuAction('export-branch');
                  }}
                  data-testid="add-child-flyout-option"
                >
                  📤 Export Branch
                </button>
              </div>
            )}
          </>
        )}

        {hasChildren ? (
          <button
            onClick={(event) => {
              event.stopPropagation();
              setExpandedMap((prev) => ({ ...prev, [node.id]: !expanded }));
              onExpand?.(node.id);
            }}
            className="p-0 hover:text-accent-hover"
            data-testid="expand-toggle-btn"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <div className="w-4" />
        )}

        <span className="flex items-center gap-2">
          <span className="node-icon-svg h-4 w-4 flex-shrink-0">
            {iconSvg ? (
              <span dangerouslySetInnerHTML={{ __html: recolorSvg(iconSvg, iconColor) }} />
            ) : (
              <span className="opacity-30">□</span>
            )}
          </span>
          <span className="status-indicator-svg flex items-center gap-1">
            {statusIndicators.length > 0 ? (
              statusIndicators.map((indicator) => (
                <span key={indicator.key}>
                  {indicator.svg ? (
                    <span dangerouslySetInnerHTML={{ __html: recolorSvg(indicator.svg, indicator.color || textColor || fallbackColor) }} />
                  ) : indicator.text ? (
                    <span className="status-indicator-text text-xs opacity-80">{indicator.text}</span>
                  ) : (
                    <span className="status-indicator-text text-xs opacity-40">•</span>
                  )}
                </span>
              ))
            ) : (
              <span className="status-indicator-text text-xs opacity-40">•</span>
            )}
          </span>
        </span>

        <span
          className={`text-sm truncate flex items-center gap-1 ${isOrphaned ? 'text-status-danger/90' : ''}`}
          style={{
            color: isOrphaned ? undefined : textColor,
            fontWeight: textStyle === 'bold' ? 'bold' : 'normal',
            textDecoration: textStyle === 'strikethrough' ? 'line-through' : 'none',
          }}
        >
          {isOrphaned && <span className="text-xs text-status-danger" aria-hidden="true">⚠</span>}
          {node.name || node.type || node.id}
        </span>

        <button
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          className="ml-auto opacity-60 hover:opacity-100 cursor-grab"
          title="Drag to move or reorder"
          aria-label="Drag handle"
          tabIndex={-1}
        >
          <span className="icon">≡</span>
        </button>

        {contextMenu && (
          <div
            className="fixed bg-bg-light border border-border rounded-sm shadow-lg z-50 min-w-max"
            style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
            onMouseLeave={() => setContextMenu(null)}
          >
            {hasAllowedChildren && showAssetCategoryAction && (
              <button
                onClick={() => handleMenuAction('add-asset-category')}
                className="w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-bg-selection transition-colors first:rounded-t-sm"
              >
                ➕ Add Asset Category
              </button>
            )}
            {hasAllowedChildren && standardTypes.map((type: string) => (
              <button
                key={type}
                onClick={() => handleMenuAction(`add:${type}`)}
                className="w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-bg-selection transition-colors first:rounded-t-sm"
              >
                ➕ Add {resolveTypeLabel(type)}
              </button>
            ))}
            <button
              onClick={() => handleMenuAction('delete')}
              className="w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-status-danger hover:text-fg-primary transition-colors last:rounded-b-sm"
            >
              🗑️ Delete
            </button>
            <div className="border-t border-border my-1" />
            <button
              onClick={() => handleMenuAction('import-csv-here')}
              className="w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-bg-selection transition-colors"
            >
              📥 Import CSV Here
            </button>
            <button
              onClick={() => handleMenuAction('export-branch')}
              className="w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-bg-selection transition-colors last:rounded-b-sm"
            >
              📤 Export Branch
            </button>
          </div>
        )}
      </div>

      {isReorderBelow && renderReorderLine('below')}

      {expanded && hasChildren && (
        <div className="ml-2 border-l border-border pl-3">
          <FilteredTreeContent
            node={node}
            allowedChildrenList={allowedChildrenList}
            resolveTypeLabel={resolveTypeLabel}
            nodeTypeSchemas={nodeTypeSchemas}
            velocityScores={velocityScores}
            onSelect={onSelect}
            onExpand={onExpand}
            onContextMenu={onContextMenu}
            expandedMap={expandedMap}
            setExpandedMap={setExpandedMap}
            getTypeLabel={getTypeLabel}
            scrollContainerRef={scrollContainerRef}
            level={level}
          />
        </div>
      )}
    </div>
  );
}

type TreeViewProps = {
  nodes: TreeNode[];
  nodeTypeSchemas?: Record<string, NodeTypeSchema>;
  velocityScores?: Record<string, any>;
  onSelectNode?: (id: string) => void;
  onExpandNode?: (id: string) => void;
  onContextMenu?: (id: string, action: string) => void;
  expandAllSignal?: number;
  collapseAllSignal?: number;
  getTypeLabel?: (type: string) => string;
  expandedMap?: Record<string, boolean>;
  setExpandedMap?: Dispatch<SetStateAction<Record<string, boolean>>>;
};

export function TreeView({
  nodes,
  nodeTypeSchemas,
  velocityScores = {},
  onSelectNode,
  onExpandNode,
  onContextMenu,
  expandAllSignal,
  collapseAllSignal,
  getTypeLabel,
  expandedMap: externalExpandedMap,
  setExpandedMap: externalSetExpandedMap,
}: TreeViewProps) {
  const [internalExpandedMap, setInternalExpandedMap] = useState<Record<string, boolean>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevExpandSignalRef = useRef<number | undefined>(undefined);
  const prevCollapseSignalRef = useRef<number | undefined>(undefined);

  const expandedMap = externalExpandedMap || internalExpandedMap;
  const setExpandedMap = externalSetExpandedMap || setInternalExpandedMap;

  const getAllNodeIds = (nodeList: TreeNode[]): string[] => {
    const ids: string[] = [];
    const traverse = (list: TreeNode[]) => {
      list.forEach((item) => {
        ids.push(item.id);
        if (Array.isArray(item.children) && item.children.length > 0) {
          traverse(item.children);
        }
      });
    };
    traverse(nodeList);
    return ids;
  };

  useEffect(() => {
    if (
      expandAllSignal !== undefined &&
      expandAllSignal > 0 &&
      expandAllSignal !== prevExpandSignalRef.current
    ) {
      prevExpandSignalRef.current = expandAllSignal;
      const allNodeIds = getAllNodeIds(nodes);
      const nextExpanded: Record<string, boolean> = {};
      allNodeIds.forEach((id) => {
        nextExpanded[id] = true;
      });
      setExpandedMap(nextExpanded);
    }
  }, [expandAllSignal, nodes, setExpandedMap]);

  useEffect(() => {
    if (
      collapseAllSignal !== undefined &&
      collapseAllSignal > 0 &&
      collapseAllSignal !== prevCollapseSignalRef.current
    ) {
      prevCollapseSignalRef.current = collapseAllSignal;
      setExpandedMap({});
    }
  }, [collapseAllSignal, setExpandedMap]);

  const projectRoots = nodes.filter((node) => node.type === 'project_root');
  const hasMultipleProjects = projectRoots.length > 1;

  // Get filter state - must be called at top level, not in map loop
  const { rules: filterRules, filterMode } = useFilterStore();

  // Debug: log when filter rules change
  useEffect(() => {
    if (filterRules.length > 0) {
      console.log('[TreeView] Filters active - rules:', filterRules.length, 'velocityScores:', Object.keys(velocityScores).length);
    }
  }, [filterRules, velocityScores]);

  // Debug: log whenever velocityScores changes
  useEffect(() => {
    console.log('[TreeView] velocityScores updated:', {
      count: Object.keys(velocityScores).length,
      sampleNodeId: Object.keys(velocityScores)[0] || 'none',
      sampleScore: Object.keys(velocityScores)[0] ? velocityScores[Object.keys(velocityScores)[0]]?.totalVelocity : undefined,
    });
  }, [velocityScores]);

  return (
    <aside
      ref={scrollContainerRef}
      className="bg-bg-light border-r border-border p-3 overflow-y-auto"
      data-expanded-map={JSON.stringify(expandedMap)}
    >
      <div className="font-display text-sm border-b border-accent-primary pb-2 mb-3">
        Project Tree
      </div>

      <div className="space-y-1">
        {nodes.map((node) => {
          const isDirectMatch = nodeMatchesFilters(node, filterRules, velocityScores);
          const hasMatchingDescendant = Array.isArray(node.children) && node.children.length > 0
            ? node.children.some((child) => subtreeHasMatch(child, filterRules, velocityScores))
            : false;

          if (!isDirectMatch && !hasMatchingDescendant && filterMode === 'hide') {
            return null;
          }

          return (
            <div key={node.id}>
              {hasMultipleProjects && node.type === 'project_root' && (
                <div className="font-display text-xs font-semibold uppercase tracking-wide text-accent-primary border-t border-border pt-2 mt-2 mb-1">
                  Project: {node.name}
                </div>
              )}
              <TreeItem
                node={node}
                nodeTypeSchemas={nodeTypeSchemas}
                velocityScores={velocityScores}
                isGhosted={filterMode === 'ghost' && !isDirectMatch && !hasMatchingDescendant}
                onSelect={onSelectNode}
                onExpand={onExpandNode}
                onContextMenu={onContextMenu}
                expandedMap={expandedMap}
                setExpandedMap={setExpandedMap}
                getTypeLabel={getTypeLabel}
                scrollContainerRef={scrollContainerRef}
              />
            </div>
          );
        })}
      </div>
    </aside>
  );
}