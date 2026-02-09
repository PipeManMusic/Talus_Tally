import { useState, useEffect } from 'react';
import { Download, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { apiClient, type ExportTemplate } from '../../api/client';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
}

export function ExportDialog({ isOpen, onClose, sessionId }: ExportDialogProps) {
  const [templates, setTemplates] = useState<ExportTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    // Check if we're running in Tauri
    const checkTauri = async () => {
      try {
        console.log('[ExportDialog] Checking for Tauri environment...');
        const { isTauri: isTauriApp } = await import('@tauri-apps/api/core');
        const result = isTauriApp();
        console.log('[ExportDialog] isTauri() returned:', result);
        setIsTauri(result);
        if (result) {
          console.log('[ExportDialog] ✓ Tauri environment detected');
        } else {
          console.log('[ExportDialog] ✗ Not in Tauri environment');
        }
      } catch (e) {
        console.log('[ExportDialog] Not in Tauri (dynamic import failed):', e);
        setIsTauri(false);
      }
    };
    
    checkTauri();
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      setError(null);
      setSuccess(null);
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.listExportTemplates();
      setTemplates(data.templates);
      // Auto-select first template if available
      if (data.templates.length > 0 && !selectedTemplate) {
        setSelectedTemplate(data.templates[0].id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to load templates: ${message}`);
      console.error('Failed to load export templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedTemplate || !sessionId) {
      setError('Please select a template');
      return;
    }

    try {
      setDownloading(true);
      setError(null);
      setSuccess(null);

      console.log('[ExportDialog] Starting export...');
      console.log('[ExportDialog] isTauri state:', isTauri);

      // Download the export file as a blob
      const blob = await apiClient.downloadExport(sessionId, selectedTemplate);

      // Generate filename from template
      const template = templates.find((t) => t.id === selectedTemplate);
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = template
        ? `talus-export-${timestamp}.${template.extension}`
        : `talus-export-${timestamp}.txt`;

      if (isTauri) {
        console.log('[ExportDialog] TAKING TAURI PATH');
        try {
          console.log('[ExportDialog] Attempting to use Tauri file dialog...');
          
          // Use dynamic imports like the working implementations in App.tsx and ImportCsvDialog do
          const [{ save }, { writeFile }] = await Promise.all([
            import('@tauri-apps/plugin-dialog'),
            import('@tauri-apps/plugin-fs'),
          ]);
          
          console.log('[ExportDialog] Tauri APIs imported successfully');
          console.log('[ExportDialog] save function type:', typeof save);
          console.log('[ExportDialog] writeFile function type:', typeof writeFile);
          
          const dialogOptions = {
            defaultPath: filename,
            ...(template && {
              filters: [{ name: template.name, extensions: [template.extension] }]
            })
          };
          
          console.log('[ExportDialog] Opening save dialog with options:', JSON.stringify(dialogOptions));
          console.log('[ExportDialog] Calling save() function...');
          
          const filePath = await save(dialogOptions);

          console.log('[ExportDialog] Save dialog returned:', filePath, 'type:', typeof filePath);
          
          if (!filePath) {
            console.log('[ExportDialog] User cancelled save dialog');
            setError('Save cancelled');
            return; // Keep dialog open, let user try again
          }

          // Convert blob to Uint8Array
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);

          console.log('[ExportDialog] Writing file to:', filePath);
          // Write file to the selected path
          await writeFile(filePath, uint8Array);

          console.log('[ExportDialog] File written successfully');
          setSuccess(`Export saved to:\n${filePath}`);

          // Close dialog after success
          setTimeout(() => {
            onClose();
          }, 1000);
        } catch (tauriErr) {
          console.error('[ExportDialog] Tauri error caught:', tauriErr);
          console.error('[ExportDialog] Error type:', tauriErr instanceof Error ? tauriErr.constructor.name : typeof tauriErr);
          if (tauriErr instanceof Error) {
            console.error('[ExportDialog] Error message:', tauriErr.message);
            console.error('[ExportDialog] Error stack:', tauriErr.stack);
          }
          setError(`Tauri error: ${tauriErr instanceof Error ? tauriErr.message : String(tauriErr)}`);
        }
      } else {
        // Browser environment  
        console.log('[ExportDialog] TAKING BROWSER FALLBACK PATH');
        console.log('[ExportDialog] Browser downloads will appear in your Downloads folder');
        handleBrowserDownload(blob, filename);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Export failed: ${message}`);
      console.error('Export failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleBrowserDownload = (blob: Blob, filename: string) => {
    console.log('[ExportDialog handleBrowserDownload] Creating download for:', filename, 'blob size:', blob.size);
    const url = window.URL.createObjectURL(blob);
    console.log('[ExportDialog handleBrowserDownload] Created object URL:', url);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    console.log('[ExportDialog handleBrowserDownload] Created link element, appending to document');
    document.body.appendChild(link);
    console.log('[ExportDialog handleBrowserDownload] Clicking link to trigger download');
    link.click();
    console.log('[ExportDialog handleBrowserDownload] Removing link and revoking URL');
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    console.log('[ExportDialog handleBrowserDownload] Download triggered. File should appear in Downloads folder');
    setSuccess('Export downloaded successfully to Downloads folder!');

    setTimeout(() => {
      onClose();
    }, 1000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export Project Data"
      size="md"
      actions={
        <>
          <Button variant="default" onClick={onClose} disabled={downloading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleDownload}
            disabled={!selectedTemplate || downloading || loading}
          >
            <Download size={16} className="inline mr-2" />
            {downloading ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Debug Info - Show environment */}
        <div className="text-xs text-fg-secondary bg-bg-dark p-2 rounded">
          Environment: {isTauri ? 'Tauri Desktop App' : 'Web Browser'}
          {isTauri && ' - File save dialog should be available'}
        </div>

        {/* Description */}
        <p className="text-sm text-fg-secondary">
          Export your project data in various formats. Select a template below to save your data.
        </p>

        {/* Success Display */}
        {success && (
          <div className="flex items-start gap-2 p-3 bg-status-success/10 border border-status-success rounded-sm">
            <CheckCircle size={18} className="text-status-success mt-0.5 flex-shrink-0" />
            <div className="text-sm text-fg-primary whitespace-pre-wrap">{success}</div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-status-danger/10 border border-status-danger rounded-sm">
            <AlertCircle size={18} className="text-status-danger mt-0.5 flex-shrink-0" />
            <div className="text-sm text-fg-primary">{error}</div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-8 text-fg-secondary">
            <div className="text-sm">Loading templates...</div>
          </div>
        )}

        {/* Template Selection */}
        {!loading && templates.length === 0 && (
          <div className="text-center py-8 text-fg-secondary">
            <FileText size={48} className="mx-auto mb-3 opacity-30" />
            <div className="text-sm">No export templates available</div>
            <div className="text-xs mt-1">
              Add .j2 templates to <code className="text-xs bg-bg-dark px-1 py-0.5 rounded">data/templates/exports</code>
            </div>
          </div>
        )}

        {!loading && templates.length > 0 && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-fg-primary mb-2">
                Select Export Format
              </label>
              <select
                value={selectedTemplate || ''}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full px-3 py-2 bg-bg-dark border border-border rounded-sm text-fg-primary text-sm focus:outline-none focus:border-accent-primary transition-colors"
              >
                <option value="">Choose a template...</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} (.{template.extension})
                  </option>
                ))}
              </select>
            </div>

            {/* Selected Template Details */}
            {selectedTemplate && (
              <div className="p-3 bg-bg-dark border border-accent-primary/30 rounded-sm">
                {templates.find((t) => t.id === selectedTemplate) && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-accent-primary" />
                      <div>
                        <div className="font-medium text-fg-primary text-sm">
                          {templates.find((t) => t.id === selectedTemplate)?.name}
                        </div>
                        <div className="text-xs text-fg-secondary mt-0.5">
                          Format: <code className="text-xs bg-bg-light px-1 py-0.5 rounded">
                            .{templates.find((t) => t.id === selectedTemplate)?.extension}
                          </code>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Additional Info */}
        {!loading && templates.length > 0 && (
          <div className="text-xs text-fg-secondary bg-bg-dark p-3 rounded-sm">
            <strong>Note:</strong> The export will include all nodes from your current project graph.
            Depending on the template, only relevant node types will be included in the output.
          </div>
        )}
      </div>
    </Modal>
  );
}
