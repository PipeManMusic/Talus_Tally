import { useState, useRef, useEffect } from 'react';

interface PopoverProps {
  content: React.ReactNode;
  trigger: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const positions = {
  top: 'bottom-full mb-2',
  bottom: 'top-full mt-2',
  left: 'right-full mr-2',
  right: 'left-full ml-2',
};

export function Popover({ content, trigger, position = 'bottom' }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="focus:outline-none"
      >
        {trigger}
      </button>

      {open && (
        <div
          className={`
            absolute ${positions[position]}
            bg-bg-light border border-border rounded-sm
            shadow-lg z-50 min-w-max
          `}
        >
          {content}
        </div>
      )}
    </div>
  );
}
