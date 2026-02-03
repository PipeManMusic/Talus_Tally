import { Minus, Square, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface TitleBarProps {
  title?: string;
  isDirty?: boolean;
  onClose?: () => void;
}

export function TitleBar({
  title = 'TALUS TALLY',
  isDirty = false,
  onClose,
}: TitleBarProps) {
  const appWindow = getCurrentWindow();
  const handleMinimize = async () => {
    try {
      await invoke('minimize_window');
    } catch (e) {
      console.error('Failed to minimize:', e);
    }
  };

  const handleMaximize = async () => {
    try {
      await invoke('maximize_window');
    } catch (e) {
      console.error('Failed to maximize:', e);
    }
  };

  const handleClose = async () => {
    console.log('TitleBar handleClose called, onClose exists:', !!onClose);
    // If custom close handler provided, use that (it will handle dirty check)
    if (onClose) {
      onClose();
      return;
    }
    
    // Default close behavior
    console.log('Using default close behavior');
    try {
      await invoke('exit_app');
    } catch (e) {
      console.error('Failed to close:', e);
    }
  };

  const handleDragStart = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button')) return;
    try {
      await appWindow.startDragging();
    } catch (err) {
      console.warn('Failed to start dragging:', err);
    }
  };
  // Wayland/Tauri window drag support:
  // - The entire header is marked as draggable using data-tauri-drag-region.
  // - This enables window movement on Wayland and other platforms supported by Tauri.
  // - For future platform-specific logic, add detection and fallback here.
  return (
    <header
      className="h-titlebar bg-bg-light border-b-2 border-accent-primary px-3 flex items-center justify-between select-none cursor-move"
      data-tauri-drag-region
      onMouseDown={handleDragStart}
    >
      <div className="flex-1" />

      <h1 className="font-display text-lg font-bold tracking-wide text-fg-primary">
        {title}
      </h1>

      <div className="flex-1 flex justify-end gap-0" style={{ cursor: 'pointer' } as any}>
        <button
          data-tauri-drag-region="false"
          onClick={handleMinimize}
          className="w-10 h-10 flex items-center justify-center hover:bg-bg-selection transition-colors"
          aria-label="Minimize"
          title="Minimize"
        >
          <Minus size={16} className="text-fg-primary" />
        </button>

        <button
          data-tauri-drag-region="false"
          onClick={handleMaximize}
          className="w-10 h-10 flex items-center justify-center hover:bg-bg-selection transition-colors"
          aria-label="Maximize"
          title="Maximize"
        >
          <Square size={16} className="text-fg-primary" />
        </button>

        <button
          data-tauri-drag-region="false"
          onClick={handleClose}
          className="w-10 h-10 flex items-center justify-center hover:bg-status-danger transition-colors"
          aria-label="Close"
          title="Close"
        >
          <X size={16} className="text-fg-primary" />
        </button>
      </div>
    </header>
  );
}
