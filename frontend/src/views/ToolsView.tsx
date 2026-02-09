import { Wrench, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { VelocityView } from '../components/velocity/VelocityView';
import { NodeBlockingEditor } from '../components/velocity/NodeBlockingEditor';
import type { Node } from '../api/client';

interface ToolsViewProps {
  sessionId?: string | null;
  nodes?: Record<string, Node>;
}

type ToolsTab = 'overview' | 'velocity' | 'blocking';

export function ToolsView({ sessionId, nodes = {} }: ToolsViewProps) {
  const [activeTab, setActiveTab] = useState<ToolsTab>('overview');

  return (
    <div className="flex flex-col h-full bg-bg-dark text-fg-primary">
      {/* Header with Tab Switcher */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wrench size={24} className="text-accent-primary" />
            <h1 className="text-2xl font-display font-bold">Tools</h1>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 bg-bg-dark border border-border rounded p-1 w-fit">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${
              activeTab === 'overview'
                ? 'bg-accent-primary text-fg-primary'
                : 'text-fg-secondary hover:text-fg-primary'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('velocity')}
            className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${
              activeTab === 'velocity'
                ? 'bg-accent-primary text-fg-primary'
                : 'text-fg-secondary hover:text-fg-primary'
            }`}
          >
            Velocity
          </button>
          <button
            onClick={() => setActiveTab('blocking')}
            className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${
              activeTab === 'blocking'
                ? 'bg-accent-primary text-fg-primary'
                : 'text-fg-secondary hover:text-fg-primary'
            }`}
          >
            Blocking
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' ? (
        <div className="flex-1 overflow-auto px-6 py-6">
          <div className="text-center py-12 text-fg-secondary">
            <Wrench size={64} className="mx-auto mb-4 opacity-30" />
            <h2 className="text-xl font-semibold mb-2">Additional Tools Coming Soon</h2>
            <p className="text-sm">
              This section will be populated with new features and utilities.
            </p>
          </div>
        </div>
      ) : activeTab === 'velocity' ? (
        <VelocityView sessionId={sessionId || null} />
      ) : (
        <NodeBlockingEditor sessionId={sessionId || null} nodes={nodes} />
      )}
    </div>
  );
}
