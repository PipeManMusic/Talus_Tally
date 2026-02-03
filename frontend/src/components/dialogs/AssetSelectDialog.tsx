import { useMemo, useState } from 'react';

interface AssetOption {
  id: string;
  name: string;
  type: string;
  typeLabel?: string;
}

interface AssetSelectDialogProps {
  title?: string;
  assets: AssetOption[];
  onConfirm: (assetId: string) => void;
  onCancel: () => void;
}

export function AssetSelectDialog({
  title = 'Select Asset',
  assets,
  onConfirm,
  onCancel,
}: AssetSelectDialogProps) {
  const [selectedId, setSelectedId] = useState(assets[0]?.id ?? '');

  const grouped = useMemo(() => {
    const map = new Map<string, AssetOption[]>();
    for (const asset of assets) {
      const label = asset.typeLabel || asset.type;
      const list = map.get(label) ?? [];
      list.push(asset);
      map.set(label, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [assets]);

  const handleConfirm = () => {
    if (!selectedId) {
      alert('Please select an asset');
      return;
    }
    onConfirm(selectedId);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-bg-light border border-border rounded-lg shadow-lg p-6 w-[28rem]">
        <h2 className="font-display text-lg font-bold text-fg-primary mb-4">{title}</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-fg-primary mb-2">Asset</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full px-3 py-2 bg-bg-dark border border-border rounded text-fg-primary"
            >
              {assets.length === 0 && (
                <option value="" disabled>
                  No assets available
                </option>
              )}
              {grouped.map(([type, items]) => (
                <optgroup key={type} label={type}>
                  {items.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-bg-dark border border-border rounded text-fg-primary hover:bg-bg-selection"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2 bg-accent-primary rounded text-fg-primary hover:bg-accent-hover"
          >
            Add Asset
          </button>
        </div>
      </div>
    </div>
  );
}
