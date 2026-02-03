import { ChevronRight } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-1 text-sm">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-1">
          {index > 0 && <ChevronRight size={14} className="text-fg-secondary" />}

          {item.onClick || item.href ? (
            <button
              onClick={item.onClick}
              className="text-accent-primary hover:text-accent-hover transition-colors"
            >
              {item.label}
            </button>
          ) : (
            <span className={item.active ? 'text-fg-primary font-semibold' : 'text-fg-secondary'}>
              {item.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
