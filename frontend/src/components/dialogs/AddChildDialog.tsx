import { useState } from 'react';

interface AddChildDialogProps {
  title?: string;
  confirmLabel?: string;
  onConfirm: (childName: string) => void;
  onCancel: () => void;
}

export function AddChildDialog({ title = 'Add Child Node', confirmLabel = 'Add Child', onConfirm, onCancel }: AddChildDialogProps) {
  const [childName, setChildName] = useState('New Child');

  const handleConfirm = () => {
    if (!childName.trim()) {
      alert('Please enter a name');
      return;
    }
    onConfirm(childName.trim());
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-bg-light border border-border rounded-lg shadow-lg p-6 w-96">
        <h2 className="font-display text-lg font-bold text-fg-primary mb-4">{title}</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-fg-primary mb-2">Child Name</label>
            <input
              type="text"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              className="w-full px-3 py-2 bg-bg-dark border border-border rounded text-fg-primary"
              placeholder="Enter child name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm();
                if (e.key === 'Escape') onCancel();
              }}
              autoFocus
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
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
