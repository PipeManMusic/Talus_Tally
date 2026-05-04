import React from 'react';
import { TOOLS_TAB_DEFS, type ToolsTab } from '../../types/toolsTabs';
import { useUiPrefsStore } from '../../store/uiPrefsStore';

export interface ToolbarButton {
  id: string;
  label: string;
  icon: React.ReactNode | null;
  onClick: () => void;
  disabled?: boolean;
}

export type ViewType = 'graph' | 'tools';
export type { ToolsTab };

interface ToolbarProps {
  buttons?: ToolbarButton[];
  activeView?: ViewType;
  onViewChange?: (view: ViewType) => void;
  activeToolsTab?: ToolsTab;
  onToolsTabChange?: (tab: ToolsTab) => void;
  blockingNodeCount?: number;
  blockingEdgeCount?: number;
  onBlockingFitToView?: () => void;
  manpowerOverloadCount?: number;
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
  manpowerOverloadCount = 0,
}: ToolbarProps) {
  // Subscribe to the stable `enabledTools` record (not a derived selector) so
  // we don't trigger a render loop. zustand uses Object.is equality, so a
  // selector that returns `.filter(...)` would emit a new array reference on
  // every call and re-render forever. The filtered list is derived during
  // render instead.
  const enabledTools = useUiPrefsStore((s) => s.enabledTools);
  const enabledTabDefs = TOOLS_TAB_DEFS.filter((def) => enabledTools[def.id]);
  const showToolsButton = enabledTabDefs.length > 0;

  return (
    <div className="h-toolbar bg-bg-light border-b border-border px-2 flex items-center gap-4">
      {/* Left: Tools tabs (shown when in tools view) */}
      {activeView === 'tools' && onToolsTabChange && enabledTabDefs.length > 0 && (
        <div className="flex items-center bg-bg-dark border border-border rounded p-1">
          {enabledTabDefs.map((def) => {
            const Icon = def.icon;
            const isActive = activeToolsTab === def.id;
            return (
              <button
                key={def.id}
                onClick={() => onToolsTabChange(def.id)}
                className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors flex items-center gap-2 ${
                  def.id === 'manpower' ? 'relative' : ''
                } ${
                  isActive
                    ? 'bg-accent-primary text-fg-primary'
                    : 'text-fg-secondary hover:text-fg-primary'
                }`}
                title={def.title}
              >
                <Icon size={16} />
                {def.label}
                {def.id === 'manpower' && manpowerOverloadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-status-danger text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 leading-none">
                    {manpowerOverloadCount > 99 ? '99+' : manpowerOverloadCount}
                  </span>
                )}
              </button>
            );
          })}
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

      {/* Right: View Switcher. The "Tools" button is hidden when every tool
          tab is disabled in Settings — leaving an empty Tools view would be
          a dead end, so the entire view toggle disappears. */}
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
          {showToolsButton && (
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
          )}
        </div>
      )}
    </div>
  );
}
