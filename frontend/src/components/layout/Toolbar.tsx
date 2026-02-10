import React from 'react';
import { TrendingUp, Zap } from 'lucide-react';

export interface ToolbarButton {
  id: string;
  label: string;
  icon: React.ReactNode | null;
  onClick: () => void;
  disabled?: boolean;
}

export type ViewType = 'graph' | 'tools';
export type ToolsTab = 'velocity' | 'blocking';

interface ToolbarProps {
  buttons?: ToolbarButton[];
  activeView?: ViewType;
  onViewChange?: (view: ViewType) => void;
  activeToolsTab?: ToolsTab;
  onToolsTabChange?: (tab: ToolsTab) => void;
  blockingNodeCount?: number;
  blockingEdgeCount?: number;
  onBlockingFitToView?: () => void;
}

const defaultButtons: ToolbarButton[] = [];

export function Toolbar({ 
  buttons = defaultButtons,
  activeView = 'graph',
  onViewChange,
  activeToolsTab = 'velocity',
  onToolsTabChange,
  blockingNodeCount = 0,
  blockingEdgeCount = 0,
  onBlockingFitToView,
}: ToolbarProps) {
  return (
    <div className="h-toolbar bg-bg-light border-b border-border px-2 flex items-center gap-4">
      {/* Left: Tools tabs (shown when in tools view) */}
      {activeView === 'tools' && onToolsTabChange && (
        <div className="flex items-center bg-bg-dark border border-border rounded p-1">
          <button
            onClick={() => onToolsTabChange('velocity')}
            className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors flex items-center gap-2 ${
              activeToolsTab === 'velocity'
                ? 'bg-accent-primary text-fg-primary'
                : 'text-fg-secondary hover:text-fg-primary'
            }`}
            title="Switch to velocity view"
          >
            <TrendingUp size={16} />
            Velocity
          </button>
          <button
            onClick={() => onToolsTabChange('blocking')}
            className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors flex items-center gap-2 ${
              activeToolsTab === 'blocking'
                ? 'bg-accent-primary text-fg-primary'
                : 'text-fg-secondary hover:text-fg-primary'
            }`}
            title="Switch to blocking view"
          >
            <Zap size={16} />
            Blocking
          </button>
        </div>
      )}

      {/* Blocking Editor Controls (shown when in blocking view) */}
      {activeView === 'tools' && activeToolsTab === 'blocking' && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => onBlockingFitToView?.()}
            disabled={!onBlockingFitToView}
            className="px-3 py-1.5 bg-accent-primary text-fg-primary text-xs font-semibold rounded hover:bg-accent-hover transition-colors"
            title="Fit graph to view"
          >
            Fit to View
          </button>
          <div className="text-xs text-fg-secondary">
            {blockingNodeCount} nodes • {blockingEdgeCount} relationships
          </div>
        </div>
      )}

      {/* Center: Spacer */}
      <div className="flex-1" />

      {/* Right: View Switcher */}
      {onViewChange && (
        <div className="flex items-center bg-bg-dark border border-border rounded p-1">
          <button
            onClick={() => onViewChange('graph')}
            className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${
              activeView === 'graph'
                ? 'bg-accent-primary text-fg-primary'
                : 'text-fg-secondary hover:text-fg-primary hover:bg-bg-selection'
            }`}
            title="Switch to tree view"
          >
            Tree
          </button>
          <button
            onClick={() => onViewChange('tools')}
            className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${
              activeView === 'tools'
                ? 'bg-accent-primary text-fg-primary'
                : 'text-fg-secondary hover:text-fg-primary hover:bg-bg-selection'
            }`}
            title="Switch to tools view"
          >
            Tools
          </button>
        </div>
      )}
    </div>
  );
}
