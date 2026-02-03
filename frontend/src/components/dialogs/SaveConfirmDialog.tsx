import { useState } from 'react';

export type SaveAction = 'save' | 'save-as' | 'dont-save' | 'cancel';

interface SaveConfirmDialogProps {
  onConfirm?: (action: SaveAction) => void;
  onCancel?: () => void;
  isOpen?: boolean;
}

export function SaveConfirmDialog({
  onConfirm,
  onCancel,
  isOpen = true,
}: SaveConfirmDialogProps) {
  const [selectedAction, setSelectedAction] = useState<SaveAction>('cancel');

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm?.(selectedAction);
  };

  const handleCancel = () => {
    onCancel?.();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bg-light border border-border rounded-lg shadow-lg max-w-md w-full mx-4">
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-display text-lg font-bold text-fg-primary">
            Unsaved Changes
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <p className="text-fg-primary mb-6">
            You have unsaved changes. What would you like to do?
          </p>

          <div className="space-y-3">
            <label className="flex items-center p-3 border border-border rounded hover:bg-bg-selection cursor-pointer transition-colors">
              <input
                type="radio"
                name="action"
                value="save"
                checked={selectedAction === 'save'}
                onChange={(e) => setSelectedAction(e.target.value as SaveAction)}
                className="mr-3"
              />
              <span className="text-fg-primary font-semibold">Save</span>
              <span className="text-fg-secondary text-sm ml-2">(Ctrl+S)</span>
            </label>

            <label className="flex items-center p-3 border border-border rounded hover:bg-bg-selection cursor-pointer transition-colors">
              <input
                type="radio"
                name="action"
                value="save-as"
                checked={selectedAction === 'save-as'}
                onChange={(e) => setSelectedAction(e.target.value as SaveAction)}
                className="mr-3"
              />
              <span className="text-fg-primary font-semibold">Save As</span>
              <span className="text-fg-secondary text-sm ml-2">(Save to new location)</span>
            </label>

            <label className="flex items-center p-3 border border-border rounded hover:bg-bg-selection cursor-pointer transition-colors">
              <input
                type="radio"
                name="action"
                value="dont-save"
                checked={selectedAction === 'dont-save'}
                onChange={(e) => setSelectedAction(e.target.value as SaveAction)}
                className="mr-3"
              />
              <span className="text-fg-primary font-semibold">Don't Save</span>
              <span className="text-fg-secondary text-sm ml-2">(Discard changes)</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 bg-bg-dark text-fg-primary border border-border rounded hover:bg-bg-selection transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-accent-primary text-bg-dark font-semibold rounded hover:opacity-90 transition-opacity"
          >
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}
