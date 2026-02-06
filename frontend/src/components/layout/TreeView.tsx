import { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { mapNodeIndicator } from '../graph/mapNodeIndicator';
import { mapNodeIcon } from '../graph/mapNodeIcon';

// Helper function to recolor SVG fills and strokes with the blueprint color
const recolorSvg = (svgString: string, color: string | undefined): string => {
  if (!color || !svgString) return svgString;

  let recolored = svgString;

  // Replace any fill or stroke attributes with the theme color,
  // but preserve fill/stroke="none" or "transparent"
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
    })
    .replace(/stroke='([^']*)'/gi, (_match, value) => {
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'none' || normalized === 'transparent') {
        return `stroke='${value}'`;
      }
      return `stroke='${color}'`;
    });

  // Replace inline style fill/stroke declarations with the theme color
  // while preserving fill/stroke:none or transparent
  recolored = recolored.replace(/style="([^"]*)"/g, (_match, styleContent) => {
    let updatedStyle = String(styleContent)
      .replace(/fill:\s*[^;]+/gi, (fillMatch) => {
        const value = fillMatch.split(':')[1]?.trim().toLowerCase();
        if (value === 'none' || value === 'transparent') {
          return fillMatch;
        }
        return `fill:${color}`;
      })
      .replace(/stroke:\s*[^;]+/gi, (strokeMatch) => {
        const value = strokeMatch.split(':')[1]?.trim().toLowerCase();
        if (value === 'none' || value === 'transparent') {
          return strokeMatch;
        }
        return `stroke:${color}`;
      });
    return `style="${updatedStyle}"`;
  });

  return recolored;
};

export interface TreeNode {
  id: string;
  name: string;
  type: string; // blueprint_type_id from template (e.g., 'project_root', 'phase', 'job', 'task', 'part')
  children?: TreeNode[];
  selected?: boolean;
  indicator_id?: string;
  indicator_set?: string;
  icon_id?: string;
  allowed_children?: string[];
  // If properties is needed, define as below, else remove all usage
  // properties?: { [key: string]: any };
}

interface TreeViewProps {
  nodes: TreeNode[];
  onSelectNode?: (nodeId: string) => void;
  onExpandNode?: (nodeId: string) => void;
  onContextMenu?: (nodeId: string, action: string) => void;
  onBackgroundMenu?: (action: string) => void;
  expandAllSignal?: number;
  collapseAllSignal?: number;
  getTypeLabel?: (typeId: string) => string;
  expandedMap?: Record<string, boolean>;
  setExpandedMap?: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}


// Map node type to indicator type (customize as needed)
const indicatorMap: Record<string, string> = {
  project_root: 'empty',
  phase: 'partial',
  job: 'filled',
  task: 'alert',
  part: 'empty',
};

function TreeItem({
  node,
  level = 0,
  onSelect,
  onExpand,
  onContextMenu,
  expandedMap,
  setExpandedMap,
  getTypeLabel,
  scrollContainerRef,
}: {
  node: TreeNode;
  level?: number;
  onSelect?: (id: string) => void;
  onExpand?: (id: string) => void;
  onContextMenu?: (nodeId: string, action: string) => void;
  expandedMap: Record<string, boolean>;
  setExpandedMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  getTypeLabel?: (typeId: string) => string;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const [indicatorSvg, setIndicatorSvg] = useState<string | undefined>(undefined);
  const [indicatorText, setIndicatorText] = useState<string | undefined>(undefined);
  const [textColor, setTextColor] = useState<string | undefined>(undefined);
  const [textStyle, setTextStyle] = useState<string | undefined>(undefined);
  const [indicatorColor, setIndicatorColor] = useState<string | undefined>(undefined);
  const [iconSvg, setIconSvg] = useState<string | undefined>(undefined);
  // Debug: log node props and expansion state
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[TreeItem]', {
      id: node.id,
      name: node.name,
      type: node.type,
      allowed_children: node.allowed_children,
      expanded: expandedMap[node.id],
      childrenCount: node.children?.length,
    });
  }, [node, expandedMap]);
  
  // Debug: Log node fields to check for indicator metadata
  useEffect(() => {
    console.log('[TreeItem] Node fields:', {
      id: node.id,
      type: node.type,
      name: node.name,
      indicator_id: node.indicator_id,
      indicator_set: node.indicator_set,
      hasIndicatorId: !!node.indicator_id,
      hasIndicatorSet: !!node.indicator_set
    });
  }, [node]);
  
  // Fetch indicator SVG/text and theme on mount and when indicator_id/set/type/name changes
  useEffect(() => {
    let mounted = true;
    console.log('[TreeItem] Checking indicators for node:', node.id, {
      indicator_id: node.indicator_id,
      indicator_set: node.indicator_set,
      willFetch: !!(node.indicator_id && node.indicator_set)
    });
    if (node.indicator_id && node.indicator_set) {
      console.log('[TreeItem] Fetching indicator SVG for:', node.id);
      // Fetch SVG
      mapNodeIndicator(node).then((result) => {
        if (mounted) {
          setIndicatorSvg(result.statusIndicatorSvg);
          setIndicatorText(result.statusText);
          // Debug log SVG content
          // eslint-disable-next-line no-console
          console.log('[TreeView] indicatorSvg for node', node.id, ':', result.statusIndicatorSvg);
        }
      });
      
      // Fetch theme styling
      const indicatorSet = node.indicator_set || 'status';
      const indicatorId = node.indicator_id;
      fetch(`http://localhost:5000/api/v1/indicators/${indicatorSet}/${indicatorId}/theme`)
        .then(res => res.json())
        .then(theme => {
          if (mounted && theme) {
            setTextColor(theme.text_color);
            setTextStyle(theme.text_style);
            setIndicatorColor(theme.indicator_color);
          }
        })
        .catch(err => console.warn('Failed to fetch theme:', err));
    } else {
      setIndicatorSvg(undefined);
      setIndicatorText(undefined);
      setTextColor(undefined);
      setTextStyle(undefined);
      setIndicatorColor(undefined);
    }
    return () => { mounted = false; };
  }, [node.indicator_id, node.indicator_set, node.type, node.name]);

  useEffect(() => {
    let mounted = true;
    if (!node.icon_id) {
      setIconSvg(undefined);
      return () => { mounted = false; };
    }
    setIconSvg(undefined);
    mapNodeIcon(node.icon_id).then((svg) => {
      if (mounted) {
        setIconSvg(svg);
      }
    });
    return () => { mounted = false; };
  }, [node.icon_id]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showFlyout, setShowFlyout] = useState(false);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [flyoutPos, setFlyoutPos] = useState<{ x: number; y: number } | null>(null);
    // Close flyout on outside click
    useEffect(() => {
      if (!showFlyout) return;
      function handleClick(e: MouseEvent) {
        if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
          setShowFlyout(false);
        }
      }
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }, [showFlyout]);

    useEffect(() => {
      if (!showFlyout) return;
      
      let animationFrameId: number;
      
      const updatePosition = () => {
        const button = addButtonRef.current;
        if (!button) return;

        const rect = button.getBoundingClientRect();
        const flyout = flyoutRef.current;
        const flyoutRect = flyout?.getBoundingClientRect();
        const padding = 8;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let x = rect.left;
        let y = rect.bottom + 6;

        if (flyoutRect) {
          if (x + flyoutRect.width + padding > viewportWidth) {
            x = rect.right - flyoutRect.width;
          }
          if (x < padding) {
            x = padding;
          }

          if (y + flyoutRect.height + padding > viewportHeight) {
            y = rect.top - flyoutRect.height - 6;
          }
          if (y < padding) {
            y = padding;
          }
        }

        setFlyoutPos({ x, y });
        
        // Continue updating position on every frame while flyout is open
        animationFrameId = requestAnimationFrame(updatePosition);
      };

      // Start the animation frame loop
      animationFrameId = requestAnimationFrame(updatePosition);

      return () => {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
      };
    }, [showFlyout]);
  const hasChildren = node.children && node.children.length > 0;
  const allowedChildren = node.allowed_children;
  // Recognize inventory types by suffix pattern
  const isInventoryType = (type: string) => type.endsWith('_inventory') || type === 'assets' || type === 'asset_category';
  const allowedChildrenList = allowedChildren || [];
  const hasAllowedChildren = allowedChildrenList.length > 0;
  const showAssetCategoryAction = allowedChildrenList.some((child) => isInventoryType(child));
  const standardTypes = allowedChildrenList.filter((child) => !isInventoryType(child));
  const handleMenuAction = (action: string) => {
    onContextMenu?.(node.id, action);
    setContextMenu(null);
  };
  // Prefer backend-driven indicator_id and indicator_set, fallback to type map
  const resolvedIndicatorId = node.indicator_id || indicatorMap[node.type] || 'empty';
  const resolvedIndicatorSet = node.indicator_set || 'status';
  const expanded = expandedMap[node.id] ?? false;
  const iconColor = textColor || indicatorColor;

  const formatTypeLabel = (type: string) =>
    type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  const resolveTypeLabel = (type: string) =>
    getTypeLabel?.(type) ?? formatTypeLabel(type);

  const groupedChildren = (node.children || []).reduce<Record<string, TreeNode[]>>((acc, child) => {
    const key = child.type || 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(child);
    return acc;
  }, {});
  const groupedChildTypes = Object.keys(groupedChildren);

  useEffect(() => {
      let mounted = true;
      const hasIndicatorMeta = !!(node.indicator_id && node.indicator_set);
      console.log('[TreeItem] Checking indicators for node:', node.id, {
        indicator_id: node.indicator_id,
        indicator_set: node.indicator_set,
        willFetchSvg: hasIndicatorMeta,
        resolvedIndicator: `${resolvedIndicatorSet}/${resolvedIndicatorId}`,
      });
      if (hasIndicatorMeta) {
        console.log('[TreeItem] Fetching indicator SVG for:', node.id);
        mapNodeIndicator(node).then((result) => {
          if (mounted) {
            setIndicatorSvg(result.statusIndicatorSvg);
            setIndicatorText(result.statusText);
            // eslint-disable-next-line no-console
            console.log('[TreeView] indicatorSvg for node', node.id, ':', result.statusIndicatorSvg);
          }
        });
      } else {
        setIndicatorSvg(undefined);
        setIndicatorText(undefined);
      }

      if (resolvedIndicatorId && resolvedIndicatorSet) {
        console.log('[TreeItem] Applying theme for indicator', resolvedIndicatorSet, resolvedIndicatorId);
        fetch(`http://localhost:5000/api/v1/indicators/${resolvedIndicatorSet}/${resolvedIndicatorId}/theme`)
          .then(res => res.json())
          .then(theme => {
            if (mounted && theme) {
              setTextColor(theme.text_color ?? theme.indicator_color);
              setTextStyle(theme.text_style);
              setIndicatorColor(theme.indicator_color);
            }
          })
          .catch(err => {
            console.warn('Failed to fetch theme:', err);
            if (mounted) {
              setTextColor(undefined);
              setTextStyle(undefined);
              setIndicatorColor(undefined);
            }
          });
      } else {
        setTextColor(undefined);
        setTextStyle(undefined);
        setIndicatorColor(undefined);
      }

      return () => { mounted = false; };
    }, [node.indicator_id, node.indicator_set, node.type, node.name, resolvedIndicatorId, resolvedIndicatorSet]);
  return (
    <>
      <div
      onClick={() => onSelect?.(node.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
      className={`flex items-center gap-1 px-2 py-1.5 rounded-sm cursor-pointer transition-colors ${
        node.selected
          ? 'bg-bg-selection border-l-4 border-accent-primary'
          : 'hover:bg-bg-selection'
      }`}
      data-testid="tree-item-row"
      >
        {/* Add Node (+) Button on the left */}
        {hasAllowedChildren && (
          <button
            ref={addButtonRef}
            className="mr-1 px-1 py-0.5 rounded bg-bg-light border border-border hover:bg-accent-primary hover:text-fg-primary"
            title="Add child node"
            onClick={e => {
              e.stopPropagation();
              setShowFlyout((v) => !v);
            }}
            aria-label="Add child node"
            data-testid="add-child-btn"
          >
            +
          </button>
        )}

        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpandedMap((prev) => ({ ...prev, [node.id]: !expanded }));
              onExpand?.(node.id);
            }}
            className="p-0 hover:text-accent-hover"
            data-testid="expand-toggle-btn"
          >
            {expanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </button>
        )}

        {!hasChildren && <div className="w-4" />}

        <span className="flex items-center gap-2">
          {iconSvg && (
            <span
              className="node-icon-svg h-4 w-4 flex-shrink-0"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: recolorSvg(iconSvg, iconColor) }}
            />
          )}
          {indicatorSvg ? (
            <span
              className="status-indicator-svg"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: recolorSvg(indicatorSvg, indicatorColor) }}
            />
          ) : indicatorText ? (
            <span className="status-indicator-text text-xs opacity-80">{indicatorText}</span>
          ) : (
            <span className="status-indicator-text text-xs opacity-40">•</span>
          )}
        </span>
        {/* Always show node label with theme styling */}
        <span 
          className="text-sm truncate"
          style={{
            color: textColor,
            fontWeight: textStyle === 'bold' ? 'bold' : 'normal',
            textDecoration: textStyle === 'strikethrough' ? 'line-through' : 'none',
          }}
        >
          {node.name || node.type || node.id}
        </span>
      </div>

      {/* Flyout for child type selection */}
      {showFlyout && hasAllowedChildren && flyoutPos && (
        <div
          ref={flyoutRef}
          className="fixed z-50 bg-bg-light border border-border rounded shadow-lg p-2"
          style={{ top: `${flyoutPos.y}px`, left: `${flyoutPos.x}px` }}
        >
          {showAssetCategoryAction && (
            <button
              className="block w-full text-left px-2 py-1 hover:bg-accent-primary hover:text-fg-primary rounded"
              onClick={() => {
                setShowFlyout(false);
                if (onContextMenu) onContextMenu(node.id, 'add-asset-category');
              }}
            >
              Add Asset Category
            </button>
          )}
          {standardTypes.map((type: string) => (
            <button
              key={type}
              className="block w-full text-left px-2 py-1 hover:bg-accent-primary hover:text-fg-primary rounded"
              onClick={() => {
                setShowFlyout(false);
                if (onContextMenu) onContextMenu(node.id, `add:${type}`);
              }}
            >
              Add {resolveTypeLabel(type)}
            </button>
          ))}
        </div>
      )}

      {/* Context Menu */}
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
        </div>
      )}

      {expanded && hasChildren && (
        <div className="ml-2 border-l border-border">
          {groupedChildTypes.map((type) => (
            <div key={`${node.id}-${type}`} className="mt-2">
              <div
                className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-secondary)]"
                data-testid="tree-type-header"
              >
                  {resolveTypeLabel(type)}
              </div>
              <div>
                {groupedChildren[type].map((child) => (
                  <TreeItem
                    key={child.id}
                    node={child}
                    level={level + 1}
                    onSelect={onSelect}
                    onExpand={onExpand}
                    onContextMenu={onContextMenu}
                    expandedMap={expandedMap}
                    setExpandedMap={setExpandedMap}
                    getTypeLabel={getTypeLabel}
                    scrollContainerRef={scrollContainerRef}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function TreeView({
  nodes,
  onSelectNode,
  onExpandNode,
  onContextMenu,
  onBackgroundMenu,
  expandAllSignal,
  collapseAllSignal,
  getTypeLabel,
  expandedMap: externalExpandedMap,
  setExpandedMap: externalSetExpandedMap,
}: TreeViewProps) {
  const [backgroundMenu, setBackgroundMenu] = useState<{ x: number; y: number } | null>(null);
  const [internalExpandedMap, setInternalExpandedMap] = useState<Record<string, boolean>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Track previous signal values
  const prevExpandSignalRef = useRef<number | undefined>(undefined);
  const prevCollapseSignalRef = useRef<number | undefined>(undefined);

  // Use external expandedMap if provided, otherwise use internal state
  const expandedMap = externalExpandedMap || internalExpandedMap;
  const setExpandedMap = externalSetExpandedMap || setInternalExpandedMap;

  // Helper function to recursively get all node IDs
  const getAllNodeIds = (nodeList: TreeNode[]): string[] => {
    const ids: string[] = [];
    const traverse = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        ids.push(node.id);
        if (node.children) {
          traverse(node.children);
        }
      });
    };
    traverse(nodeList);
    return ids;
  };

  // Handle expand all signal
  useEffect(() => {
    if (expandAllSignal !== undefined && 
        expandAllSignal > 0 && 
        expandAllSignal !== prevExpandSignalRef.current) {
      prevExpandSignalRef.current = expandAllSignal;
      const allNodeIds = getAllNodeIds(nodes);
      const newExpandedMap: Record<string, boolean> = {};
      allNodeIds.forEach(id => {
        newExpandedMap[id] = true;
      });
      setExpandedMap(newExpandedMap);
      console.log('✓ Expand all', { signal: expandAllSignal, nodeCount: allNodeIds.length });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandAllSignal]);

  // Handle collapse all signal
  useEffect(() => {
    if (collapseAllSignal !== undefined && 
        collapseAllSignal > 0 && 
        collapseAllSignal !== prevCollapseSignalRef.current) {
      prevCollapseSignalRef.current = collapseAllSignal;
      setExpandedMap({});
      console.log('✓ Collapse all', { signal: collapseAllSignal });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseAllSignal]);

  const handleBackgroundContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setBackgroundMenu({ x: e.clientX, y: e.clientY });
  };

  // Separate project_root nodes from others
  const projectRoots = nodes.filter(node => node.type === 'project_root');
  const hasMultipleProjects = projectRoots.length > 1;

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
        {nodes.map((node) => (
          <div key={node.id}>
            {/* Show project title separator if this is a project_root and there are multiple projects */}
            {hasMultipleProjects && node.type === 'project_root' && (
              <div className="font-display text-xs font-semibold uppercase tracking-wide text-accent-primary border-t border-border pt-2 mt-2 mb-1">
                Project: {node.name}
              </div>
            )}
            <TreeItem
              node={node}
              onSelect={onSelectNode}
              onExpand={onExpandNode}
              onContextMenu={onContextMenu}
              expandedMap={expandedMap}
              setExpandedMap={setExpandedMap}
              getTypeLabel={getTypeLabel}
              scrollContainerRef={scrollContainerRef}
              data-expanded={expandedMap[node.id] ? 'true' : 'false'}
            />
          </div>
        ))}
      </div>

      {backgroundMenu && (
        <div
          className="fixed bg-bg-light border border-border rounded-sm shadow-lg z-50 min-w-max"
          style={{ top: `${backgroundMenu.y}px`, left: `${backgroundMenu.x}px` }}
          onMouseLeave={() => setBackgroundMenu(null)}
        >
          <button
            onClick={() => {
              onBackgroundMenu?.('add-project-root');
              setBackgroundMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-bg-selection transition-colors first:rounded-t-sm last:rounded-b-sm"
          >
            ➕ Add Project Root
          </button>
        </div>
      )}
    </aside>
  );
}
