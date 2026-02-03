import { useState } from 'react';
import type { Template } from '../../api/client';

interface NewProjectDialogProps {
  templates: Template[];
  onConfirm: (templateId: string, projectName: string) => void;
  onCancel: () => void;
  title?: string;
  confirmLabel?: string;
}

export function NewProjectDialog({
  templates,
  onConfirm,
  onCancel,
  title = 'New Project',
  confirmLabel = 'Create',
}: NewProjectDialogProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>(templates[0]?.id || '');
  const [projectName, setProjectName] = useState('New Project');

  const handleConfirm = () => {
    if (!selectedTemplate || !projectName.trim()) {
      alert('Please select a template and enter a project name');
      return;
    }
    onConfirm(selectedTemplate, projectName);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-bg-light border border-border rounded-lg shadow-lg p-6 w-96">
        <h2 className="font-display text-lg font-bold text-fg-primary mb-4">{title}</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-fg-primary mb-2">Template</label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full px-3 py-2 bg-bg-dark border border-border rounded text-fg-primary"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {templates.find((t) => t.id === selectedTemplate)?.description && (
              <p className="text-xs text-fg-secondary mt-1">
                {templates.find((t) => t.id === selectedTemplate)?.description}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm text-fg-primary mb-2">Project Name</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full px-3 py-2 bg-bg-dark border border-border rounded text-fg-primary"
              placeholder="Enter project name"
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
