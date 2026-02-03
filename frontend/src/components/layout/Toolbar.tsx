import React from 'react';
import { Plus, Save, Undo2, Redo2 } from 'lucide-react';
import { Button } from '../ui/Button';

export interface ToolbarButton {
  id: string;
  label: string;
  icon: React.ReactNode | null;
  onClick: () => void;
  disabled?: boolean;
}

interface ToolbarProps {
  buttons?: ToolbarButton[];
}

const defaultButtons: ToolbarButton[] = [
  {
    id: 'new',
    label: 'New',
    icon: <Plus size={16} />,
    onClick: () => console.log('New project'),
  },
  {
    id: 'save',
    label: 'Save',
    icon: <Save size={16} />,
    onClick: () => console.log('Save project'),
  },
  {
    id: 'separator1',
    label: '',
    icon: null,
    onClick: () => {},
  },
  {
    id: 'undo',
    label: 'Undo',
    icon: <Undo2 size={16} />,
    onClick: () => console.log('Undo'),
  },
  {
    id: 'redo',
    label: 'Redo',
    icon: <Redo2 size={16} />,
    onClick: () => console.log('Redo'),
  },
];

export function Toolbar({ buttons = defaultButtons }: ToolbarProps) {
  return (
    <div className="h-toolbar bg-bg-light border-b border-border px-2 flex items-center gap-2">
      {buttons.map((btn) => {
        if (btn.id.includes('separator')) {
          return <div key={btn.id} className="w-px h-6 bg-border mx-1" />;
        }

        return (
          <Button
            key={btn.id}
            onClick={btn.onClick}
            disabled={btn.disabled}
            variant="default"
            size="sm"
            title={btn.label}
            className="flex items-center gap-1"
          >
            {btn.icon}
            <span className="hidden sm:inline">{btn.label}</span>
          </Button>
        );
      })}

      <div className="flex-1" />
    </div>
  );
}
