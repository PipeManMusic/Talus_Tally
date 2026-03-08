import { useState, useRef, useEffect } from 'react';

interface PopoverProps {
  content: React.ReactNode;
  trigger: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Close the popover imperatively (e.g. after a selection). */
  closeRef?: React.MutableRefObject<(() => void) | null>;
}

const positions = {
  top: 'bottom-full mb-2',
  bottom: 'top-full mt-2',
  left: 'right-full mr-2',
  right: 'left-full ml-2',
};

export function Popover({ content, trigger, position = 'bottom', closeRef }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Expose an imperative close handle so parents can close the popover
  useEffect(() => {
    if (closeRef) {
      closeRef.current = () => setOpen(false);
    }
    return () => {
      if (closeRef) closeRef.current = null;
    };
  }, [closeRef]);

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
