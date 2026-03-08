import { X, ExternalLink } from 'lucide-react';
import { openExternalUrl } from '../../utils/openExternal';

const GITHUB_URL = 'https://github.com/PipeManMusic/Talus_Tally';
const DOCS_URL = `${GITHUB_URL}#readme`;

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  if (!isOpen) return null;

  // Injected by Vite at build time from tauri.conf.json (see vite.config.ts)
  const version: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--color-bg-light)] border border-[var(--color-border-default)] rounded-lg shadow-xl w-[420px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-default)]">
          <h2 className="text-lg font-semibold text-[var(--color-fg-primary)]">About Talus Tally</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--color-bg-selection)] rounded transition-colors"
            aria-label="Close"
          >
            <X size={20} className="text-[var(--color-fg-secondary)]" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-4 text-center">
          {/* App icon / name */}
          <div>
            <h3 className="text-2xl font-bold text-[var(--color-fg-primary)]">Talus Tally</h3>
            <div className="text-sm text-[var(--color-fg-secondary)] mt-1 font-mono">
              v{version}
            </div>
          </div>

          <p className="text-sm text-[var(--color-fg-secondary)] leading-relaxed">
            A structured project management tool for complex builds.
            Organize parts, tasks, and assets with tree-based hierarchy,
            velocity tracking, budget rollups, and Gantt scheduling.
          </p>

          {/* Links */}
          <div className="flex flex-col items-center gap-2 pt-2">
            <button
              onClick={() => openExternalUrl(GITHUB_URL)}
              className="inline-flex items-center gap-2 text-sm text-[var(--color-accent-primary)] hover:underline"
            >
              <ExternalLink size={14} />
              GitHub Repository
            </button>
            <button
              onClick={() => openExternalUrl(DOCS_URL)}
              className="inline-flex items-center gap-2 text-sm text-[var(--color-accent-primary)] hover:underline"
            >
              <ExternalLink size={14} />
              Documentation
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center px-6 py-4 border-t border-[var(--color-border-default)]">
          <span className="text-xs text-[var(--color-fg-secondary)]">
            &copy; {new Date().getFullYear()} PipeManMusic
          </span>
        </div>
      </div>
    </div>
  );
}
