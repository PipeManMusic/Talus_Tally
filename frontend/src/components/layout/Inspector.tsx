import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { CurrencyInput } from '../ui/CurrencyInput';

export interface NodeProperty {
  id: string;
  name: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'currency' | 'date';
  value: string | number;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
}

export interface LinkedAssetMetadata {
  nodeId: string;
  nodeType: string;
  name: string;
  properties: NodeProperty[];
}

interface InspectorProps {
  nodeId?: string;
  nodeName?: string;
  nodeType?: string;
  properties: NodeProperty[];
  onPropertyChange?: (propId: string, value: string | number) => void;
  linkedAsset?: LinkedAssetMetadata;
  onLinkedAssetPropertyChange?: (propId: string, value: string | number) => void;
}

export function Inspector({
  nodeId,
  nodeName,
  nodeType,
  properties,
  onPropertyChange,
  linkedAsset,
  onLinkedAssetPropertyChange,
}: InspectorProps) {
  if (!nodeId) {
    return (
      <aside className="bg-bg-light border-l border-border p-3 flex items-center justify-center">
        <div className="text-sm text-fg-secondary text-center">
          Select a node to view properties
        </div>
      </aside>
    );
  }

  return (
    <aside className="bg-bg-light border-l border-border flex-1 flex flex-col h-full overflow-hidden">
      <div className="font-display text-sm border-b border-accent-primary pb-2 mb-3 px-3 pt-3 flex-shrink-0">
        Properties
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3">
        {/* Node Info */}
        <div className="mb-3">
          <div className="text-xs text-fg-secondary mb-1">Node Type</div>
          <div className="text-sm text-fg-primary font-semibold bg-accent-primary/10 rounded px-2 py-1 capitalize">
            {nodeType || 'Unknown'}
          </div>
        </div>
        <div className="mb-3">
          <div className="text-xs text-fg-secondary mb-1">Node ID</div>
          <div className="text-sm text-fg-primary font-mono bg-bg-dark rounded px-2 py-1 truncate" title={nodeId}>
            {nodeId}
          </div>
        </div>
        {/* Properties */}
        <div className="space-y-3">
        {properties.map((prop) => (
          <div key={prop.id}>
            {prop.type === 'text' && (
              <Input
                label={prop.name}
                value={prop.value}
                onChange={(e) => onPropertyChange?.(prop.id, e.target.value)}
                required={prop.required}
              />
            )}
            {prop.type === 'number' && (
              <Input
                label={prop.name}
                type="number"
                value={prop.value}
                onChange={(e) =>
                  onPropertyChange?.(prop.id, e.target.valueAsNumber)
                }
                required={prop.required}
              />
            )}
            {prop.type === 'currency' && (
              <CurrencyInput
                label={prop.name}
                value={prop.value}
                onChange={(e) => onPropertyChange?.(prop.id, e.target.value)}
                required={prop.required}
              />
            )}
            {prop.type === 'date' && (
              <Input
                label={prop.name}
                type="date"
                value={prop.value}
                onChange={(e) => onPropertyChange?.(prop.id, e.target.value)}
                required={prop.required}
              />
            )}
            {prop.type === 'select' && prop.options && (
              <Select
                label={prop.name}
                value={String(prop.value)}
                onChange={(e) => onPropertyChange?.(prop.id, e.target.value)}
                options={prop.options}
                required={prop.required}
              />
            )}
            {prop.type === 'textarea' && (
              <div>
                <label className="block text-sm text-fg-secondary mb-1">
                  {prop.name}
                </label>
                <textarea
                  value={prop.value}
                  onChange={(e) =>
                    onPropertyChange?.(prop.id, e.target.value)
                  }
                  className="w-full bg-bg-dark text-fg-primary border border-border rounded-sm px-2 py-1 text-sm font-body focus:border-accent-primary focus:outline-none resize-none"
                  rows={3}
                  required={prop.required}
                />
              </div>
            )}
          </div>
        ))}
        </div>

        {/* Linked Asset Metadata Section */}
        {linkedAsset && (
          <div className="mt-6 pt-6 border-t border-border">
            <div className="font-display text-sm border-b border-accent-success pb-2 mb-3 text-accent-success">
              Linked Asset: {linkedAsset.name}
            </div>
            <div className="mb-3">
              <div className="text-xs text-fg-secondary mb-1">Asset Type</div>
              <div className="text-sm text-fg-primary font-semibold bg-accent-success/10 rounded px-2 py-1 capitalize">
                {linkedAsset.nodeType}
              </div>
            </div>
            <div className="mb-3">
              <div className="text-xs text-fg-secondary mb-1">Asset ID</div>
              <div className="text-sm text-fg-primary font-mono bg-bg-dark rounded px-2 py-1 truncate" title={linkedAsset.nodeId}>
                {linkedAsset.nodeId}
              </div>
            </div>
            <div className="space-y-3">
              {linkedAsset.properties.map((prop) => (
                <div key={prop.id}>
                  {prop.type === 'text' && (
                    <Input
                      label={prop.name}
                      value={prop.value}
                      onChange={(e) => onLinkedAssetPropertyChange?.(prop.id, e.target.value)}
                      required={prop.required}
                    />
                  )}
                  {prop.type === 'number' && (
                    <Input
                      label={prop.name}
                      type="number"
                      value={prop.value}
                      onChange={(e) =>
                        onLinkedAssetPropertyChange?.(prop.id, e.target.valueAsNumber)
                      }
                      required={prop.required}
                    />
                  )}
                  {prop.type === 'currency' && (
                    <CurrencyInput
                      label={prop.name}
                      value={prop.value}
                      onChange={(e) => onLinkedAssetPropertyChange?.(prop.id, e.target.value)}
                      required={prop.required}
                    />
                  )}
                  {prop.type === 'date' && (
                    <Input
                      label={prop.name}
                      type="date"
                      value={prop.value}
                      onChange={(e) => onLinkedAssetPropertyChange?.(prop.id, e.target.value)}
                      required={prop.required}
                    />
                  )}
                  {prop.type === 'select' && prop.options && (
                    <Select
                      label={prop.name}
                      value={String(prop.value)}
                      onChange={(e) => onLinkedAssetPropertyChange?.(prop.id, e.target.value)}
                      options={prop.options}
                      required={prop.required}
                    />
                  )}
                  {prop.type === 'textarea' && (
                    <div>
                      <label className="block text-sm text-fg-secondary mb-1">
                        {prop.name}
                      </label>
                      <textarea
                        value={prop.value}
                        onChange={(e) =>
                          onLinkedAssetPropertyChange?.(prop.id, e.target.value)
                        }
                        className="w-full bg-bg-dark text-fg-primary border border-border rounded-sm px-2 py-1 text-sm font-body focus:border-accent-primary focus:outline-none resize-none"
                        rows={3}
                        required={prop.required}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
