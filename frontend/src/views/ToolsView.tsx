import { Wrench } from 'lucide-react';

export function ToolsView() {
  return (
    <div className="flex flex-col h-full bg-bg-dark text-fg-primary">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <Wrench size={24} className="text-accent-primary" />
          <h1 className="text-2xl font-display font-bold">Tools</h1>
        </div>
        <p className="text-sm text-fg-secondary mt-1">Additional features and utilities</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="text-center py-12 text-fg-secondary">
          <Wrench size={64} className="mx-auto mb-4 opacity-30" />
          <h2 className="text-xl font-semibold mb-2">Additional Tools Coming Soon</h2>
          <p className="text-sm">
            This section will be populated with new features and utilities.
          </p>
        </div>
      </div>
    </div>
  );
}
