import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, DollarSign, ChevronRight, ChevronDown } from 'lucide-react';
import { apiClient, type BudgetPayload, type BudgetNode } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';

interface BudgetViewProps {
  sessionId: string | null;
  nodes?: Record<string, any>;
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
  onNodeSelect,
}: {
  node: BudgetNode;
  onNodeSelect?: (nodeId: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const hasCost = node.totalCost > 0;

  return (
    <>
      <div
        className="flex items-center border-b border-border hover:bg-bg-light transition-colors cursor-pointer group"
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
          <div className="text-right w-28">
            <div className="text-xs text-fg-secondary">Own</div>
            <div className={`text-sm font-mono ${node.ownCost > 0 ? 'text-fg-primary' : 'text-fg-secondary'}`}>
              {node.ownCost > 0 ? formatCurrency(node.ownCost) : '—'}
            </div>
          </div>
          {hasChildren && (
            <div className="text-right w-28">
              <div className="text-xs text-fg-secondary">Children</div>
              <div className={`text-sm font-mono ${node.childrenCost > 0 ? 'text-fg-primary' : 'text-fg-secondary'}`}>
                {node.childrenCost > 0 ? formatCurrency(node.childrenCost) : '—'}
              </div>
            </div>
          )}
          <div className="text-right w-32">
            <div className="text-xs text-fg-secondary">Total</div>
            <div className={`text-sm font-mono font-bold ${hasCost ? 'text-accent-primary' : 'text-fg-secondary'}`}>
              {hasCost ? formatCurrency(node.totalCost) : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Children */}
      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <BudgetTreeRow key={child.nodeId} node={child} onNodeSelect={onNodeSelect} />
        ))}
    </>
  );
}

export function BudgetView({ sessionId, onNodeSelect }: BudgetViewProps) {
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
              <span className="text-sm font-semibold text-fg-secondary">Project Total</span>
            </div>
            <div className="text-2xl font-bold text-accent-primary font-mono">
              {formatCurrency(data.grandTotal)}
            </div>
          </div>
        </div>
      )}

      {/* Budget Tree */}
      {data && data.trees.length > 0 && (
        <div className="flex-1 overflow-auto">
          {data.trees.map((tree) => (
            <BudgetTreeRow key={tree.nodeId} node={tree} onNodeSelect={onNodeSelect} />
          ))}
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
