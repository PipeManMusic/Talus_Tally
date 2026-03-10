import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, DollarSign, ChevronRight, ChevronDown } from 'lucide-react';
import { apiClient, type BudgetPayload, type BudgetNode, type VelocityScore } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useFilterStore, type FilterRule } from '../../store/filterStore';
import { evaluateNodeVisibility } from '../../utils/filterEngine';

interface BudgetViewProps {
  sessionId: string | null;
  nodes?: Record<string, any>;
  velocityScores?: Record<string, VelocityScore>;
  onNodeSelect?: (nodeId: string | null) => void;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function BudgetTreeRow({
  node,
  nodes,
  velocityScores,
  onNodeSelect,
  filterRules,
  filterMode,
}: {
  node: BudgetNode;
  nodes?: Record<string, any>;
  velocityScores?: Record<string, any>;
  onNodeSelect?: (nodeId: string | null) => void;
  filterRules: FilterRule[];
  filterMode: 'hide' | 'ghost';
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  // Evaluate visibility based on filter rules
  // Create a node-like structure for filter evaluation
  const sourceNodeProps = nodes?.[node.nodeId]?.properties || {};
  const nodeForFilter = {
    id: node.nodeId,
    name: node.nodeName,
    type: node.nodeType,
    properties: {
      ...sourceNodeProps,
      name: node.nodeName,
      type: node.nodeType,
      estimated: node.totalEstimated,
      actual: node.totalActual,
      variance: node.variance,
    },
    velocity: velocityScores?.[node.nodeId],
  };

  const isVisible = evaluateNodeVisibility(nodeForFilter, filterRules);

  // If node doesn't pass filter
  if (!isVisible) {
    if (filterMode === 'hide') {
      return null; // Don't render at all
    }
    // If 'ghost', continue rendering but with reduced opacity
  }

  const varianceClass =
    node.variance > 0
      ? 'text-status-danger'
      : node.variance < 0
        ? 'text-status-success'
        : 'text-fg-primary';

  const rowOpacity = !isVisible && filterMode === 'ghost' ? 'opacity-30' : '';

  return (
    <>
      <div
        className={`flex items-center border-b border-border hover:bg-bg-light transition-colors cursor-pointer group ${rowOpacity}`}
        style={{ paddingLeft: `${node.depth * 24 + 12}px` }}
        onClick={() => onNodeSelect?.(node.nodeId)}
      >
        {/* Expand/Collapse */}
        <div className="w-6 flex-shrink-0">
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="text-fg-secondary hover:text-fg-primary transition-colors"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
        </div>

        {/* Node info */}
        <div className="flex-1 py-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-fg-primary truncate">{node.nodeName}</span>
            <span className="text-xs text-fg-secondary flex-shrink-0">{node.nodeType}</span>
          </div>
        </div>

        {/* Cost columns */}
        <div className="flex items-center gap-6 pr-4 flex-shrink-0">
          <div className="text-right w-32">
            <div className="text-xs text-fg-secondary">Estimated</div>
            <div className={`text-sm font-mono ${node.totalEstimated > 0 ? 'text-fg-primary' : 'text-fg-secondary'}`}>
              {node.totalEstimated > 0 ? formatCurrency(node.totalEstimated) : '—'}
            </div>
          </div>
          <div className="text-right w-32">
            <div className="text-xs text-fg-secondary">Actual</div>
            <div className={`text-sm font-mono ${node.totalActual > 0 ? 'text-fg-primary' : 'text-fg-secondary'}`}>
              {node.totalActual > 0 ? formatCurrency(node.totalActual) : '—'}
            </div>
          </div>
          <div className="text-right w-32">
            <div className="text-xs text-fg-secondary">Variance</div>
            <div className={`text-sm font-mono font-bold ${varianceClass}`}>
              {node.variance !== 0 ? formatCurrency(node.variance) : '$0.00'}
            </div>
          </div>
        </div>
      </div>

      {/* Children */}
      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <BudgetTreeRow
            key={child.nodeId}
            node={child}
            nodes={nodes}
            velocityScores={velocityScores}
            onNodeSelect={onNodeSelect}
            filterRules={filterRules}
            filterMode={filterMode}
          />
        ))}
    </>
  );
}

// Flat row component for filtered results
function BudgetFlatRow({
  node,
  nodes,
  velocityScores,
  onNodeSelect,
}: {
  node: BudgetNode;
  nodes?: Record<string, any>;
  velocityScores?: Record<string, any>;
  onNodeSelect?: (nodeId: string | null) => void;
}) {
  const varianceClass =
    node.variance > 0
      ? 'text-status-danger'
      : node.variance < 0
        ? 'text-status-success'
        : '';

  return (
    <div
      className="px-6 py-3 border-b border-border hover:bg-bg-light transition-colors cursor-pointer"
      onClick={() => onNodeSelect?.(node.nodeId)}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="font-medium text-fg-primary">{node.nodeName}</div>
          <div className="text-xs text-fg-secondary">{node.nodeType}</div>
        </div>

        <div className="grid grid-cols-3 gap-6 text-right">
          <div>
            <div className="text-xs text-fg-secondary">Estimated</div>
            <div className="font-medium text-fg-primary">{formatCurrency(node.totalEstimated)}</div>
          </div>
          <div>
            <div className="text-xs text-fg-secondary">Actual</div>
            <div className="font-medium text-fg-primary">{formatCurrency(node.totalActual)}</div>
          </div>
          <div>
            <div className="text-xs text-fg-secondary">Variance</div>
            <div className={`font-medium ${varianceClass}`}>{formatCurrency(node.variance)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BudgetTreeContent({
  trees,
  nodes,
  velocityScores,
  onNodeSelect,
}: {
  trees: BudgetNode[];
  nodes?: Record<string, any>;
  velocityScores?: Record<string, any>;
  onNodeSelect?: (nodeId: string | null) => void;
}) {
  const { rules, filterMode } = useFilterStore();

  // Helper to flatten tree to all leaf nodes
  const flattenTree = (node: BudgetNode): BudgetNode[] => {
    const sourceNodeProps = nodes?.[node.nodeId]?.properties || {};
    const nodeForFilter = {
      id: node.nodeId,
      name: node.nodeName,
      type: node.nodeType,
      properties: {
        ...sourceNodeProps,
        name: node.nodeName,
        type: node.nodeType,
        estimated: node.totalEstimated,
        actual: node.totalActual,
        variance: node.variance,
      },
      velocity: velocityScores?.[node.nodeId],
    };
    
    const isVisible = evaluateNodeVisibility(nodeForFilter, rules);
    const results: BudgetNode[] = [];
    
    if (isVisible) {
      results.push(node);
    }
    
    // Recurse into children
    for (const child of node.children) {
      results.push(...flattenTree(child));
    }
    
    return results;
  };

  // When filters are active, show flat list; otherwise show tree
  const hasFilters = rules.length > 0;
  const flatNodes = hasFilters 
    ? trees.flatMap(tree => flattenTree(tree))
    : [];

  return (
    <>
      {hasFilters ? (
        // Flat list when filters are active
        <div className="space-y-0">
          {flatNodes.length === 0 ? (
            <div className="px-6 py-4 text-sm text-fg-secondary italic">No nodes match the filter</div>
          ) : (
            flatNodes.map((node) => (
              <BudgetFlatRow
                key={node.nodeId}
                node={node}
                nodes={nodes}
                velocityScores={velocityScores}
                onNodeSelect={onNodeSelect}
              />
            ))
          )}
        </div>
      ) : (
        // Tree view when no filters
        <>
          {trees.map((tree) => (
            <BudgetTreeRow
              key={tree.nodeId}
              node={tree}
              nodes={nodes}
              velocityScores={velocityScores}
              onNodeSelect={onNodeSelect}
              filterRules={rules}
              filterMode={filterMode}
            />
          ))}
        </>
      )}
    </>
  );
}

export function BudgetView({ sessionId, nodes, velocityScores, onNodeSelect }: BudgetViewProps) {
  const [data, setData] = useState<BudgetPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshPendingRef = useRef(false);
  const refreshingRef = useRef(false);

  const fetchBudget = useCallback(async () => {
    if (!sessionId) return;
    if (refreshingRef.current) {
      refreshPendingRef.current = true;
      return;
    }

    refreshingRef.current = true;
    try {
      setLoading(true);
      setError(null);
      const result = await apiClient.getBudgetPayload(sessionId);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load budget');
      console.error('Error loading budget:', err);
    } finally {
      setLoading(false);
      refreshingRef.current = false;
      if (refreshPendingRef.current) {
        refreshPendingRef.current = false;
        fetchBudget();
      }
    }
  }, [sessionId]);

  useEffect(() => {
    fetchBudget();
  }, [fetchBudget]);

  useWebSocket({
    onNodeCreated: fetchBudget,
    onNodeUpdated: fetchBudget,
    onNodeDeleted: fetchBudget,
    onPropertyChanged: fetchBudget,
  });

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-secondary bg-bg-dark">
        <div className="text-center">
          <div className="text-lg mb-2">No project loaded</div>
          <div className="text-sm">Load a project to see budget rollup</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-bg-dark text-fg-primary">
      {/* Error Display */}
      {error && (
        <div className="px-6 py-3 bg-status-danger/10 border-b border-status-danger text-status-danger">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && !data && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-fg-secondary">Loading budget data...</div>
        </div>
      )}

      {/* Grand Total Header */}
      {data && (
        <div className="px-6 py-4 border-b border-border bg-bg-light">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign size={20} className="text-accent-primary" />
              <span className="text-sm font-semibold text-fg-secondary">Project Estimated Total</span>
            </div>
            <div className="text-2xl font-bold text-accent-primary font-mono">
              {formatCurrency(data.grandEstimated ?? data.grandTotal)}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-8 text-sm font-mono">
            <div className="text-fg-secondary">Actual: <span className="text-fg-primary">{formatCurrency(data.grandActual ?? 0)}</span></div>
            <div className="text-fg-secondary">Variance: <span className={(data.grandVariance ?? 0) > 0 ? 'text-status-danger' : (data.grandVariance ?? 0) < 0 ? 'text-status-success' : 'text-fg-primary'}>{formatCurrency(data.grandVariance ?? 0)}</span></div>
          </div>
        </div>
      )}

      {/* Budget Tree */}
      {data && data.trees.length > 0 && (
        <div className="flex-1 overflow-auto">
          <BudgetTreeContent trees={data.trees} nodes={nodes} velocityScores={velocityScores} onNodeSelect={onNodeSelect} />
        </div>
      )}

      {/* Empty State */}
      {!loading && data && data.trees.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-fg-secondary">
            <DollarSign size={48} className="mx-auto mb-3 opacity-30" />
            <div className="text-sm">No nodes with budget data</div>
            <div className="text-xs mt-1">Enable the "budgeting" feature on node types to add estimated costs</div>
          </div>
        </div>
      )}
    </div>
  );
}
