import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface MenuItem {
  label: string;
  onClick?: () => void;
  submenu?: MenuItem[];
}

interface MenuBarProps {
  menus: Record<string, MenuItem[]>;
}

export function MenuBar({ menus }: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  return (
    <nav className="h-menubar bg-bg-light border-b border-border flex items-center">
      <div className="flex h-full">
        {Object.entries(menus).map(([menuName, items]) => (
          <div key={menuName} className="relative">
            <button
              onClick={() =>
                setOpenMenu(openMenu === menuName ? null : menuName)
              }
              className="h-full px-3 font-display text-sm text-fg-primary hover:text-accent-hover hover:bg-bg-selection transition-colors flex items-center gap-1"
            >
              {menuName}
              {items.length > 0 && (
                <ChevronDown size={12} className="opacity-50" />
              )}
            </button>

            {openMenu === menuName && (
              <div className="absolute top-full left-0 bg-bg-light border border-border rounded-sm mt-0.5 min-w-max z-50 shadow-lg">
                {items.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      item.onClick?.();
                      setOpenMenu(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-bg-selection hover:text-accent-hover transition-colors first:rounded-t-sm last:rounded-b-sm"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
