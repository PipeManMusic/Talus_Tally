import { useEffect, useMemo, useState } from 'react';

interface AssetCategoryOption {
  id: string;
  label: string;
}

interface AssetCategoryDialogProps {
  title?: string;
  categories: AssetCategoryOption[];
  onConfirm: (categoryId: string, name: string) => void;
  onCancel: () => void;
}

export function AssetCategoryDialog({
  title = 'Add Asset Category',
  categories,
  onConfirm,
  onCancel,
}: AssetCategoryDialogProps) {
  const [selectedId, setSelectedId] = useState(categories[0]?.id ?? '');
  const selectedLabel = useMemo(
    () => categories.find((c) => c.id === selectedId)?.label || '',
    [categories, selectedId]
  );
  const [name, setName] = useState(selectedLabel || '');

  useEffect(() => {
    if (selectedLabel) {
      setName(selectedLabel);
    }
  }, [selectedLabel]);

  const handleConfirm = () => {
    if (!selectedId) {
      alert('Please select a category');
      return;
    }
    if (!name.trim()) {
      alert('Please enter a name');
      return;
    }
    onConfirm(selectedId, name.trim());
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-bg-light border border-border rounded-lg shadow-lg p-6 w-[28rem]">
        <h2 className="font-display text-lg font-bold text-fg-primary mb-4">{title}</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-fg-primary mb-2">Category Type</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full px-3 py-2 bg-bg-dark border border-border rounded text-fg-primary"
            >
              {categories.length === 0 && (
                <option value="" disabled>
                  No categories available
                </option>
              )}
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-fg-primary mb-2">Category Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-bg-dark border border-border rounded text-fg-primary"
              placeholder="Enter category name"
            />
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
            Add Category
          </button>
        </div>
      </div>
    </div>
  );
}
