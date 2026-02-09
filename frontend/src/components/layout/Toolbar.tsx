import React from 'react';

export interface ToolbarButton {
  id: string;
  label: string;
  icon: React.ReactNode | null;
  onClick: () => void;
  disabled?: boolean;
}

export type ViewType = 'graph' | 'tools';

interface ToolbarProps {
  buttons?: ToolbarButton[];
  activeView?: ViewType;
  onViewChange?: (view: ViewType) => void;
}

const defaultButtons: ToolbarButton[] = [];

export function Toolbar({ 
  buttons = defaultButtons,
  activeView = 'graph',
  onViewChange,
}: ToolbarProps) {
  return (
    <div className="h-toolbar bg-bg-light border-b border-border px-2 flex items-center gap-2">
      {/* Left: Spacer */}
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
