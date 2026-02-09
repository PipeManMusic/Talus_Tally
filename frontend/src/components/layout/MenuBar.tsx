import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface MenuItem {
  label: string;
  onClick?: () => void;
  submenu?: MenuItem[];
}

interface MenuBarProps {
  menus: Record<string, MenuItem[]>;
}

function MenuItemRenderer({ item, onItemClick, depth = 0 }: { item: MenuItem; onItemClick: () => void; depth?: number }) {
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const isSubmenu = item.submenu && item.submenu.length > 0;
  const isSeparator = item.label === '---';

  if (isSeparator) {
    return <div className="border-t border-border my-1" />;
  }

  return (
    <div className="relative group">
      <button
        onClick={() => {
          if (!isSubmenu) {
            item.onClick?.();
            onItemClick();
          } else {
            setSubmenuOpen(!submenuOpen);
          }
        }}
        onMouseEnter={() => isSubmenu && setSubmenuOpen(true)}
        onMouseLeave={() => isSubmenu && setSubmenuOpen(false)}
        className="w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-bg-selection hover:text-accent-hover transition-colors flex items-center justify-between whitespace-nowrap"
      >
        <span>{item.label}</span>
        {isSubmenu && <ChevronRight size={14} className="ml-2 opacity-50" />}
      </button>

      {isSubmenu && submenuOpen && (
        <div
          className="absolute top-0 left-full bg-bg-light border border-border rounded-sm ml-0.5 min-w-max z-50 shadow-lg"
          onMouseEnter={() => setSubmenuOpen(true)}
          onMouseLeave={() => setSubmenuOpen(false)}
        >
          {item.submenu!.map((subitem, idx) => (
            <MenuItemRenderer
              key={idx}
              item={subitem}
              onItemClick={onItemClick}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MenuBar({ menus }: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className="h-menubar bg-bg-light border-b border-border flex items-center" ref={menuBarRef}>
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
                  <MenuItemRenderer
                    key={idx}
                    item={item}
                    onItemClick={() => setOpenMenu(null)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
